export type PromotionStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";

export type PromotionType =
  | "PERCENTAGE"
  | "FIXED_AMOUNT"
  | "BUY_X_GET_Y"
  | "FIXED_PRICE"
  | "BUNDLE"
  | "MINIMUM_SPEND"
  | "TIERED";

export type PromotionTargetKind = "PRODUCT" | "CATEGORY" | "ALL";

export type PromotionTier = {
  id: string;
  minimumSpend: number;
  discountPercent: number;
};

export type PromotionRules = {
  buyQuantity?: number;
  freeQuantity?: number;
  applyToAllVariants?: boolean;
  discountPercent?: number;
  discountAmount?: number;
  requiredQuantity?: number;
  fixedPrice?: number;
  bundlePrice?: number;
  bundleProductLabels?: string[];
  minimumSpend?: number;
  tiers?: PromotionTier[];
};

export type Promotion = {
  id: string;
  name: string;
  description: string;
  type: PromotionType;
  status: PromotionStatus;
  applicableLabel: string;
  applicableCount: number | null;
  targetKind: PromotionTargetKind;
  targetIds: string[];
  startDate: string;
  endDate: string;
  allowMultipleUse: boolean;
  limitTotalUsage: boolean;
  maximumUses: number | null;
  rules: PromotionRules;
};

export const PROMOTION_TYPE_OPTIONS: { value: PromotionType; label: string }[] = [
  { value: "PERCENTAGE", label: "Percentage Discount" },
  { value: "FIXED_AMOUNT", label: "Fixed Amount Discount" },
  { value: "BUY_X_GET_Y", label: "Buy X Get Y" },
  { value: "FIXED_PRICE", label: "Buy X for Fixed Price" },
  { value: "BUNDLE", label: "Bundle / Combo" },
  { value: "MINIMUM_SPEND", label: "Minimum Spend" },
  { value: "TIERED", label: "Tiered Discount" },
];

export const MOCK_PROMOTION_PRODUCTS = [
  { id: "prod-soda-500", label: "Soda 500ml", kind: "PRODUCT" as const },
  { id: "prod-sugar-1kg", label: "Azam Sugar 1kg", kind: "PRODUCT" as const },
  { id: "prod-milk-500", label: "Milk 500ml", kind: "PRODUCT" as const },
  { id: "prod-rice-oil-beans", label: "Rice + Oil + Beans", kind: "PRODUCT" as const },
];

export const MOCK_PROMOTION_CATEGORIES = [
  { id: "cat-chips", label: "All Chips", kind: "CATEGORY" as const },
  { id: "cat-personal-care", label: "Personal Care", kind: "CATEGORY" as const },
  { id: "cat-cosmetics", label: "Cosmetics", kind: "CATEGORY" as const },
  { id: "cat-beverages", label: "Beverages", kind: "CATEGORY" as const },
  { id: "cat-all", label: "All Products", kind: "ALL" as const },
];

export function promotionTypeLabel(type: PromotionType) {
  return PROMOTION_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

export function promotionTypeShortLabel(type: PromotionType) {
  switch (type) {
    case "PERCENTAGE":
      return "Percentage";
    case "FIXED_AMOUNT":
      return "Fixed Amount";
    case "BUY_X_GET_Y":
      return "Buy X Get Y";
    case "FIXED_PRICE":
      return "Fixed Price";
    case "BUNDLE":
      return "Bundle";
    case "MINIMUM_SPEND":
      return "Minimum Spend";
    case "TIERED":
      return "Tiered";
    default:
      return type;
  }
}

export function promotionStatusLabel(status: PromotionStatus) {
  if (status === "ACTIVE") return "Active";
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "EXPIRED") return "Expired";
  return "Inactive";
}

