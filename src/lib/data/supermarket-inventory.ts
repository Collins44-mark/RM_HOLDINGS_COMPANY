"use client";

import type {
  Purchase,
  PurchaseOrder,
  StockLocation,
  StockMovementCode,
  Supplier,
} from "@/lib/data/supermarket-purchasing";
import {
  addProductCategory,
  adjustStock,
  categoryProductCount,
  consumeNewProductBarcode,
  createPurchaseOrder,
  createSupplierRecord,
  deleteProductCategory,
  nextGoodsReceivedReference,
  nextPurchaseNumber,
  nextPurchaseOrderNumber,
  receivePurchaseOrder,
  receiveStock,
  rememberNewProductBarcode,
  sendPurchaseOrder,
  setProductCategoryActive,
  toggleProductActive,
  transferStock,
  updateProductCategory,
  upsertProduct,
  useSupermarketInventory,
  refreshInventorySnapshot,
  fetchProductMovements,
  NEW_PRODUCT_BARCODE_KEY,
} from "@/lib/supermarket/inventory-store";

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
export { NEW_PRODUCT_BARCODE_KEY };

export type SupermarketProductCategory = string;
export type SupermarketProductUnit = string;
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
  movementCode?: string;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  destination?: StockLocation | "Split";
  sourceDocumentId?: string;
  sourceDocumentType?: string;
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
  loadedAt?: string | null;
  error?: string | null;
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

export {
  addProductCategory,
  adjustStock,
  categoryProductCount,
  consumeNewProductBarcode,
  createPurchaseOrder,
  createSupplierRecord,
  deleteProductCategory,
  nextGoodsReceivedReference,
  nextPurchaseNumber,
  nextPurchaseOrderNumber,
  receivePurchaseOrder,
  receiveStock,
  rememberNewProductBarcode,
  sendPurchaseOrder,
  setProductCategoryActive,
  toggleProductActive,
  transferStock,
  updateProductCategory,
  upsertProduct,
  useSupermarketInventory,
  refreshInventorySnapshot,
  fetchProductMovements,
};

export type {
  Purchase,
  PurchaseOrder,
  StockLocation,
  Supplier,
} from "@/lib/data/supermarket-purchasing";

/** Sample catalogue removed — use live Supabase data. */
export const SUPERMARKET_SAMPLE_PRODUCTS: SupermarketProduct[] = [];
