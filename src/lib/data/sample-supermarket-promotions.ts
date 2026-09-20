export type PromotionStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";

export type PromotionType =
  | "PERCENTAGE"
  | "FIXED_AMOUNT"
  | "BUY_X_GET_Y"
  | "FIXED_PRICE"
  | "BUNDLE"
  | "MINIMUM_SPEND"
  | "TIERED";

export type PromotionTargetType = "PRODUCTS" | "CATEGORY" | "ALL_PRODUCTS";

export type PromotionTier = {
  id: string;
  minimumSpend: number;
  discountPercent: number;
};

export type PromotionRule = {
  buyQuantity?: number;
  freeQuantity?: number;
  discountPercent?: number;
  discountAmount?: number;
  requiredQuantity?: number;
  fixedPrice?: number;
  bundlePrice?: number;
  bundleProductIds?: string[];
  minimumSpend?: number;
  tiers?: PromotionTier[];
};

export type Promotion = {
  id: string;
  name: string;
  description: string;
  type: PromotionType;
  targetType: PromotionTargetType;
  productIds: string[];
  categoryIds: string[];
  rule: PromotionRule;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  allowMultipleUse: boolean;
  usageLimitEnabled: boolean;
  usageLimit: number | null;
};

export type MockPromotionProduct = {
  id: string;
  name: string;
  categoryId: string;
};

