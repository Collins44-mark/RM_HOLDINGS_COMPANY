"use client";

import { useSyncExternalStore } from "react";

export const SUPERMARKET_PRODUCT_CATEGORIES = [
  "Rice & Grains",
  "Sugar & Sweeteners",
  "Beverages",
  "Dairy",
  "Cooking Oil",
  "Household",
  "Personal Care",
] as const;

export const SUPERMARKET_PRODUCT_UNITS = [
  "Bag",
  "Pack",
  "Bottle",
  "Piece",
  "Carton",
  "Kg",
] as const;

export const EXPIRING_SOON_DAYS = 30;
export const NEW_PRODUCT_BARCODE_KEY = "rm-supermarket-new-product-barcode";

export type SupermarketProductCategory = string;
export type SupermarketProductUnit = (typeof SUPERMARKET_PRODUCT_UNITS)[number];
export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";
export type ExpiryStatus = "Expired" | "Expiring Soon" | "Normal" | "No Expiry";
export type StockMovementType = "Opening Stock" | "Received" | "Sale" | "Adjustment" | "Return" | "Transfer";
export const STOCK_ADJUSTMENT_KINDS = [
  "Increase",
  "Decrease",
  "Opening Balance",
  "Damage",
  "Expired",
  "Lost",
  "Correction",
] as const;
export type StockAdjustmentKind = (typeof STOCK_ADJUSTMENT_KINDS)[number];
export const STOCK_MOVEMENT_FILTERS = [
  "Purchase Received",
  "Sale",
  "Return",
  "Stock Adjustment",
  "Opening Stock",
  "Damaged",
  "Expired",
  "Lost",
  "Transfer",
] as const;
export type StockMovementFilter = (typeof STOCK_MOVEMENT_FILTERS)[number];

export type SupermarketProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: SupermarketProductCategory;
  unit: SupermarketProductUnit;
  buyingPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  trackExpiry: boolean;
  isActive: boolean;
  createdAt: string;
};

export type StockBatch = {
  id: string;
  productId: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string | null;
  buyingPrice: number;
  supplier: string;
  receivedAt: string;
};

export type StockMovement = {
  id: string;
  productId: string;
  batchId: string | null;
  type: StockMovementType;
  quantity: number;
  date: string;
  reference: string;
  note: string;
  reason?: string;
  user?: string;
  adjustmentKind?: StockAdjustmentKind;
  productName?: string;
  sku?: string;
  buyingPrice?: number;
  totalCost?: number;
  supplier?: string;
  batchNumber?: string;
  expiryDate?: string | null;
};

export type InventorySnapshot = {
  products: SupermarketProduct[];
  batches: StockBatch[];
  movements: StockMovement[];
  categories: SupermarketCategory[];
  suppliers: string[];
};

export type SupermarketCategory = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
};

export type ReceiveStockInput = {
  productId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: string | null;
  buyingPrice: number;
  sellingPrice?: number;
  supplier?: string;
  receivedAt?: string;
  type?: "Opening Stock" | "Received";
  reference?: string;
  note?: string;
  user?: string;
};

export type AdjustStockInput = {
  productId: string;
  kind: StockAdjustmentKind;
  quantity: number;
  reason?: string;
  note?: string;
  correctionDirection?: "increase" | "decrease";
  user?: string;
};

export type InventoryKpiFocus = "all" | "units" | "low" | "out" | "soon" | "expired";

