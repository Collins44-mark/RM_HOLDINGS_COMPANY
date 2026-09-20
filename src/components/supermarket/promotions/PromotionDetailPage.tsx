"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { glassCard, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PromotionConfirmDialog } from "@/components/supermarket/promotions/PromotionConfirmDialog";
import {
  formatPromotionDate,
  getPromotionsSnapshot,
  promotionAppliesLabel,
  promotionRuleSummary,
  promotionStatusLabel,
  promotionTypeLabel,
  resolvePromotionCategoryNames,
  resolvePromotionProductNames,
  setPromotionStatus,
  subscribePromotions,
  type PromotionStatus,
} from "@/lib/data/sample-supermarket-promotions";

function statusBadgeClass(status: PromotionStatus) {
  if (status === "ACTIVE") return "bg-[#e7f4ea] text-[#3f8a5a]";
  if (status === "SCHEDULED") return "bg-[#eef2f7] text-[#5b6b7c]";
  if (status === "EXPIRED") return "bg-[#fff2f3] text-[#c45b66]";
  return "bg-[#f3f6fa] text-slate-500";
}

export function PromotionDetailPage({ promotionId }: { promotionId: string }) {
  const items = useSyncExternalStore(subscribePromotions, getPromotionsSnapshot, getPromotionsSnapshot);
  const promotion = items.find((item) => item.id === promotionId) ?? null;
  const [confirm, setConfirm] = useState<"deactivate" | "activate" | null>(null);

  if (!promotion) {
    return (
      <div className="space-y-5 pb-10">
        <PageBackButton href="/supermarket/promotions" prefetch />
        <div className={cn(glassCard, "px-5 py-10 text-center")}>
          <p className="text-[15px] font-semibold text-navy">Promotion not found</p>
          <p className="mt-1.5 text-[13.5px] text-slate-500">It may have been deleted from the local list.</p>
          <Link href="/supermarket/promotions" className={cn(primaryButton, "mt-5 inline-flex")}>
            Back to Promotions
          </Link>
        </div>
      </div>
    );
  }

  const productNames = resolvePromotionProductNames(promotion.productIds);
  const categoryNames = resolvePromotionCategoryNames(promotion.categoryIds);
  const canActivate = promotion.status === "SCHEDULED" || promotion.status === "INACTIVE";
  const canDeactivate = promotion.status === "ACTIVE";

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <PageBackButton href="/supermarket/promotions" prefetch />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-400">
            Supermarket <span className="mx-1.5 text-slate-300">›</span>{" "}
            <span className="text-slate-400">Promotions</span>
            <span className="mx-1.5 text-slate-300">›</span>{" "}
            <span className="text-slate-500">Promotion Details</span>
          </p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
            {promotion.name}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-slate-500">
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
          {canDeactivate ? (
            <button
              type="button"
              onClick={() => setConfirm("deactivate")}
              className={cn(primaryButton, "w-full sm:w-auto")}
            >
              Deactivate
            </button>
          ) : null}
          {canActivate ? (
            <button
              type="button"
              onClick={() => setConfirm("activate")}
              className={cn(primaryButton, "w-full sm:w-auto")}
            >
              Activate
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <section className={cn(glassCard, "px-4 py-5 sm:px-5")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Promotion Type" value={promotionTypeLabel(promotion.type)} />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Status</p>
              <span
                className={cn(
                  "mt-1.5 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium",
                  statusBadgeClass(promotion.status),
                )}
              >
                {promotionStatusLabel(promotion.status)}
              </span>
            </div>
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
            <Detail label="Start Date" value={formatPromotionDate(promotion.startDate)} />
            <Detail label="End Date" value={formatPromotionDate(promotion.endDate)} />
          </div>
        </section>

        <section className={cn(glassCard, "px-4 py-5 sm:px-5")}>
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Selected Products</h2>
          {productNames.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {productNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex rounded-full border border-[#e7ecf3] bg-[#f8fafc] px-3 py-1.5 text-[12.5px] font-medium text-navy"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13.5px] text-slate-400">No specific products selected.</p>
          )}
        </section>

        <section className={cn(glassCard, "px-4 py-5 sm:px-5")}>
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Selected Category</h2>
          {categoryNames.length > 0 ? (
            <p className="mt-2 text-[13.5px] text-navy">{categoryNames.join(", ")}</p>
          ) : (
            <p className="mt-2 text-[13.5px] text-slate-400">No category selected.</p>
          )}
        </section>

        <section className={cn(glassCard, "px-4 py-5 sm:px-5")}>
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">Promotion Rule</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-navy">{promotionRuleSummary(promotion)}</p>
        </section>

        <section className={cn(glassCard, "px-4 py-5 sm:px-5")}>
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

      <PromotionConfirmDialog
        open={confirm === "deactivate"}
        title="Deactivate Promotion?"
        message="This promotion will stop applying at POS until activated again."
        confirmLabel="Deactivate"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setPromotionStatus(promotion.id, "INACTIVE");
          setConfirm(null);
        }}
      />
      <PromotionConfirmDialog
        open={confirm === "activate"}
        title="Activate Promotion?"
        message="This promotion will become active and apply according to its rules."
        confirmLabel="Activate"
        tone="default"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setPromotionStatus(promotion.id, "ACTIVE");
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