export type MockPromotionCategory = {
  id: string;
  name: string;
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

export const MOCK_PROMOTION_CATEGORIES: MockPromotionCategory[] = [
  { id: "category-beverages", name: "Beverages" },
  { id: "category-food", name: "Food" },
  { id: "category-personal-care", name: "Personal Care" },
  { id: "category-household", name: "Household" },
  { id: "category-snacks", name: "Snacks" },
  { id: "category-dairy", name: "Dairy" },
  { id: "category-groceries", name: "Groceries" },
];

export const MOCK_PROMOTION_PRODUCTS: MockPromotionProduct[] = [
  { id: "product-coca-cola-500", name: "Coca-Cola 500ml", categoryId: "category-beverages" },
  { id: "product-pepsi-500", name: "Pepsi 500ml", categoryId: "category-beverages" },
  { id: "product-fanta-500", name: "Fanta 500ml", categoryId: "category-beverages" },
  { id: "product-azam-sugar-1kg", name: "Azam Sugar 1kg", categoryId: "category-groceries" },
  { id: "product-milk-500", name: "Milk 500ml", categoryId: "category-dairy" },
  { id: "product-rice-5kg", name: "Rice 5kg", categoryId: "category-food" },
  { id: "product-cooking-oil-2l", name: "Cooking Oil 2L", categoryId: "category-groceries" },
  { id: "product-beans-1kg", name: "Beans 1kg", categoryId: "category-food" },
  { id: "product-bread", name: "Bread", categoryId: "category-food" },
  { id: "product-eggs-6", name: "Eggs 6pcs", categoryId: "category-dairy" },
  { id: "product-chips-classic", name: "Classic Chips", categoryId: "category-snacks" },
  { id: "product-chips-bbq", name: "BBQ Chips", categoryId: "category-snacks" },
  { id: "product-shampoo", name: "Shampoo 400ml", categoryId: "category-personal-care" },
  { id: "product-soap", name: "Bath Soap", categoryId: "category-personal-care" },
  { id: "product-detergent", name: "Detergent 1kg", categoryId: "category-household" },
  { id: "product-lipstick", name: "Lipstick", categoryId: "category-personal-care" },
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

export function getPromotionProduct(id: string) {
  return MOCK_PROMOTION_PRODUCTS.find((item) => item.id === id) ?? null;
}

export function getPromotionCategory(id: string) {
  return MOCK_PROMOTION_CATEGORIES.find((item) => item.id === id) ?? null;
}

export function resolvePromotionProductNames(productIds: string[]) {
  return productIds
    .map((id) => getPromotionProduct(id)?.name)
    .filter((name): name is string => Boolean(name));
}

export function resolvePromotionCategoryNames(categoryIds: string[]) {
  return categoryIds
    .map((id) => getPromotionCategory(id)?.name)
    .filter((name): name is string => Boolean(name));
}

export function promotionAppliesLabel(item: Promotion) {
  if (item.targetType === "ALL_PRODUCTS") return "All Products";
  if (item.targetType === "CATEGORY") {
    const names = resolvePromotionCategoryNames(item.categoryIds);
    return names.join(", ") || "Category";
  }
  const names = resolvePromotionProductNames(item.productIds);
  if (names.length === 0) return "Products";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export function promotionAppliesCount(item: Promotion) {
  if (item.targetType === "ALL_PRODUCTS") return null;
  if (item.targetType === "CATEGORY") {
    const categoryId = item.categoryIds[0];
    if (!categoryId) return null;
    return MOCK_PROMOTION_PRODUCTS.filter((product) => product.categoryId === categoryId).length;
  }
  return item.productIds.length || null;
}

export function promotionRuleSummary(item: Promotion) {
  const { rule, type } = item;
  if (type === "BUY_X_GET_Y") return `Buy ${rule.buyQuantity ?? 0} Get ${rule.freeQuantity ?? 0}`;
  if (type === "PERCENTAGE") return `${rule.discountPercent ?? 0}% off`;
  if (type === "FIXED_AMOUNT") {
    return `TZS ${(rule.discountAmount ?? 0).toLocaleString("en-US")} off`;
  }
  if (type === "FIXED_PRICE") {
    return `Buy ${rule.requiredQuantity ?? 0} for TZS ${(rule.fixedPrice ?? 0).toLocaleString("en-US")}`;
  }
  if (type === "BUNDLE") {
    const names = resolvePromotionProductNames(rule.bundleProductIds ?? item.productIds);
    return `Bundle${names.length ? `: ${names.join(", ")}` : ""} · TZS ${(rule.bundlePrice ?? 0).toLocaleString("en-US")}`;
  }
  if (type === "MINIMUM_SPEND") {
    return `Spend TZS ${(rule.minimumSpend ?? 0).toLocaleString("en-US")} · Get TZS ${(rule.discountAmount ?? 0).toLocaleString("en-US")} off`;
  }
  if (type === "TIERED") {
    return (rule.tiers ?? [])
      .map((tier) => `TZS ${tier.minimumSpend.toLocaleString("en-US")} → ${tier.discountPercent}%`)
      .join(" · ");
  }
  return item.description;
}

export function seedPromotions(): Promotion[] {
  return [
    {
      id: "promo-001",
      name: "Weekend Soda Offer",
      description: "Buy 2 Get 1 Free",
      type: "BUY_X_GET_Y",
      targetType: "PRODUCTS",
      productIds: ["product-coca-cola-500", "product-pepsi-500", "product-fanta-500"],
      categoryIds: [],
      rule: { buyQuantity: 2, freeQuantity: 1 },
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-002",
      name: "Sugar Discount",
      description: "10% off on 1kg sugar",
      type: "PERCENTAGE",
      targetType: "PRODUCTS",
      productIds: ["product-azam-sugar-1kg"],
      categoryIds: [],
      rule: { discountPercent: 10 },
      startDate: "2026-09-15",
      endDate: "2026-09-30",
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-003",
      name: "Family Pack",
      description: "Special bundle price",
      type: "BUNDLE",
      targetType: "PRODUCTS",
      productIds: ["product-rice-5kg", "product-cooking-oil-2l", "product-beans-1kg"],
      categoryIds: [],
      rule: {
        bundlePrice: 45000,
        bundleProductIds: ["product-rice-5kg", "product-cooking-oil-2l", "product-beans-1kg"],
      },
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-004",
      name: "Chips Special",
      description: "Buy 3 for TZS 5,000",
      type: "FIXED_PRICE",
      targetType: "CATEGORY",
      productIds: [],
      categoryIds: ["category-snacks"],
      rule: { requiredQuantity: 3, fixedPrice: 5000 },
      startDate: "2026-09-10",
      endDate: "2026-09-25",
      status: "SCHEDULED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-005",
      name: "Personal Care Week",
      description: "15% off on selected items",
      type: "PERCENTAGE",
      targetType: "CATEGORY",
      productIds: [],
      categoryIds: ["category-personal-care"],
      rule: { discountPercent: 15 },
      startDate: "2026-09-25",
      endDate: "2026-10-05",
      status: "SCHEDULED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-006",
      name: "Shopping Bonus",
      description: "Get TZS 5,000 off on purchases above 50,000",
      type: "MINIMUM_SPEND",
      targetType: "ALL_PRODUCTS",
      productIds: [],
      categoryIds: [],
      rule: { minimumSpend: 50000, discountAmount: 5000 },
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      status: "ACTIVE",
      allowMultipleUse: false,
      usageLimitEnabled: true,
      usageLimit: 1000,
    },
    {
      id: "promo-007",
      name: "Milk Madness",
      description: "Buy 2 Get 1 Free on milk",
      type: "BUY_X_GET_Y",
      targetType: "PRODUCTS",
      productIds: ["product-milk-500"],
      categoryIds: [],
      rule: { buyQuantity: 2, freeQuantity: 1 },
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      status: "EXPIRED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-008",
      name: "Beauty Sale",
      description: "20% off on cosmetics",
      type: "PERCENTAGE",
      targetType: "CATEGORY",
      productIds: [],
      categoryIds: ["category-personal-care"],
      rule: { discountPercent: 20 },
      startDate: "2026-09-01",
      endDate: "2026-09-10",
      status: "EXPIRED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-009",
      name: "Breakfast Combo",
      description: "Save on morning essentials",
      type: "BUNDLE",
      targetType: "PRODUCTS",
      productIds: ["product-bread", "product-milk-500", "product-eggs-6"],
      categoryIds: [],
      rule: {
        bundlePrice: 12000,
        bundleProductIds: ["product-bread", "product-milk-500", "product-eggs-6"],
      },
      startDate: "2026-09-12",
      endDate: "2026-09-28",
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-010",
      name: "Cooking Oil Deal",
      description: "TZS 2,000 off selected oils",
      type: "FIXED_AMOUNT",
      targetType: "PRODUCTS",
      productIds: ["product-cooking-oil-2l"],
      categoryIds: [],
      rule: { discountAmount: 2000 },
      startDate: "2026-09-08",
      endDate: "2026-09-30",
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-011",
      name: "Soft Drinks Month",
      description: "Buy 5 Get 1 Free on beverages",
      type: "BUY_X_GET_Y",
      targetType: "CATEGORY",
      productIds: [],
      categoryIds: ["category-beverages"],
      rule: { buyQuantity: 5, freeQuantity: 1 },
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      status: "SCHEDULED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
    {
      id: "promo-012",
      name: "Household Essentials",
      description: "10% off household items",
      type: "PERCENTAGE",
      targetType: "CATEGORY",
      productIds: [],
      categoryIds: ["category-household"],
      rule: { discountPercent: 10 },
      startDate: "2026-08-15",
      endDate: "2026-09-05",
      status: "EXPIRED",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
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

export function createTierId() {
  return `tier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── shared in-memory mock store ─── */

let promotionsSnapshot: Promotion[] = seedPromotions();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getPromotionsSnapshot() {
  return promotionsSnapshot;
}

export function subscribePromotions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPromotionById(id: string) {
  return promotionsSnapshot.find((item) => item.id === id) ?? null;
}

export function upsertPromotion(promotion: Promotion) {
  const index = promotionsSnapshot.findIndex((item) => item.id === promotion.id);
  if (index >= 0) {
    const next = [...promotionsSnapshot];
    next[index] = promotion;
    promotionsSnapshot = next;
  } else {
    promotionsSnapshot = [promotion, ...promotionsSnapshot];
  }
  emit();
  return promotion;
}

export function deletePromotion(id: string) {
  promotionsSnapshot = promotionsSnapshot.filter((item) => item.id !== id);
  emit();
}

export function setPromotionStatus(id: string, status: PromotionStatus) {
  promotionsSnapshot = promotionsSnapshot.map((item) =>
    item.id === id ? { ...item, status } : item,
  );
  emit();
}