export type ProductStockRow = SupermarketProduct & {
  stock: number;
  stockStatus: StockStatus;
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function currentStockFor(productId: string, batches: StockBatch[]) {
  return batches
    .filter((batch) => batch.productId === productId)
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

export function stockStatusFor(stock: number, reorderLevel: number): StockStatus {
  if (stock === 0 || stock < 0) return "Out of Stock";
  if (stock > 0 && stock <= reorderLevel) return "Low Stock";
  return "In Stock";
}

export function stockLabel(product: Pick<ProductStockRow, "stock" | "reorderLevel">) {
  return stockStatusFor(product.stock, product.reorderLevel);
}

export function batchExpiryStatus(expiryDate: string | null | undefined): ExpiryStatus {
  if (!expiryDate) return "No Expiry";
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return "No Expiry";
  const today = startOfToday();
  if (expiry < today) return "Expired";
  const limit = new Date(today);
  limit.setDate(limit.getDate() + EXPIRING_SOON_DAYS);
  if (expiry <= limit) return "Expiring Soon";
  return "Normal";
}

export function batchesForProduct(productId: string, batches: StockBatch[]) {
  return batches
    .filter((batch) => batch.productId === productId)
    .slice()
    .sort((a, b) => {
      const aDate = a.expiryDate ?? a.receivedAt;
      const bDate = b.expiryDate ?? b.receivedAt;
      return aDate.localeCompare(bDate);
    });
}

export function earliestExpiryFor(productId: string, batches: StockBatch[]) {
  const dated = batchesForProduct(productId, batches)
    .map((batch) => batch.expiryDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  return dated[0] ?? null;
}

export function productExpirySummary(productId: string, batches: StockBatch[], stock: number) {
  if (stock <= 0) return "No Stock";
  const rows = batchesForProduct(productId, batches).filter((batch) => batch.quantity > 0);
  const expiredUnits = rows
    .filter((batch) => batchExpiryStatus(batch.expiryDate) === "Expired")
    .reduce((sum, batch) => sum + batch.quantity, 0);
  const soonUnits = rows
    .filter((batch) => batchExpiryStatus(batch.expiryDate) === "Expiring Soon")
    .reduce((sum, batch) => sum + batch.quantity, 0);
  if (expiredUnits > 0) return `${expiredUnits} expired`;
  if (soonUnits > 0) return `${soonUnits} units expiring soon`;
  if (rows.some((batch) => batch.expiryDate)) {
    return `${rows.length} batch${rows.length === 1 ? "" : "es"}`;
  }
  return "No Expiry";
}

export function productExpiryFilterStatus(productId: string, batches: StockBatch[], stock: number): ExpiryStatus | "No Stock" {
  if (stock <= 0) return "No Stock";
  const rows = batchesForProduct(productId, batches).filter((batch) => batch.quantity > 0);
  if (rows.some((batch) => batchExpiryStatus(batch.expiryDate) === "Expired")) return "Expired";
  if (rows.some((batch) => batchExpiryStatus(batch.expiryDate) === "Expiring Soon")) return "Expiring Soon";
  if (rows.some((batch) => batch.expiryDate)) return "Normal";
  return "No Expiry";
}

export function attachStock(product: SupermarketProduct, batches: StockBatch[]): ProductStockRow {
  const stock = currentStockFor(product.id, batches);
  return {
    ...product,
    stock,
    stockStatus: stockStatusFor(stock, product.reorderLevel),
  };
}

export function productHasExpiryStatus(productId: string, batches: StockBatch[], status: Extract<ExpiryStatus, "Expiring Soon" | "Expired">) {
  return batchesForProduct(productId, batches).some(
    (batch) => batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === status,
  );
}

export function productMatchesKpiFocus(
  product: ProductStockRow,
  batches: StockBatch[],
  focus: InventoryKpiFocus,
) {
  if (focus === "all" || focus === "units") return true;
  if (focus === "low") return product.stockStatus === "Low Stock";
  if (focus === "out") return product.stockStatus === "Out of Stock";
  if (focus === "soon") return productHasExpiryStatus(product.id, batches, "Expiring Soon");
  return productHasExpiryStatus(product.id, batches, "Expired");
}

export function findProductByBarcode(
  products: SupermarketProduct[],
  barcode: string,
  excludeId?: string | null,
) {
  const code = barcode.trim();
  if (!code) return null;
  return (
    products.find(
      (item) => item.barcode && item.barcode === code && item.id !== excludeId,
    ) ?? null
  );
}

export function movementsForProduct(productId: string, movements: StockMovement[]) {
  const rows = movements
    .filter((item) => item.productId === productId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let balance = 0;
  return rows.map((item) => {
    balance += item.quantity;
    return { ...item, balance };
  });
}

export function movementTypeLabel(type: StockMovementType, adjustmentKind?: StockAdjustmentKind) {
  if (adjustmentKind) return adjustmentKind;
  if (type === "Received") return "Purchase / Received";
  return type;
}

export function stockMovementKindLabel(item: Pick<StockMovement, "type" | "adjustmentKind">): StockMovementFilter | string {
  if (item.adjustmentKind === "Damage") return "Damaged";
  if (item.adjustmentKind === "Expired") return "Expired";
  if (item.adjustmentKind === "Lost") return "Lost";
  if (item.type === "Received") return "Purchase Received";
  if (item.type === "Adjustment") return "Stock Adjustment";
  return item.type;
}

export function adjustmentDelta(kind: StockAdjustmentKind, quantity: number, correctionDirection: "increase" | "decrease" = "increase") {
  const amount = Math.abs(quantity);
  if (kind === "Decrease" || kind === "Damage" || kind === "Expired" || kind === "Lost") return -amount;
  if (kind === "Correction" && correctionDirection === "decrease") return -amount;
  return amount;
}

function nextBatchNumber(productId: string, batches: StockBatch[]) {
  const count = batches.filter((batch) => batch.productId === productId).length + 1;
  return `B${String(count).padStart(3, "0")}`;
}

function createSeed(): InventorySnapshot {
  const products: SupermarketProduct[] = [
    {
      id: "product-001",
      name: "Cowbell Milk 4L",
      sku: "COW-MILK-4L",
      barcode: "6201234567890",
      category: "Dairy",
      unit: "Bottle",
      buyingPrice: 9_000,
      sellingPrice: 12_000,
      reorderLevel: 30,
      trackExpiry: true,
      isActive: true,
      createdAt: "2026-08-05T08:00:00.000Z",
    },
    {
      id: "prd-rice-25",
      name: "Rice 25kg",
      sku: "RICE-25",
      barcode: "6201234500012",
      category: "Rice & Grains",
      unit: "Bag",
      buyingPrice: 38_000,
      sellingPrice: 45_000,
      reorderLevel: 20,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-08-12T08:00:00.000Z",
    },
    {
      id: "prd-sugar-1",
      name: "Sugar 1kg",
      sku: "SUGAR-1",
      barcode: "6201234500013",
      category: "Sugar & Sweeteners",
      unit: "Pack",
      buyingPrice: 2_900,
      sellingPrice: 3_500,
      reorderLevel: 30,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-08-18T08:00:00.000Z",
    },
    {
      id: "prd-oil-5",
      name: "Cooking Oil 5L",
      sku: "OIL-5",
      barcode: "6201234500014",
      category: "Cooking Oil",
      unit: "Bottle",
      buyingPrice: 18_500,
      sellingPrice: 22_000,
      reorderLevel: 10,
      trackExpiry: true,
      isActive: true,
      createdAt: "2026-08-22T08:00:00.000Z",
    },
    {
      id: "prd-milk-500",
      name: "Milk 500ml",
      sku: "MILK-500",
      barcode: "6201234500015",
      category: "Dairy",
      unit: "Bottle",
      buyingPrice: 1_600,
      sellingPrice: 2_000,
      reorderLevel: 20,
      trackExpiry: true,
      isActive: true,
      createdAt: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "prd-soda-500",
      name: "Soda 500ml",
      sku: "SODA-500",
      barcode: "6201234500016",
      category: "Beverages",
      unit: "Bottle",
      buyingPrice: 1_200,
      sellingPrice: 1_500,
      reorderLevel: 20,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-09-04T08:00:00.000Z",
    },
    {
      id: "prd-wash-1",
      name: "Washing Powder 1kg",
      sku: "WASH-1",
      barcode: "6201234500017",
      category: "Household",
      unit: "Pack",
      buyingPrice: 4_800,
      sellingPrice: 6_000,
      reorderLevel: 15,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-09-06T08:00:00.000Z",
    },
    {
      id: "prd-unga-2",
      name: "Maize Flour 2kg",
      sku: "UNGA-2",
      barcode: "6201234500018",
      category: "Rice & Grains",
      unit: "Pack",
      buyingPrice: 3_400,
      sellingPrice: 4_200,
      reorderLevel: 18,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-09-08T08:00:00.000Z",
    },
    {
      id: "prd-soap-800",
      name: "Bar Soap 800g",
      sku: "SOAP-800",
      barcode: "6201234500019",
      category: "Personal Care",
      unit: "Piece",
      buyingPrice: 2_200,
      sellingPrice: 2_800,
      reorderLevel: 12,
      trackExpiry: false,
      isActive: true,
      createdAt: "2026-09-10T08:00:00.000Z",
    },
    {
      id: "prd-paste-120",
      name: "Toothpaste 120g",
      sku: "PASTE-120",
      barcode: "6201234500020",
      category: "Personal Care",
      unit: "Piece",
      buyingPrice: 2_400,
      sellingPrice: 3_200,
      reorderLevel: 10,
      trackExpiry: true,
      isActive: false,
      createdAt: "2026-07-21T08:00:00.000Z",
    },
  ];

  const batches: StockBatch[] = [
    {
      id: "bat-cow-1",
      productId: "product-001",
      batchNumber: "B001",
      quantity: 100,
      expiryDate: "2026-09-20",
      buyingPrice: 9_000,
      supplier: "XYZ Distributors",
      receivedAt: "2026-09-14",
    },
    {
      id: "bat-cow-2",
      productId: "product-001",
      batchNumber: "B002",
      quantity: 150,
      expiryDate: "2026-10-05",
      buyingPrice: 9_000,
      supplier: "XYZ Distributors",
      receivedAt: "2026-09-10",
    },
    {
      id: "bat-cow-3",
      productId: "product-001",
      batchNumber: "B003",
      quantity: 200,
      expiryDate: "2026-10-25",
      buyingPrice: 9_000,
      supplier: "XYZ Distributors",
      receivedAt: "2026-09-10",
    },
    {
      id: "bat-rice-1",
      productId: "prd-rice-25",
      batchNumber: "OPENING",
      quantity: 76,
      expiryDate: null,
      buyingPrice: 38_000,
      supplier: "",
      receivedAt: "2026-08-12",
    },
    {
      id: "bat-sugar-1",
      productId: "prd-sugar-1",
      batchNumber: "OPENING",
      quantity: 124,
      expiryDate: null,
      buyingPrice: 2_900,
      supplier: "",
      receivedAt: "2026-08-18",
    },
    {
      id: "bat-oil-1",
      productId: "prd-oil-5",
      batchNumber: "B001",
      quantity: 32,
      expiryDate: "2027-03-15",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-08-22",
    },
    {
      id: "bat-oil-2",
      productId: "prd-oil-5",
      batchNumber: "B002",
      quantity: 20,
      expiryDate: "2026-08-01",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-07-10",
    },
    {
      id: "bat-soda-1",
      productId: "prd-soda-500",
      batchNumber: "OPENING",
      quantity: 8,
      expiryDate: null,
      buyingPrice: 1_200,
      supplier: "",
      receivedAt: "2026-09-04",
    },
    {
      id: "bat-wash-1",
      productId: "prd-wash-1",
      batchNumber: "OPENING",
      quantity: 42,
      expiryDate: null,
      buyingPrice: 4_800,
      supplier: "",
      receivedAt: "2026-09-06",
    },
    {
      id: "bat-unga-1",
      productId: "prd-unga-2",
      batchNumber: "OPENING",
      quantity: 58,
      expiryDate: null,
      buyingPrice: 3_400,
      supplier: "",
      receivedAt: "2026-09-08",
    },
    {
      id: "bat-soap-1",
      productId: "prd-soap-800",
      batchNumber: "OPENING",
      quantity: 19,
      expiryDate: null,
      buyingPrice: 2_200,
      supplier: "",
      receivedAt: "2026-09-10",
    },
    {
      id: "bat-paste-1",
      productId: "prd-paste-120",
      batchNumber: "B001",
      quantity: 6,
      expiryDate: "2027-06-01",
      buyingPrice: 2_400,
      supplier: "",
      receivedAt: "2026-07-21",
    },
  ];

  const movements: StockMovement[] = [
    {
      id: "mov-z16-oil-2244",
      productId: "prd-oil-5",
      batchId: "bat-oil-1",
      type: "Received",
      quantity: 20,
      date: "2026-09-16",
      reference: "PO-2244",
      note: "Purchase Received",
      user: "John",
    },
    {
      id: "mov-y16-rice-1048",
      productId: "prd-rice-25",
      batchId: "bat-rice-1",
      type: "Sale",
      quantity: -4,
      date: "2026-09-16",
      reference: "INV-1048",
      note: "POS sale",
      user: "Mary",
    },
    {
      id: "mov-x15-milk-adj-32",
      productId: "prd-milk-500",
      batchId: null,
      type: "Adjustment",
      quantity: -5,
      date: "2026-09-15",
      reference: "ADJ-0032",
      note: "Physical count",
      reason: "Physical Count",
      user: "Collins",
      adjustmentKind: "Decrease",
    },
    {
      id: "mov-cow-1",
      productId: "product-001",
      batchId: "bat-cow-2",
      type: "Opening Stock",
      quantity: 150,
      date: "2026-09-10",
      reference: "OPENING",
      note: "Opening stock",
      user: "John",
    },
    {
      id: "mov-cow-2",
      productId: "product-001",
      batchId: "bat-cow-3",
      type: "Opening Stock",
      quantity: 200,
      date: "2026-09-10",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-w14-cow-2241",
      productId: "product-001",
      batchId: "bat-cow-1",
      type: "Received",
      quantity: 100,
      date: "2026-09-14",
      reference: "PO-2241",
      note: "Purchase Received",
      user: "John",
    },
    {
      id: "mov-rice-1",
      productId: "prd-rice-25",
      batchId: "bat-rice-1",
      type: "Opening Stock",
      quantity: 76,
      date: "2026-08-12",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-sugar-1",
      productId: "prd-sugar-1",
      batchId: "bat-sugar-1",
      type: "Opening Stock",
      quantity: 124,
      date: "2026-08-18",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-oil-sale-1048",
      productId: "prd-oil-5",
      batchId: "bat-oil-1",
      type: "Sale",
      quantity: -3,
      date: "2026-09-12",
      reference: "INV-1048",
      note: "POS sale",
      user: "Mary",
    },
    {
      id: "mov-oil-1",
      productId: "prd-oil-5",
      batchId: "bat-oil-2",
      type: "Received",
      quantity: 20,
      date: "2026-07-10",
      reference: "PO-1988",
      note: "Purchase / Received",
    },
    {
      id: "mov-oil-2",
      productId: "prd-oil-5",
      batchId: "bat-oil-1",
      type: "Received",
      quantity: 32,
      date: "2026-08-22",
      reference: "PO-2210",
      note: "Purchase / Received",
    },
    {
      id: "mov-v13-milk-1044",
      productId: "prd-milk-500",
      batchId: null,
      type: "Sale",
      quantity: -3,
      date: "2026-09-13",
      reference: "INV-1044",
      note: "POS sale",
      user: "Amina",
    },
    {
      id: "mov-oil-open-13",
      productId: "prd-oil-5",
      batchId: "bat-oil-2",
      type: "Opening Stock",
      quantity: 30,
      date: "2026-09-13",
      reference: "OPENING",
      note: "Opening stock",
      user: "John",
    },
    {
      id: "mov-sugar-return",
      productId: "prd-sugar-1",
      batchId: "bat-sugar-1",
      type: "Return",
      quantity: 2,
      date: "2026-09-12",
      reference: "RET-0018",
      note: "Customer return",
      user: "Amina",
    },
    {
      id: "mov-unga-transfer",
      productId: "prd-unga-2",
      batchId: "bat-unga-1",
      type: "Transfer",
      quantity: -6,
      date: "2026-09-11",
      reference: "TR-009",
      note: "Store transfer",
      user: "Peter",
    },
    {
      id: "mov-soap-damage",
      productId: "prd-soap-800",
      batchId: "bat-soap-1",
      type: "Adjustment",
      quantity: -1,
      date: "2026-09-09",
      reference: "ADJ-0028",
      note: "Damaged pack",
      reason: "Damage",
      user: "Collins",
      adjustmentKind: "Damage",
    },
    {
      id: "mov-milk-1",
      productId: "prd-milk-500",
      batchId: null,
      type: "Opening Stock",
      quantity: 18,
      date: "2026-09-01",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-milk-2",
      productId: "prd-milk-500",
      batchId: null,
      type: "Sale",
      quantity: -18,
      date: "2026-09-13",
      reference: "SALE-088",
      note: "POS floor",
    },
    {
      id: "mov-soda-1",
      productId: "prd-soda-500",
      batchId: "bat-soda-1",
      type: "Opening Stock",
      quantity: 12,
      date: "2026-09-04",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-soda-2",
      productId: "prd-soda-500",
      batchId: "bat-soda-1",
      type: "Sale",
      quantity: -4,
      date: "2026-09-12",
      reference: "SALE-104",
      note: "POS floor",
    },
    {
      id: "mov-wash-1",
      productId: "prd-wash-1",
      batchId: "bat-wash-1",
      type: "Opening Stock",
      quantity: 42,
      date: "2026-09-06",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-unga-1",
      productId: "prd-unga-2",
      batchId: "bat-unga-1",
      type: "Opening Stock",
      quantity: 58,
      date: "2026-09-08",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-soap-1",
      productId: "prd-soap-800",
      batchId: "bat-soap-1",
      type: "Opening Stock",
      quantity: 19,
      date: "2026-09-10",
      reference: "OPENING",
      note: "Opening stock",
    },
    {
      id: "mov-paste-1",
      productId: "prd-paste-120",
      batchId: "bat-paste-1",
      type: "Opening Stock",
      quantity: 6,
      date: "2026-07-21",
      reference: "OPENING",
      note: "Opening stock",
    },
  ];

  const suppliers = [...new Set(batches.map((batch) => batch.supplier).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    products,
    batches,
    movements,
    categories: SUPERMARKET_PRODUCT_CATEGORIES.map((name) => ({
      id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      description: "",
      isActive: true,
    })),
    suppliers,
  };
}

const INITIAL = createSeed();
let snapshot: InventorySnapshot = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: InventorySnapshot) {
  snapshot = next;
  emit();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL;
}

export function categoryProductCount(name: string, products = snapshot.products) {
  return products.filter((item) => item.category === name).length;
}

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function addProductCategory(input: { name: string; description?: string }) {
  const name = normalizeCategoryName(input.name);
  const description = input.description?.trim() ?? "";
  if (!name) {
    return { error: "Enter a category name.", category: null as SupermarketCategory | null };
  }
  const exists = snapshot.categories.some((item) => item.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    return { error: "This category already exists.", category: null as SupermarketCategory | null };
  }
  const category: SupermarketCategory = {
    id: `cat-${Date.now()}`,
    name,
    description,
    isActive: true,
  };
  setSnapshot({
    ...snapshot,
    categories: [...snapshot.categories, category],
  });
  return { error: null, category };
}

export function updateProductCategory(
  id: string,
  input: { name: string; description?: string },
) {
  const current = snapshot.categories.find((item) => item.id === id);
  if (!current) {
    return { error: "Category not found.", category: null as SupermarketCategory | null, previousName: null as string | null };
  }
  const name = normalizeCategoryName(input.name);
  const description = input.description?.trim() ?? "";
  if (!name) {
    return { error: "Enter a category name.", category: null, previousName: current.name };
  }
  const duplicate = snapshot.categories.some(
    (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return { error: "This category already exists.", category: null, previousName: current.name };
  }
  const previousName = current.name;
  const category: SupermarketCategory = { ...current, name, description };
  setSnapshot({
    ...snapshot,
    categories: snapshot.categories.map((item) => (item.id === id ? category : item)),
    products:
      previousName === name
        ? snapshot.products
        : snapshot.products.map((item) => (item.category === previousName ? { ...item, category: name } : item)),
  });
  return { error: null, category, previousName };
}

export function deleteProductCategory(id: string) {
  const current = snapshot.categories.find((item) => item.id === id);
  if (!current) return { error: "Category not found.", inUse: false };
  if (categoryProductCount(current.name) > 0) {
    return { error: "Category is in use", inUse: true };
  }
  setSnapshot({
    ...snapshot,
    categories: snapshot.categories.filter((item) => item.id !== id),
  });
  return { error: null, inUse: false, name: current.name };
}

export function setProductCategoryActive(id: string, isActive: boolean) {
  const current = snapshot.categories.find((item) => item.id === id);
  if (!current) return { error: "Category not found." };
  setSnapshot({
    ...snapshot,
    categories: snapshot.categories.map((item) => (item.id === id ? { ...item, isActive } : item)),
  });
  return { error: null };
}

export function upsertProduct(product: SupermarketProduct) {
  const exists = snapshot.products.some((item) => item.id === product.id);
  setSnapshot({
    ...snapshot,
    products: exists
      ? snapshot.products.map((item) => (item.id === product.id ? product : item))
      : [product, ...snapshot.products],
  });
}

export function toggleProductActive(productId: string) {
  setSnapshot({
    ...snapshot,
    products: snapshot.products.map((item) =>
      item.id === productId ? { ...item, isActive: !item.isActive } : item,
    ),
  });
}

export function nextGoodsReceivedReference(movements = snapshot.movements) {
  const year = new Date().getFullYear();
  const prefix = `GRN-${year}-`;
  let max = 0;
  for (const item of movements) {
    if (!item.reference.startsWith(prefix)) continue;
    const value = Number(item.reference.slice(prefix.length));
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function addInventorySupplier(name: string) {
  const next = name.trim().replace(/\s+/g, " ");
  if (!next) return { error: "Enter a supplier name.", name: "" };
  const existing = snapshot.suppliers.find((item) => item.toLowerCase() === next.toLowerCase());
  if (existing) return { error: null, name: existing };
  setSnapshot({
    ...snapshot,
    suppliers: [...snapshot.suppliers, next].sort((a, b) => a.localeCompare(b)),
  });
  return { error: null, name: next };
}

export function receiveStock(input: ReceiveStockInput) {
  const product = snapshot.products.find((item) => item.id === input.productId);
  const receivedAtRaw = input.receivedAt || new Date().toISOString();
  const receivedDate = receivedAtRaw.slice(0, 10);
  const batchNumber = input.batchNumber?.trim() || nextBatchNumber(input.productId, snapshot.batches);
  const stamp = Date.now();
  const supplier = input.supplier?.trim() ?? "";
  const batch: StockBatch = {
    id: `bat-${stamp}`,
    productId: input.productId,
    batchNumber,
    quantity: input.quantity,
    expiryDate: input.expiryDate?.trim() ? input.expiryDate.trim() : null,
    buyingPrice: input.buyingPrice,
    supplier,
    receivedAt: receivedDate,
  };
  const reference =
    input.reference?.trim() ||
    (input.type === "Opening Stock" ? "OPENING" : nextGoodsReceivedReference(snapshot.movements));
  const movement: StockMovement = {
    id: `mov-${stamp}`,
    productId: input.productId,
    batchId: batch.id,
    type: input.type ?? "Received",
    quantity: input.quantity,
    date: receivedAtRaw,
    reference,
    note: input.note?.trim() || (supplier ? `Stock Received from ${supplier}` : "Stock Received"),
    user: input.user?.trim() || undefined,
    productName: product?.name,
    sku: product?.sku,
    buyingPrice: input.buyingPrice,
    totalCost: input.quantity * input.buyingPrice,
    supplier,
    batchNumber,
    expiryDate: batch.expiryDate,
  };
  const batches = [...snapshot.batches, batch];
  const products =
    product && input.sellingPrice != null && Number.isFinite(input.sellingPrice) && input.sellingPrice >= 0
      ? snapshot.products.map((item) =>
          item.id === product.id ? { ...item, sellingPrice: Math.round(input.sellingPrice as number) } : item,
        )
      : snapshot.products;
  const suppliers =
    supplier && !snapshot.suppliers.some((item) => item.toLowerCase() === supplier.toLowerCase())
      ? [...snapshot.suppliers, supplier].sort((a, b) => a.localeCompare(b))
      : snapshot.suppliers;

  setSnapshot({
    ...snapshot,
    products,
    batches,
    movements: [...snapshot.movements, movement],
    suppliers,
  });

  return {
    batch,
    movement,
    newStock: currentStockFor(input.productId, batches),
  };
}

export function adjustStock(input: AdjustStockInput) {
  const product = snapshot.products.find((item) => item.id === input.productId);
  if (!product) return { error: "Select a product." };

  const quantity = Math.abs(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Enter a valid quantity." };
  }

  const delta = adjustmentDelta(input.kind, quantity, input.correctionDirection);
  const current = currentStockFor(input.productId, snapshot.batches);
  if (delta < 0 && current + delta < 0) {
    return { error: "Decrease cannot make stock negative." };
  }

  const stamp = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const batches = snapshot.batches.map((batch) => ({ ...batch }));
  let batchId: string | null = null;

  if (delta > 0) {
    const batch: StockBatch = {
      id: `bat-${stamp}`,
      productId: input.productId,
      batchNumber: nextBatchNumber(input.productId, batches),
      quantity: delta,
      expiryDate: null,
      buyingPrice: product.buyingPrice,
      supplier: "",
      receivedAt: date,
    };
    batches.push(batch);
    batchId = batch.id;
  } else {
    let remaining = -delta;
    const ordered = batches
      .map((batch, index) => ({ batch, index }))
      .filter(({ batch }) => batch.productId === input.productId && batch.quantity > 0)
      .sort((a, b) => {
        const aKey = `${a.batch.expiryDate ?? "9999-12-31"}|${a.batch.receivedAt}`;
        const bKey = `${b.batch.expiryDate ?? "9999-12-31"}|${b.batch.receivedAt}`;
        return aKey.localeCompare(bKey);
      });

    for (const { batch, index } of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      batches[index] = { ...batch, quantity: batch.quantity - take };
      remaining -= take;
      batchId = batch.id;
    }

    if (remaining > 0) {
      return { error: "Decrease cannot make stock negative." };
    }
  }

  const reason = input.reason?.trim() || "";
  const movement: StockMovement = {
    id: `mov-${stamp}`,
    productId: input.productId,
    batchId,
    type: "Adjustment",
    quantity: delta,
    date,
    reference: `ADJ-${stamp.toString(36).toUpperCase()}`,
    note: input.note?.trim() || reason || input.kind,
    reason: reason || input.kind,
    user: input.user?.trim() || "Storekeeper",
    adjustmentKind: input.kind,
  };

  setSnapshot({
    ...snapshot,
    batches,
    movements: [...snapshot.movements, movement],
  });
  return { error: null };
}

export function rememberNewProductBarcode(barcode: string) {
  try {
    sessionStorage.setItem(NEW_PRODUCT_BARCODE_KEY, barcode);
  } catch {
    // Ignore storage errors in private browsing.
  }
}

export function consumeNewProductBarcode() {
  try {
    const value = sessionStorage.getItem(NEW_PRODUCT_BARCODE_KEY);
    if (value) sessionStorage.removeItem(NEW_PRODUCT_BARCODE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function inventoryKpis(state: InventorySnapshot) {
  const rows = state.products.map((product) => attachStock(product, state.batches));
  const expiredBatches = state.batches.filter(
    (batch) => batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === "Expired",
  );
  const soonBatches = state.batches.filter(
    (batch) => batch.quantity > 0 && batchExpiryStatus(batch.expiryDate) === "Expiring Soon",
  );

  return {
    totalProducts: rows.length,
    totalStockUnits: rows.reduce((sum, item) => sum + item.stock, 0),
    lowStock: rows.filter((item) => productMatchesKpiFocus(item, state.batches, "low")).length,
    outOfStock: rows.filter((item) => productMatchesKpiFocus(item, state.batches, "out")).length,
    expiringSoonUnits: soonBatches.reduce((sum, batch) => sum + batch.quantity, 0),
    expiringSoonProducts: rows.filter((item) => productMatchesKpiFocus(item, state.batches, "soon")).length,
    expiredUnits: expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0),
    expiredProducts: rows.filter((item) => productMatchesKpiFocus(item, state.batches, "expired")).length,
  };
}

export function useSupermarketInventory() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...state,
    upsertProduct,
    receiveStock,
    adjustStock,
    toggleProductActive,
    addInventorySupplier,
    nextGoodsReceivedReference,
  };
}

export const SUPERMARKET_SAMPLE_PRODUCTS = INITIAL.products;
