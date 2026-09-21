/** Map DB promotions into the UI Promotion shape used by existing helpers. */

import type { Promotion as UiPromotion, PromotionType } from "@/lib/data/sample-supermarket-promotions";
import type { Promotion as DbPromotion } from "@/lib/supermarket/types";

export function toUiPromotion(item: DbPromotion): UiPromotion {
  const targetType =
    item.targetType === "CATEGORIES" ? "CATEGORY" : item.targetType === "PRODUCTS" ? "PRODUCTS" : "ALL_PRODUCTS";

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type as PromotionType,
    targetType,
    productIds: item.productIds,
    categoryIds: item.categoryIds,
    startDate: item.startDate,
    endDate: item.endDate,
    status: item.isPaused ? "INACTIVE" : "ACTIVE",
    allowMultipleUse: item.allowMultipleUse,
    usageLimitEnabled: item.usageLimitEnabled,
    usageLimit: item.usageLimit,
    rule: {
      buyQuantity: item.buyQuantity ?? undefined,
      freeQuantity: item.freeQuantity ?? undefined,
      discountPercent: item.discountPercent ?? undefined,
      discountAmount: item.discountAmount ?? undefined,
      requiredQuantity: item.requiredQuantity ?? undefined,
      fixedPrice: item.fixedPrice ?? undefined,
      bundlePrice: item.bundlePrice ?? undefined,
      minimumSpend: item.minimumSpend ?? undefined,
      tiers: item.tiers.map((tier) => ({
        id: tier.id,
        minimumSpend: tier.minimumSpend,
        discountPercent: tier.discountPercent,
      })),
    },
  };
}
