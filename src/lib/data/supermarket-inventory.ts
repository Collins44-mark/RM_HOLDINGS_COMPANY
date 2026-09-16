"use client";

import { useSyncExternalStore } from "react";
import {
  derivePurchaseOrderStatus,
  destinationFromAllocation,
  nextDocumentNumber,
  seedPurchaseOrders,
  seedPurchases,
  seedSuppliers,
  type CreatePurchaseOrderInput,
  type CreateSupplierInput,
  type Purchase,
  type PurchaseOrder,
  type ReceivePurchaseOrderInput,
  type StockLocation,
  type StockMovementCode,
  type Supplier,
  type TransferStockInput,
} from "@/lib/data/supermarket-purchasing";

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
  location?: StockLocation;
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
  movementCode?: StockMovementCode;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  destination?: StockLocation | "Split";
  sourceDocumentId?: string;
  sourceDocumentType?: "purchase_order" | "purchase" | "transfer" | "adjustment" | "opening";
  allocations?: { location: StockLocation; quantity: number }[];
};

export type InventorySnapshot = {
  products: SupermarketProduct[];
  batches: StockBatch[];
  movements: StockMovement[];
  categories: SupermarketCategory[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchases: Purchase[];
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
  location?: StockLocation;
  mainStore?: number;
  salesFloor?: number;
};

export type AdjustStockInput = {
  productId: string;
  kind: StockAdjustmentKind;
  quantity: number;
  reason?: string;
  note?: string;
  correctionDirection?: "increase" | "decrease";
  user?: string;
  location?: StockLocation;
};

export type InventoryKpiFocus = "all" | "units" | "low" | "out" | "soon" | "expired";

export type ProductStockRow = SupermarketProduct & {
  stock: number;
  mainStore: number;
  salesFloor: number;
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
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function currentStockFor(productId: string, batches: StockBatch[]) {
  return batches
    .filter((batch) => batch.productId === productId)
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

export function batchLocation(batch: Pick<StockBatch, "location">): StockLocation {
  return batch.location || "Main Store";
}

export function stockAtLocation(productId: string, batches: StockBatch[], location: StockLocation) {
  return batches
    .filter((batch) => batch.productId === productId && batchLocation(batch) === location)
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

export function locationStockFor(productId: string, batches: StockBatch[]) {
  const mainStore = stockAtLocation(productId, batches, "Main Store");
  const salesFloor = stockAtLocation(productId, batches, "Sales Floor");
  return { mainStore, salesFloor, total: mainStore + salesFloor };
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
  const locations = locationStockFor(product.id, batches);
  return {
    ...product,
    stock: locations.total,
    mainStore: locations.mainStore,
    salesFloor: locations.salesFloor,
    stockStatus: stockStatusFor(locations.total, product.reorderLevel),
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
    if (item.type !== "Transfer") balance += item.quantity;
    return { ...item, balance };
  });
}

export function movementTypeLabel(type: StockMovementType, adjustmentKind?: StockAdjustmentKind) {
  if (adjustmentKind) return adjustmentKind;
  if (type === "Received") return "Purchase / Received";
  return type;
}

export function stockMovementKindLabel(item: Pick<StockMovement, "type" | "adjustmentKind" | "movementCode">): StockMovementFilter | string {
  if (item.adjustmentKind === "Damage") return "Damaged";
  if (item.adjustmentKind === "Expired") return "Expired";
  if (item.adjustmentKind === "Lost") return "Lost";
  if (item.movementCode === "PURCHASE_RECEIVED" || item.type === "Received") return "Purchase Received";
  if (item.movementCode === "STOCK_TRANSFER" || item.type === "Transfer") return "Transfer";
  if (item.movementCode === "STOCK_ADJUSTMENT" || item.type === "Adjustment") return "Stock Adjustment";
  if (item.movementCode === "OPENING_STOCK" || item.type === "Opening Stock") return "Opening Stock";
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
      quantity: 70,
      expiryDate: "2026-09-20",
      buyingPrice: 9_000,
      supplier: "XYZ Distributors",
      receivedAt: "2026-09-14",
      location: "Main Store",
    },
    {
      id: "bat-cow-1b",
      productId: "product-001",
      batchNumber: "B001",
      quantity: 30,
      expiryDate: "2026-09-20",
      buyingPrice: 9_000,
      supplier: "XYZ Distributors",
      receivedAt: "2026-09-14",
      location: "Sales Floor",
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
      quantity: 50,
      expiryDate: null,
      buyingPrice: 38_000,
      supplier: "",
      receivedAt: "2026-08-12",
      location: "Main Store",
    },
    {
      id: "bat-rice-2",
      productId: "prd-rice-25",
      batchNumber: "OPENING",
      quantity: 26,
      expiryDate: null,
      buyingPrice: 38_000,
      supplier: "",
      receivedAt: "2026-08-12",
      location: "Sales Floor",
    },
    {
      id: "bat-sugar-1",
      productId: "prd-sugar-1",
      batchNumber: "OPENING",
      quantity: 80,
      expiryDate: null,
      buyingPrice: 2_900,
      supplier: "",
      receivedAt: "2026-08-18",
      location: "Main Store",
    },
    {
      id: "bat-sugar-2",
      productId: "prd-sugar-1",
      batchNumber: "OPENING",
      quantity: 44,
      expiryDate: null,
      buyingPrice: 2_900,
      supplier: "",
      receivedAt: "2026-08-18",
      location: "Sales Floor",
    },
    {
      id: "bat-oil-1",
      productId: "prd-oil-5",
      batchNumber: "B001",
      quantity: 22,
      expiryDate: "2027-03-15",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-08-22",
      location: "Main Store",
    },
    {
      id: "bat-oil-1b",
      productId: "prd-oil-5",
      batchNumber: "B001",
      quantity: 10,
      expiryDate: "2027-03-15",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-08-22",
      location: "Sales Floor",
    },
    {
      id: "bat-oil-2",
      productId: "prd-oil-5",
      batchNumber: "B002",
      quantity: 13,
      expiryDate: "2026-08-01",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-07-10",
      location: "Main Store",
    },
    {
      id: "bat-oil-2b",
      productId: "prd-oil-5",
      batchNumber: "B002",
      quantity: 7,
      expiryDate: "2026-08-01",
      buyingPrice: 18_500,
      supplier: "Kibo Oils",
      receivedAt: "2026-07-10",
      location: "Sales Floor",
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

  const suppliers = seedSuppliers();

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
    purchaseOrders: seedPurchaseOrders(),
    purchases: seedPurchases(),
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
  const created = createSupplierRecord({ name });
  if (created.error) return { error: created.error, name: "" };
  return { error: null, name: created.supplier!.name };
}

function ensureSupplier(name: string, suppliers: Supplier[]) {
  const next = name.trim().replace(/\s+/g, " ");
  if (!next) return suppliers;
  if (suppliers.some((item) => item.name.toLowerCase() === next.toLowerCase())) return suppliers;
  return [...suppliers, makeSupplier({ name: next })].sort((a, b) => a.name.localeCompare(b.name));
}

function makeSupplier(input: CreateSupplierInput): Supplier {
  return {
    id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim().replace(/\s+/g, " "),
    contactPerson: input.contactPerson?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    email: input.email?.trim() ?? "",
    address: input.address?.trim() ?? "",
    status: input.status ?? "Active",
  };
}

export function createSupplierRecord(input: CreateSupplierInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter a supplier name.", supplier: null as Supplier | null };
  const existing = snapshot.suppliers.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing) return { error: null, supplier: existing };
  const supplier = makeSupplier({ ...input, name });
  setSnapshot({
    ...snapshot,
    suppliers: [...snapshot.suppliers, supplier].sort((a, b) => a.name.localeCompare(b.name)),
  });
  return { error: null, supplier };
}

function allocationForReceive(input: ReceiveStockInput) {
  const mainStore =
    input.mainStore != null ? Math.max(0, Math.round(input.mainStore)) : undefined;
  const salesFloor =
    input.salesFloor != null ? Math.max(0, Math.round(input.salesFloor)) : undefined;
  if (mainStore != null || salesFloor != null) {
    return { mainStore: mainStore ?? 0, salesFloor: salesFloor ?? 0 };
  }
  if (input.location === "Sales Floor") return { mainStore: 0, salesFloor: input.quantity };
  return { mainStore: input.quantity, salesFloor: 0 };
}

function appendLocatedBatches(params: {
  batches: StockBatch[];
  productId: string;
  batchNumber: string;
  expiryDate: string | null;
  buyingPrice: number;
  supplier: string;
  receivedAt: string;
  mainStore: number;
  salesFloor: number;
  stamp: number;
}) {
  const next = [...params.batches];
  const ids: string[] = [];
  if (params.mainStore > 0) {
    const id = `bat-${params.stamp}-ms`;
    next.push({
      id,
      productId: params.productId,
      batchNumber: params.batchNumber,
      quantity: params.mainStore,
      expiryDate: params.expiryDate,
      buyingPrice: params.buyingPrice,
      supplier: params.supplier,
      receivedAt: params.receivedAt,
      location: "Main Store",
    });
    ids.push(id);
  }
  if (params.salesFloor > 0) {
    const id = `bat-${params.stamp}-sf`;
    next.push({
      id,
      productId: params.productId,
      batchNumber: params.batchNumber,
      quantity: params.salesFloor,
      expiryDate: params.expiryDate,
      buyingPrice: params.buyingPrice,
      supplier: params.supplier,
      receivedAt: params.receivedAt,
      location: "Sales Floor",
    });
    ids.push(id);
  }
  return { batches: next, ids };
}

export function receiveStock(input: ReceiveStockInput) {
  const product = snapshot.products.find((item) => item.id === input.productId);
  const receivedAtRaw = input.receivedAt || new Date().toISOString();
  const receivedDate = receivedAtRaw.slice(0, 10);
  const batchNumber = input.batchNumber?.trim() || nextBatchNumber(input.productId, snapshot.batches);
  const stamp = Date.now();
  const supplier = input.supplier?.trim() ?? "";
  const allocation = allocationForReceive(input);
  if (allocation.mainStore + allocation.salesFloor !== input.quantity) {
    return { error: "Stock allocation must equal the received quantity." } as const;
  }
  const appended = appendLocatedBatches({
    batches: snapshot.batches,
    productId: input.productId,
    batchNumber,
    expiryDate: input.expiryDate?.trim() ? input.expiryDate.trim() : null,
    buyingPrice: input.buyingPrice,
    supplier,
    receivedAt: receivedDate,
    mainStore: allocation.mainStore,
    salesFloor: allocation.salesFloor,
    stamp,
  });
  const reference =
    input.reference?.trim() ||
    (input.type === "Opening Stock" ? "OPENING" : nextGoodsReceivedReference(snapshot.movements));
  const destination = destinationFromAllocation(allocation.mainStore, allocation.salesFloor);
  const isOpening = input.type === "Opening Stock";
  const movement: StockMovement = {
    id: `mov-${stamp}`,
    productId: input.productId,
    batchId: appended.ids[0] ?? null,
    type: isOpening ? "Opening Stock" : "Received",
    quantity: input.quantity,
    date: receivedAtRaw,
    reference,
    note:
      input.note?.trim() ||
      (isOpening
        ? `Opening stock · ${destination}`
        : supplier
          ? `Stock Received from ${supplier}`
          : "Stock Received"),
    user: input.user?.trim() || undefined,
    productName: product?.name,
    sku: product?.sku,
    buyingPrice: input.buyingPrice,
    totalCost: input.quantity * input.buyingPrice,
    supplier,
    batchNumber,
    expiryDate: appended.batches.find((item) => item.id === appended.ids[0])?.expiryDate ?? null,
    movementCode: isOpening ? "OPENING_STOCK" : "PURCHASE_RECEIVED",
    destination,
    sourceDocumentType: isOpening ? "opening" : "purchase",
    allocations: [
      ...(allocation.mainStore ? [{ location: "Main Store" as const, quantity: allocation.mainStore }] : []),
      ...(allocation.salesFloor ? [{ location: "Sales Floor" as const, quantity: allocation.salesFloor }] : []),
    ],
  };
  const products =
    product && input.sellingPrice != null && Number.isFinite(input.sellingPrice) && input.sellingPrice >= 0
      ? snapshot.products.map((item) =>
          item.id === product.id ? { ...item, sellingPrice: Math.round(input.sellingPrice as number) } : item,
        )
      : snapshot.products;

  setSnapshot({
    ...snapshot,
    products,
    batches: appended.batches,
    movements: [...snapshot.movements, movement],
    suppliers: ensureSupplier(supplier, snapshot.suppliers),
  });

  return {
    batch: appended.batches.find((item) => item.id === appended.ids[0]) ?? null,
    movement,
    newStock: currentStockFor(input.productId, appended.batches),
    error: null,
  };
}

function takeFromLocation(batches: StockBatch[], productId: string, location: StockLocation, amount: number) {
  let remaining = amount;
  const next = batches.map((batch) => ({ ...batch }));
  const ordered = next
    .map((batch, index) => ({ batch, index }))
    .filter(({ batch }) => batch.productId === productId && batch.quantity > 0 && batchLocation(batch) === location)
    .sort((a, b) => {
      const aKey = `${a.batch.expiryDate ?? "9999-12-31"}|${a.batch.receivedAt}`;
      const bKey = `${b.batch.expiryDate ?? "9999-12-31"}|${b.batch.receivedAt}`;
      return aKey.localeCompare(bKey);
    });

  let batchId: string | null = null;
  let buyingPrice = 0;
  let expiryDate: string | null = null;
  let supplier = "";
  for (const { batch, index } of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    next[index] = { ...batch, quantity: batch.quantity - take };
    remaining -= take;
    batchId = batch.id;
    buyingPrice = batch.buyingPrice;
    expiryDate = batch.expiryDate;
    supplier = batch.supplier;
  }
  return { batches: next, remaining, batchId, buyingPrice, expiryDate, supplier };
}

export function adjustStock(input: AdjustStockInput) {
  const product = snapshot.products.find((item) => item.id === input.productId);
  if (!product) return { error: "Select a product." };

  const quantity = Math.abs(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Enter a valid quantity." };
  }

  const delta = adjustmentDelta(input.kind, quantity, input.correctionDirection);
  const location = input.location;
  const current = location
    ? stockAtLocation(input.productId, snapshot.batches, location)
    : currentStockFor(input.productId, snapshot.batches);
  if (delta < 0 && current + delta < 0) {
    return { error: location ? `Decrease cannot make ${location} stock negative.` : "Decrease cannot make stock negative." };
  }

  const stamp = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  let batches = snapshot.batches.map((batch) => ({ ...batch }));
  let batchId: string | null = null;
  const destLocation: StockLocation = location ?? "Main Store";

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
      location: destLocation,
    };
    batches.push(batch);
    batchId = batch.id;
  } else if (location) {
    const taken = takeFromLocation(batches, input.productId, location, -delta);
    if (taken.remaining > 0) {
      return { error: `Decrease cannot make ${location} stock negative.` };
    }
    batches = taken.batches;
    batchId = taken.batchId;
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
    productName: product.name,
    sku: product.sku,
    movementCode: "STOCK_ADJUSTMENT",
    destination: destLocation,
    sourceDocumentType: "adjustment",
  };

  setSnapshot({
    ...snapshot,
    batches,
    movements: [...snapshot.movements, movement],
  });
  return { error: null };
}

