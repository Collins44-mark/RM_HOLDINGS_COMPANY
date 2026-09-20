"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { glassCard, primaryButton } from "@/components/supermarket/purchasing-ui";
import { PromotionFormPage } from "@/components/supermarket/promotions/PromotionFormPage";
import {
  getPromotionsSnapshot,
  subscribePromotions,
} from "@/lib/data/sample-supermarket-promotions";

export function PromotionEditPage({ promotionId }: { promotionId: string }) {
  const items = useSyncExternalStore(subscribePromotions, getPromotionsSnapshot, getPromotionsSnapshot);
  const promotion = items.find((item) => item.id === promotionId) ?? null;

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

  return <PromotionFormPage mode="edit" initial={promotion} />;
}
