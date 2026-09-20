"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { secondaryButton } from "@/components/supermarket/purchasing-ui";
import {
  formatPromotionDate,
  promotionStatusLabel,
  promotionTypeLabel,
  type Promotion,
} from "@/lib/data/sample-supermarket-promotions";

function ruleSummary(item: Promotion) {
  const { rules, type } = item;
  if (type === "BUY_X_GET_Y") {
    return `Buy ${rules.buyQuantity ?? 0} Get ${rules.freeQuantity ?? 0}${
      rules.applyToAllVariants ? " · All variants" : ""
    }`;
  }
  if (type === "PERCENTAGE") return `${rules.discountPercent ?? 0}% off`;
  if (type === "FIXED_AMOUNT") {
    return `TZS ${(rules.discountAmount ?? 0).toLocaleString("en-US")} off`;
  }
  if (type === "FIXED_PRICE") {
    return `Buy ${rules.requiredQuantity ?? 0} for TZS ${(rules.fixedPrice ?? 0).toLocaleString("en-US")}`;
  }
  if (type === "BUNDLE") {
    const products = (rules.bundleProductLabels ?? []).join(", ");
    return `Bundle${products ? `: ${products}` : ""} · TZS ${(rules.bundlePrice ?? 0).toLocaleString("en-US")}`;
  }
  if (type === "MINIMUM_SPEND") {
    return `Spend TZS ${(rules.minimumSpend ?? 0).toLocaleString("en-US")} · Get TZS ${(rules.discountAmount ?? 0).toLocaleString("en-US")} off`;
  }
  if (type === "TIERED") {
    return (rules.tiers ?? [])
      .map((tier) => `TZS ${tier.minimumSpend.toLocaleString("en-US")} → ${tier.discountPercent}%`)
      .join(" · ");
  }
  return item.description;
}

function statusTone(status: Promotion["status"]) {
  if (status === "ACTIVE") return "bg-[#e7f4ea] text-[#3f8a5a]";
  if (status === "SCHEDULED") return "bg-[#eef2f7] text-[#5b6b7c]";
  if (status === "EXPIRED") return "bg-[#fff2f3] text-[#c45b66]";
  return "bg-[#f3f6fa] text-slate-500";
}

export function PromotionViewDrawer({
  promotion,
  onClose,
}: {
  promotion: Promotion;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const appliesTo =
    promotion.applicableCount != null
      ? `${promotion.applicableLabel} · ${promotion.applicableCount} products`
      : promotion.applicableLabel;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#0b2244]/25 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close drawer" onClick={onClose} />
      <div className="relative z-[81] flex h-full w-full max-w-[min(28rem,100vw)] flex-col border-l border-[#e7ecf3] bg-white shadow-[-12px_0_40px_rgba(15,35,64,0.12)] sm:max-w-[420px]">
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-5 py-4">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Promotion Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-[#f3f6fa] hover:text-navy"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Promotion Name</p>
            <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-navy">{promotion.name}</p>
          </div>
          <Detail label="Description" value={promotion.description || "—"} />
          <Detail label="Promotion Type" value={promotionTypeLabel(promotion.type)} />
          <Detail label="Applicable Products / Categories" value={appliesTo} />
          <Detail label="Promotion Rule" value={ruleSummary(promotion) || "—"} />
          <div className="grid grid-cols-2 gap-4">
            <Detail label="Start Date" value={formatPromotionDate(promotion.startDate)} />
            <Detail label="End Date" value={formatPromotionDate(promotion.endDate)} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Status</p>
            <span
              className={cn(
                "mt-1.5 inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium",
                statusTone(promotion.status),
              )}
            >
              {promotionStatusLabel(promotion.status)}
            </span>
          </div>
          <div className="rounded-[16px] border border-[#eef2f7] bg-[#f8fafc] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Usage settings</p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-navy">
              <li>
                Multiple use per customer:{" "}
                <span className="font-medium">{promotion.allowMultipleUse ? "Allowed" : "Not allowed"}</span>
              </li>
              <li>
                Limit total usage:{" "}
                <span className="font-medium">
                  {promotion.limitTotalUsage
                    ? `Yes · max ${promotion.maximumUses?.toLocaleString("en-US") ?? "—"}`
                    : "No"}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#eef2f7] px-5 py-4">
          <button type="button" onClick={onClose} className={cn(secondaryButton, "w-full")}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
