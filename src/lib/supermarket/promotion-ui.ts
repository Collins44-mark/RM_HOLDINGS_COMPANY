/** Map DB promotions into the UI Promotion shape used by existing helpers. */

import type { Promotion as UiPromotion, PromotionType } from "@/lib/data/sample-supermarket-promotions";
import type { Promotion as DbPromotion } from "@/lib/supermarket/types";

export function toUiPromotion(item: DbPromotion): UiPromotion {
  const targetType =
    item.targetType === "CATEGORIES" ? "CATEGORY" : item.targetType === "PRODUCTS" ? "PRODUCTS" : "ALL_PRODUCTS";

  const tiers = Array.isArray(item.tiers) ? item.tiers : [];

  return {
    id: item.id,
    name: item.name ?? "",
    description: item.description ?? "",
    type: (item.type || "PERCENTAGE") as PromotionType,
    targetType,
    productIds: Array.isArray(item.productIds) ? item.productIds : [],
    categoryIds: Array.isArray(item.categoryIds) ? item.categoryIds : [],
    startDate: item.startDate ?? "",
    endDate: item.endDate ?? "",
    status: item.isPaused ? "INACTIVE" : "ACTIVE",
    allowMultipleUse: Boolean(item.allowMultipleUse),
    usageLimitEnabled: Boolean(item.usageLimitEnabled),
    usageLimit: item.usageLimit ?? null,
    rule: {
      buyQuantity: item.buyQuantity ?? undefined,
      freeQuantity: item.freeQuantity ?? undefined,
      discountPercent: item.discountPercent ?? undefined,
      discountAmount: item.discountAmount ?? undefined,
      requiredQuantity: item.requiredQuantity ?? undefined,
      fixedPrice: item.fixedPrice ?? undefined,
      bundlePrice: item.bundlePrice ?? undefined,
      minimumSpend: item.minimumSpend ?? undefined,
      tiers: tiers.map((tier) => ({
        id: tier.id,
        minimumSpend: Number(tier.minimumSpend) || 0,
        discountPercent: Number(tier.discountPercent) || 0,
      })),
    },
  };
}
