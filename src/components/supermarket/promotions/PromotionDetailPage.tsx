"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { glassCard, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PromotionConfirmDialog } from "@/components/supermarket/promotions/PromotionConfirmDialog";
import {
  effectivePromotionStatus,
  formatPromotionDate,
  promotionAppliesLabel,
  promotionRuleSummary,
  promotionStatusLabel,
  promotionTypeLabel,
  type PromotionStatus,
} from "@/lib/data/sample-supermarket-promotions";
import { useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { pausePromotion, savePromotion, useSupermarketPromotions } from "@/lib/supermarket/client-stores";
import { toUiPromotion } from "@/lib/supermarket/promotion-ui";

function statusBadgeClass(status: PromotionStatus) {
  if (status === "ACTIVE") return "bg-[#e7f4ea] text-[#3f8a5a]";
  if (status === "SCHEDULED") return "bg-[#eef2f7] text-[#5b6b7c]";
  if (status === "EXPIRED") return "bg-[#fff2f3] text-[#c45b66]";
  return "bg-[#f3f6fa] text-slate-500";
}

const detailCard =
  "rounded-[24px] border border-white/80 bg-white/82 px-5 py-5 shadow-[0_12px_36px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:px-6";

export function PromotionDetailPage({ promotionId }: { promotionId: string }) {
  const router = useRouter();
  const live = useSupermarketPromotions();
  const inventory = useSupermarketInventory();
  const promotion = useMemo(
    () => live.promotions.map(toUiPromotion).find((item) => item.id === promotionId) ?? null,
    [live.promotions, promotionId],
  );
  const [confirm, setConfirm] = useState<"deactivate" | "activate" | "cancel" | null>(null);

  if (!live.loaded) {
    return (
      <div className="space-y-5 pb-10">
        <PageBackButton href="/supermarket/promotions" prefetch />
        <div className={cn(glassCard, "px-5 py-10 text-center")}>
          <p className="text-[13.5px] text-slate-500">Loading promotion…</p>
        </div>
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="space-y-5 pb-10">
        <PageBackButton href="/supermarket/promotions" prefetch />
        <div className={cn(glassCard, "px-5 py-10 text-center")}>
          <p className="text-[15px] font-semibold text-navy">Promotion not found</p>
          <p className="mt-1.5 text-[13.5px] text-slate-500">{live.error ?? "It may have been deleted."}</p>
          <Link href="/supermarket/promotions" className={cn(primaryButton, "mt-5 inline-flex")}>
            Back to Promotions
          </Link>
        </div>
      </div>
    );
  }

  const status = effectivePromotionStatus(promotion);
  const productNames = promotion.productIds
    .map((id) => inventory.products.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const categoryNames = promotion.categoryIds
    .map((id) => inventory.categories.find((c) => c.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="page-enter min-w-0 space-y-3.5 pb-10 sm:space-y-4">
      <PageBackButton href="/supermarket/promotions" prefetch />
      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
            Promotion Details
          </h1>
          <p className="mt-1.5 text-[15px] font-medium text-navy">{promotion.name}</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            {promotion.description || "Promotion details"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/supermarket/promotions/${promotion.id}/edit`}
            prefetch
            className={cn(secondaryButton, "w-full sm:w-auto")}
          >
            Edit
          </Link>
          {status === "EXPIRED" ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const result = await savePromotion({
                    name: `${promotion.name} (Copy)`,
                    description: promotion.description,
                    typeCode: promotion.type,
                    targetType:
                      promotion.targetType === "CATEGORY"
                        ? "CATEGORIES"
                        : promotion.targetType === "ALL_PRODUCTS"
                          ? "ALL_PRODUCTS"
                          : "PRODUCTS",
                    productIds: promotion.productIds,
                    categoryIds: promotion.categoryIds,
                    startDate: promotion.startDate,
                    endDate: promotion.endDate,
                    isPaused: true,
                    allowMultipleUse: promotion.allowMultipleUse,
                    usageLimitEnabled: promotion.usageLimitEnabled,
                    usageLimit: promotion.usageLimit,
                    buyQuantity: promotion.rule.buyQuantity ?? null,
                    freeQuantity: promotion.rule.freeQuantity ?? null,
                    discountPercent: promotion.rule.discountPercent ?? null,
                    discountAmount: promotion.rule.discountAmount ?? null,
                    requiredQuantity: promotion.rule.requiredQuantity ?? null,
                    fixedPrice: promotion.rule.fixedPrice ?? null,
                    bundlePrice: promotion.rule.bundlePrice ?? null,
                    minimumSpend: promotion.rule.minimumSpend ?? null,
                    tiers: (promotion.rule.tiers ?? []).map((tier, index) => ({
                      minimumSpend: tier.minimumSpend,
                      discountPercent: tier.discountPercent,
                      sortOrder: index,
                    })),
                  });
                  if (result.ok) router.push(`/supermarket/promotions/${result.id}/edit`);
                })();
              }}
              className={cn(primaryButton, "w-full sm:w-auto")}
            >
              Duplicate
            </button>
          ) : null}
          {status === "ACTIVE" ? (
            <button type="button" onClick={() => setConfirm("deactivate")} className={cn(primaryButton, "w-full sm:w-auto")}>
              Deactivate
            </button>
          ) : null}
          {status === "SCHEDULED" ? (
            <button type="button" onClick={() => setConfirm("cancel")} className={cn(primaryButton, "w-full sm:w-auto")}>
              Cancel
            </button>
          ) : null}
          {status === "INACTIVE" ? (
            <button type="button" onClick={() => setConfirm("activate")} className={cn(primaryButton, "w-full sm:w-auto")}>
              Activate
            </button>
          ) : null}
        </div>
      </header>

      <div className="mt-2 grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.85fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Promotion Information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Promotion Type" value={promotionTypeLabel(promotion.type)} />
              <Detail label="Applies To" value={promotionAppliesLabel(promotion)} />
              <Detail
                label="Target Type"
                value={
                  promotion.targetType === "ALL_PRODUCTS"
                    ? "All Products"
                    : promotion.targetType === "CATEGORY"
                      ? "Product Category"
                      : "Specific Products"
                }
              />
            </div>
          </section>

          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Selected Products</h2>
            {productNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {productNames.map((name) => (
                  <span key={name} className="inline-flex rounded-full border border-[#e7ecf3] bg-[#f8fafc] px-3 py-1.5 text-[12.5px] font-medium text-navy">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-slate-400">No specific products selected.</p>
            )}
          </section>

          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Selected Categories</h2>
            {categoryNames.length > 0 ? (
              <p className="mt-2 text-[13.5px] text-navy">{categoryNames.join(", ")}</p>
            ) : (
              <p className="mt-2 text-[13.5px] text-slate-400">No category selected.</p>
            )}
          </section>

          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Promotion Rule</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-navy">{promotionRuleSummary(promotion)}</p>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Status</h2>
            <span className={cn("mt-3 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", statusBadgeClass(status))}>
              {promotionStatusLabel(status)}
            </span>
          </section>

          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Validity</h2>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <Detail label="Start Date" value={formatPromotionDate(promotion.startDate)} />
              <Detail label="End Date" value={formatPromotionDate(promotion.endDate)} />
            </div>
          </section>

          <section className={detailCard}>
            <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Usage Settings</h2>
            <ul className="mt-2 space-y-1.5 text-[13.5px] text-navy">
              <li>
                Multiple use per customer:{" "}
                <span className="font-medium">{promotion.allowMultipleUse ? "Allowed" : "Not allowed"}</span>
              </li>
              <li>
                Limit total usage:{" "}
                <span className="font-medium">
                  {promotion.usageLimitEnabled
                    ? `Yes · max ${promotion.usageLimit?.toLocaleString("en-US") ?? "—"}`
                    : "No"}
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <PromotionConfirmDialog
        open={confirm === "deactivate"}
        title="Deactivate Promotion?"
        message="This promotion will stop applying until activated again."
        confirmLabel="Deactivate"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void pausePromotion(promotion.id, true).then(() => setConfirm(null));
        }}
      />
      <PromotionConfirmDialog
        open={confirm === "cancel"}
        title="Cancel Scheduled Promotion?"
        message="This scheduled promotion will be deactivated and will not start automatically."
        confirmLabel="Cancel Promotion"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void pausePromotion(promotion.id, true).then(() => setConfirm(null));
        }}
      />
      <PromotionConfirmDialog
        open={confirm === "activate"}
        title="Activate Promotion?"
        message="This promotion will become available again according to its validity dates."
        confirmLabel="Activate"
        tone="default"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void pausePromotion(promotion.id, false);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-navy">{value}</p>
    </div>
  );
}
