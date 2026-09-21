"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { glassCard, primaryButton } from "@/components/supermarket/purchasing-ui";
import { PromotionFormPage } from "@/components/supermarket/promotions/PromotionFormPage";
import { useSupermarketPromotions } from "@/lib/supermarket/client-stores";
import { toUiPromotion } from "@/lib/supermarket/promotion-ui";

export function PromotionEditPage({ promotionId }: { promotionId: string }) {
  const live = useSupermarketPromotions();
  const promotion = useMemo(
    () => live.promotions.map(toUiPromotion).find((item) => item.id === promotionId) ?? null,
    [live.promotions, promotionId],
  );

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
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            {live.error ?? "It may have been deleted."}
          </p>
          <Link href="/supermarket/promotions" className={cn(primaryButton, "mt-5 inline-flex")}>
            Back to Promotions
          </Link>
        </div>
      </div>
    );
  }

  return <PromotionFormPage mode="edit" initial={promotion} />;
}