export function formatPromotionDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function seedPromotions(): Promotion[] {
  return [
    {
      id: "promo-001",
      name: "Weekend Soda Offer",
      description: "Buy 2 Get 1 Free",
      type: "BUY_X_GET_Y",
      status: "ACTIVE",
      applicableLabel: "Soda 500ml",
      applicableCount: 3,
      targetKind: "PRODUCT",
      targetIds: ["prod-soda-500"],
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { buyQuantity: 2, freeQuantity: 1, applyToAllVariants: true },
    },
    {
      id: "promo-002",
      name: "Sugar Discount",
      description: "10% off on 1kg sugar",
      type: "PERCENTAGE",
      status: "ACTIVE",
      applicableLabel: "Azam Sugar 1kg",
      applicableCount: null,
      targetKind: "PRODUCT",
      targetIds: ["prod-sugar-1kg"],
      startDate: "2026-09-15",
      endDate: "2026-09-30",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { discountPercent: 10 },
    },
    {
      id: "promo-003",
      name: "Family Pack",
      description: "Special bundle price",
      type: "BUNDLE",
      status: "ACTIVE",
      applicableLabel: "Rice + Oil + Beans",
      applicableCount: 3,
      targetKind: "PRODUCT",
      targetIds: ["prod-rice-oil-beans"],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: {
        bundlePrice: 45000,
        bundleProductLabels: ["Rice 5kg", "Cooking Oil 2L", "Beans 1kg"],
      },
    },
    {
      id: "promo-004",
      name: "Chips Special",
      description: "Buy 3 for TZS 5,000",
      type: "FIXED_PRICE",
      status: "SCHEDULED",
      applicableLabel: "All Chips",
      applicableCount: 5,
      targetKind: "CATEGORY",
      targetIds: ["cat-chips"],
      startDate: "2026-09-10",
      endDate: "2026-09-25",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { requiredQuantity: 3, fixedPrice: 5000 },
    },
    {
      id: "promo-005",
      name: "Personal Care Week",
      description: "15% off on selected items",
      type: "PERCENTAGE",
      status: "SCHEDULED",
      applicableLabel: "Personal Care",
      applicableCount: 12,
      targetKind: "CATEGORY",
      targetIds: ["cat-personal-care"],
      startDate: "2026-09-25",
      endDate: "2026-10-05",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { discountPercent: 15 },
    },
    {
      id: "promo-006",
      name: "Shopping Bonus",
      description: "Get TZS 5,000 off on purchases above 50,000",
      type: "MINIMUM_SPEND",
      status: "ACTIVE",
      applicableLabel: "All Products",
      applicableCount: null,
      targetKind: "ALL",
      targetIds: ["cat-all"],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      allowMultipleUse: false,
      limitTotalUsage: true,
      maximumUses: 1000,
      rules: { minimumSpend: 50000, discountAmount: 5000 },
    },
    {
      id: "promo-007",
      name: "Milk Madness",
      description: "Buy 2 Get 1 Free on milk",
      type: "BUY_X_GET_Y",
      status: "EXPIRED",
      applicableLabel: "Milk 500ml",
      applicableCount: 2,
      targetKind: "PRODUCT",
      targetIds: ["prod-milk-500"],
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { buyQuantity: 2, freeQuantity: 1, applyToAllVariants: true },
    },
    {
      id: "promo-008",
      name: "Beauty Sale",
      description: "20% off on cosmetics",
      type: "PERCENTAGE",
      status: "EXPIRED",
      applicableLabel: "Cosmetics",
      applicableCount: 8,
      targetKind: "CATEGORY",
      targetIds: ["cat-cosmetics"],
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { discountPercent: 20 },
    },
    {
      id: "promo-009",
      name: "Breakfast Combo",
      description: "Save on morning essentials",
      type: "BUNDLE",
      status: "ACTIVE",
      applicableLabel: "Bread + Milk + Eggs",
      applicableCount: 3,
      targetKind: "PRODUCT",
      targetIds: ["prod-milk-500"],
      startDate: "2026-09-12",
      endDate: "2026-09-28",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: {
        bundlePrice: 12000,
        bundleProductLabels: ["Bread", "Milk 500ml", "Eggs 6pcs"],
      },
    },
    {
      id: "promo-010",
      name: "Cooking Oil Deal",
      description: "TZS 2,000 off selected oils",
      type: "FIXED_AMOUNT",
      status: "ACTIVE",
      applicableLabel: "Cooking Oil",
      applicableCount: 4,
      targetKind: "CATEGORY",
      targetIds: ["cat-beverages"],
      startDate: "2026-09-08",
      endDate: "2026-09-30",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { discountAmount: 2000 },
    },
    {
      id: "promo-011",
      name: "Soft Drinks Month",
      description: "Buy 5 Get 1 Free on beverages",
      type: "BUY_X_GET_Y",
      status: "SCHEDULED",
      applicableLabel: "Beverages",
      applicableCount: 9,
      targetKind: "CATEGORY",
      targetIds: ["cat-beverages"],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { buyQuantity: 5, freeQuantity: 1, applyToAllVariants: true },
    },
    {
      id: "promo-012",
      name: "School Supplies Promo",
      description: "10% off stationery packs",
      type: "PERCENTAGE",
      status: "EXPIRED",
      applicableLabel: "Stationery",
      applicableCount: 6,
      targetKind: "CATEGORY",
      targetIds: ["cat-personal-care"],
      startDate: "2026-08-15",
      endDate: "2026-09-05",
      allowMultipleUse: true,
      limitTotalUsage: false,
      maximumUses: null,
      rules: { discountPercent: 10 },
    },
  ];
}

export function promotionKpis(items: Promotion[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === "ACTIVE").length,
    scheduled: items.filter((item) => item.status === "SCHEDULED").length,
    expired: items.filter((item) => item.status === "EXPIRED").length,
  };
}

export function createPromotionId() {
  return `promo-${Date.now().toString(36)}`;
}