export function transferStock(input: TransferStockInput) {
  const product = snapshot.products.find((item) => item.id === input.productId);
  if (!product) return { error: "Select a product." };
  if (input.from === input.to) return { error: "Choose two different locations." };
  const quantity = Math.round(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Enter a quantity greater than zero." };
  const available = stockAtLocation(input.productId, snapshot.batches, input.from);
  if (quantity > available) return { error: `Only ${available} units available in ${input.from}.` };

  const taken = takeFromLocation(snapshot.batches, input.productId, input.from, quantity);
  if (taken.remaining > 0) return { error: `Only ${available} units available in ${input.from}.` };
  const stamp = Date.now();
  const date = new Date().toISOString();
  const destinationBatch: StockBatch = {
    id: `bat-${stamp}-tf`,
    productId: input.productId,
    batchNumber: nextBatchNumber(input.productId, taken.batches),
    quantity,
    expiryDate: taken.expiryDate,
    buyingPrice: taken.buyingPrice || product.buyingPrice,
    supplier: taken.supplier,
    receivedAt: date.slice(0, 10),
    location: input.to,
  };
  const batches = [...taken.batches, destinationBatch];
  const movement: StockMovement = {
    id: `mov-${stamp}`,
    productId: input.productId,
    batchId: destinationBatch.id,
    type: "Transfer",
    quantity,
    date,
    reference: nextTransferReference(),
    note: `${input.from} → ${input.to}`,
    user: input.user?.trim() || "Storekeeper",
    productName: product.name,
    sku: product.sku,
    movementCode: "STOCK_TRANSFER",
    fromLocation: input.from,
    toLocation: input.to,
    sourceDocumentType: "transfer",
    allocations: [
      { location: input.from, quantity: -quantity },
      { location: input.to, quantity },
    ],
  };

  setSnapshot({
    ...snapshot,
    batches,
    movements: [...snapshot.movements, movement],
  });
  return { error: null, movement };
}

function nextTransferReference() {
  const prefix = "TR-";
  let max = 0;
  for (const item of snapshot.movements) {
    if (!item.reference.startsWith(prefix)) continue;
    const value = Number(item.reference.slice(prefix.length));
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextPurchaseOrderNumber(orders = snapshot.purchaseOrders) {
  return nextDocumentNumber(
    "PO",
    orders.map((item) => item.number),
  );
}

export function nextPurchaseNumber(purchases = snapshot.purchases) {
  return nextDocumentNumber(
    "PUR",
    purchases.map((item) => item.number),
  );
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const supplier = snapshot.suppliers.find((item) => item.id === input.supplierId);
  if (!supplier) return { error: "Select a supplier.", order: null as PurchaseOrder | null };
  const lines = input.lines
    .map((line, index) => {
      const product = snapshot.products.find((item) => item.id === line.productId);
      if (!product || line.quantity <= 0 || line.buyingPrice < 0) return null;
      return {
        id: `pol-${Date.now()}-${index}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantityOrdered: Math.round(line.quantity),
        quantityReceived: 0,
        buyingPrice: Math.round(line.buyingPrice),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
  if (!lines.length) return { error: "Add at least one product.", order: null };

  const order: PurchaseOrder = {
    id: `po-${Date.now()}`,
    number: nextPurchaseOrderNumber(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    orderDate: input.orderDate,
    expectedDate: input.expectedDate,
    notes: input.notes?.trim() ?? "",
    status: input.status,
    discount: Math.max(0, Math.round(input.discount ?? 0)),
    tax: Math.max(0, Math.round(input.tax ?? 0)),
    lines,
    createdAt: new Date().toISOString(),
  };

  setSnapshot({
    ...snapshot,
    purchaseOrders: [order, ...snapshot.purchaseOrders],
  });
  return { error: null, order };
}

export function sendPurchaseOrder(orderId: string) {
  const current = snapshot.purchaseOrders.find((item) => item.id === orderId);
  if (!current) return { error: "Purchase order not found." };
  if (current.status !== "Draft") return { error: "Only draft orders can be sent." };
  setSnapshot({
    ...snapshot,
    purchaseOrders: snapshot.purchaseOrders.map((item) =>
      item.id === orderId ? { ...item, status: "Sent" } : item,
    ),
  });
  return { error: null };
}

export function receivePurchaseOrder(input: ReceivePurchaseOrderInput) {
  const order = snapshot.purchaseOrders.find((item) => item.id === input.purchaseOrderId);
  if (!order) return { error: "Purchase order not found." };
  if (order.status !== "Sent" && order.status !== "Partially Received") {
    return { error: "This purchase order cannot be received." };
  }

  const receivedLines = input.lines.filter((line) => line.quantity > 0);
  if (!receivedLines.length) return { error: "Enter a received quantity for at least one product." };

  for (const line of receivedLines) {
    const ordered = order.lines.find((item) => item.productId === line.productId);
    if (!ordered) return { error: "A received product is not on this purchase order." };
    const remaining = ordered.quantityOrdered - ordered.quantityReceived;
    if (line.quantity > remaining) {
      return { error: `${ordered.productName} cannot exceed the remaining ${remaining} units.` };
    }
    if (line.mainStore + line.salesFloor !== line.quantity) {
      return { error: "Stock allocation must equal the received quantity." };
    }
    if (line.mainStore < 0 || line.salesFloor < 0) {
      return { error: "Stock allocation must equal the received quantity." };
    }
  }

  const stamp = Date.now();
  const receivedAt = input.receivedAt || new Date().toISOString();
  let batches = snapshot.batches.map((batch) => ({ ...batch }));
  const movements: StockMovement[] = [];
  const purchaseLines = receivedLines.map((line, index) => {
    const ordered = order.lines.find((item) => item.productId === line.productId)!;
    const product = snapshot.products.find((item) => item.id === line.productId);
    const batchNumber = nextBatchNumber(line.productId, batches);
    const appended = appendLocatedBatches({
      batches,
      productId: line.productId,
      batchNumber,
      expiryDate: null,
      buyingPrice: ordered.buyingPrice,
      supplier: order.supplierName,
      receivedAt: receivedAt.slice(0, 10),
      mainStore: line.mainStore,
      salesFloor: line.salesFloor,
      stamp: stamp + index,
    });
    batches = appended.batches;
    const destination = destinationFromAllocation(line.mainStore, line.salesFloor);
    movements.push({
      id: `mov-${stamp}-${index}`,
      productId: line.productId,
      batchId: appended.ids[0] ?? null,
      type: "Received",
      quantity: line.quantity,
      date: receivedAt,
      reference: order.number,
      note:
        destination === "Split"
          ? `Purchase Received · +${line.mainStore} Main Store · +${line.salesFloor} Sales Floor`
          : `Purchase Received · ${destination}`,
      user: input.user?.trim() || "Storekeeper",
      productName: ordered.productName,
      sku: ordered.sku,
      buyingPrice: ordered.buyingPrice,
      totalCost: line.quantity * ordered.buyingPrice,
      supplier: order.supplierName,
      batchNumber,
      movementCode: "PURCHASE_RECEIVED",
      destination,
      sourceDocumentId: order.id,
      sourceDocumentType: "purchase_order",
      allocations: [
        ...(line.mainStore ? [{ location: "Main Store" as const, quantity: line.mainStore }] : []),
        ...(line.salesFloor ? [{ location: "Sales Floor" as const, quantity: line.salesFloor }] : []),
      ],
    });
    return {
      productId: line.productId,
      productName: ordered.productName,
      sku: ordered.sku,
      quantity: line.quantity,
      buyingPrice: ordered.buyingPrice,
      mainStore: line.mainStore,
      salesFloor: line.salesFloor,
      product,
    };
  });

  const updatedLines = order.lines.map((line) => {
    const received = receivedLines.find((item) => item.productId === line.productId);
    if (!received) return line;
    return { ...line, quantityReceived: line.quantityReceived + received.quantity };
  });
  const status = derivePurchaseOrderStatus(updatedLines, order.status);
  const purchase: Purchase = {
    id: `pur-${stamp}`,
    number: nextPurchaseNumber(),
    purchaseOrderId: order.id,
    purchaseOrderNumber: order.number,
    supplierId: order.supplierId,
    supplierName: order.supplierName,
    receivedAt,
    itemCount: purchaseLines.length,
    totalCost: purchaseLines.reduce((sum, line) => sum + line.quantity * line.buyingPrice, 0),
    paymentStatus: "Unpaid",
    status: "Received",
    receivedBy: input.user?.trim() || "Storekeeper",
    lines: purchaseLines.map(({ product: _product, ...line }) => line),
  };

  setSnapshot({
    ...snapshot,
    batches,
    movements: [...movements, ...snapshot.movements],
    purchaseOrders: snapshot.purchaseOrders.map((item) =>
      item.id === order.id ? { ...item, lines: updatedLines, status } : item,
    ),
    purchases: [purchase, ...snapshot.purchases],
  });

  return { error: null, purchase, orderStatus: status, movements };
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
    transferStock,
    toggleProductActive,
    addInventorySupplier,
    createSupplierRecord,
    nextGoodsReceivedReference,
    nextPurchaseOrderNumber,
    nextPurchaseNumber,
    createPurchaseOrder,
    sendPurchaseOrder,
    receivePurchaseOrder,
  };
}

export type {
  Purchase,
  PurchaseOrder,
  StockLocation,
  Supplier,
} from "@/lib/data/supermarket-purchasing";

export const SUPERMARKET_SAMPLE_PRODUCTS = INITIAL.products;
