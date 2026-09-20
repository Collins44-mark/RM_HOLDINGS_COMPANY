import { APP_TIMEZONE } from "@/lib/config/app";

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

/** Stored status: ACTIVE (enabled) or INACTIVE (manually paused). Display status is date-derived. */
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
  status: "ACTIVE" | "INACTIVE";
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

export type PromotionTypeDefinition = {
  id: string;
  code: PromotionType;
  name: string;
  description: string;
  isActive: boolean;
};

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
  { id: "product-sprite-500", name: "Sprite 500ml", categoryId: "category-beverages" },
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

function seedPromotionTypes(): PromotionTypeDefinition[] {
  return [
    {
      id: "promotion-type-percentage",
      code: "PERCENTAGE",
      name: "Percentage Discount",
      description: "Reduce the price by a percentage of the original amount.",
      isActive: true,
    },
    {
      id: "promotion-type-fixed-amount",
      code: "FIXED_AMOUNT",
      name: "Fixed Amount Discount",
      description: "Subtract a fixed TZS amount from the purchase.",
      isActive: true,
    },
    {
      id: "promotion-type-buy-x-get-y",
      code: "BUY_X_GET_Y",
      name: "Buy X Get Y",
      description: "Buy a specified quantity and receive additional units free.",
      isActive: true,
    },
    {
      id: "promotion-type-fixed-price",
      code: "FIXED_PRICE",
      name: "Buy X for Fixed Price",
      description: "Purchase a required quantity for a fixed bundle price.",
      isActive: true,
    },
    {
      id: "promotion-type-bundle",
      code: "BUNDLE",
      name: "Bundle / Combo",
      description: "Sell a set of products together at a special combo price.",
      isActive: true,
    },
    {
      id: "promotion-type-minimum-spend",
      code: "MINIMUM_SPEND",
      name: "Minimum Spend",
      description: "Grant a discount when the basket reaches a minimum spend.",
      isActive: true,
    },
    {
      id: "promotion-type-tiered",
      code: "TIERED",
      name: "Tiered Discount",
      description: "Apply increasing percentage discounts as spend thresholds rise.",
      isActive: true,
    },
  ];
}

export function todayIsoDate(timeZone = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/**
 * Display status from validity dates + manual pause.
 * Expired always wins when end date is past.
 */
export function effectivePromotionStatus(
  item: Pick<Promotion, "startDate" | "endDate" | "status">,
  asOf = todayIsoDate(),
): PromotionStatus {
  if (item.endDate && asOf > item.endDate) return "EXPIRED";
  if (item.startDate && asOf < item.startDate) return "SCHEDULED";
  if (item.status === "INACTIVE") return "INACTIVE";
  return "ACTIVE";
}

export function promotionTypeLabel(type: PromotionType) {
  const fromStore = getPromotionTypesSnapshot().find((item) => item.code === type);
  return fromStore?.name ?? type;
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

/** Active types available for new/edit forms. */
export function getActivePromotionTypeOptions(): { value: PromotionType; label: string }[] {
  return getPromotionTypesSnapshot()
    .filter((item) => item.isActive)
    .map((item) => ({ value: item.code, label: item.name }));
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
    if (item.categoryIds.length === 0) return null;
    const set = new Set(item.categoryIds);
    return MOCK_PROMOTION_PRODUCTS.filter((product) => set.has(product.categoryId)).length;
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
      status: "ACTIVE",
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
      status: "ACTIVE",
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
      status: "ACTIVE",
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
      status: "ACTIVE",
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
      status: "ACTIVE",
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
      status: "ACTIVE",
      allowMultipleUse: true,
      usageLimitEnabled: false,
      usageLimit: null,
    },
  ];
}

export function promotionKpis(items: Promotion[], asOf = todayIsoDate()) {
  const statuses = items.map((item) => effectivePromotionStatus(item, asOf));
  return {
    total: items.length,
    active: statuses.filter((status) => status === "ACTIVE").length,
    scheduled: statuses.filter((status) => status === "SCHEDULED").length,
    expired: statuses.filter((status) => status === "EXPIRED").length,
  };
}

export function createPromotionId() {
  return `promo-${Date.now().toString(36)}`;
}

export function createTierId() {
  return `tier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── promotions store ─── */

let promotionsSnapshot: Promotion[] = seedPromotions();
const promotionListeners = new Set<() => void>();

function emitPromotions() {
  promotionListeners.forEach((listener) => listener());
}

export function getPromotionsSnapshot() {
  return promotionsSnapshot;
}

export function subscribePromotions(listener: () => void) {
  promotionListeners.add(listener);
  return () => promotionListeners.delete(listener);
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
  emitPromotions();
  return promotion;
}

export function deletePromotion(id: string) {
  promotionsSnapshot = promotionsSnapshot.filter((item) => item.id !== id);
  emitPromotions();
}

export function setPromotionStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  promotionsSnapshot = promotionsSnapshot.map((item) =>
    item.id === id ? { ...item, status } : item,
  );
  emitPromotions();
}

export function duplicatePromotion(id: string) {
  const source = promotionsSnapshot.find((item) => item.id === id);
  if (!source) return null;
  const copy: Promotion = {
    ...source,
    id: createPromotionId(),
    name: `${source.name} (Copy)`,
    status: "ACTIVE",
    productIds: [...source.productIds],
    categoryIds: [...source.categoryIds],
    rule: {
      ...source.rule,
      bundleProductIds: source.rule.bundleProductIds ? [...source.rule.bundleProductIds] : undefined,
      tiers: source.rule.tiers?.map((tier) => ({ ...tier, id: createTierId() })),
    },
  };
  promotionsSnapshot = [copy, ...promotionsSnapshot];
  emitPromotions();
  return copy;
}

export function countPromotionsUsingType(code: PromotionType) {
  return promotionsSnapshot.filter((item) => item.type === code).length;
}

/* ─── promotion types store ─── */

let typesSnapshot: PromotionTypeDefinition[] = seedPromotionTypes();
const typeListeners = new Set<() => void>();

function emitTypes() {
  typeListeners.forEach((listener) => listener());
}

export function getPromotionTypesSnapshot() {
  return typesSnapshot;
}

export function subscribePromotionTypes(listener: () => void) {
  typeListeners.add(listener);
  return () => typeListeners.delete(listener);
}

export function upsertPromotionType(definition: PromotionTypeDefinition) {
  const index = typesSnapshot.findIndex((item) => item.id === definition.id);
  if (index >= 0) {
    const next = [...typesSnapshot];
    next[index] = definition;
    typesSnapshot = next;
  } else {
    typesSnapshot = [...typesSnapshot, definition];
  }
  emitTypes();
  return definition;
}

export function setPromotionTypeActive(id: string, isActive: boolean) {
  typesSnapshot = typesSnapshot.map((item) => (item.id === id ? { ...item, isActive } : item));
  emitTypes();
}

export function deletePromotionType(id: string) {
  const target = typesSnapshot.find((item) => item.id === id);
  if (!target) return { ok: false as const, reason: "not_found" as const };
  if (countPromotionsUsingType(target.code) > 0) {
    return { ok: false as const, reason: "in_use" as const };
  }
  typesSnapshot = typesSnapshot.filter((item) => item.id !== id);
  emitTypes();
  return { ok: true as const };
}
