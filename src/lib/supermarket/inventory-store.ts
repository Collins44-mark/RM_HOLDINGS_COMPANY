"use client";

import { useSyncExternalStore } from "react";
import {
  adjustStockAction,
  createCategoryAction,
  createPurchaseOrderAction,
  createSupplierAction,
  deleteCategoryAction,
  fetchInventorySnapshotAction,
  receivePurchaseOrderAction,
  sendPurchaseOrderAction,
  setCategoryActiveAction,
  toggleProductActiveAction,
  updateCategoryAction,
  upsertProductAction,
} from "@/actions/supermarket/catalog";
import {
  EMPTY_INVENTORY_SNAPSHOT,
  type InventorySnapshot,
  type SupermarketCategory,
  type SupermarketProduct,
} from "@/lib/supermarket/types";
import type {
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  Purchase,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  TransferStockInput,
} from "@/lib/data/supermarket-purchasing";

export type AdjustStockInput = {
  productId: string;
  kind: string;
  quantity: number;
  reason?: string;
  note?: string;
  correctionDirection?: "increase" | "decrease";
  user?: string;
  location?: "Main Store" | "Sales Floor";
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
  location?: "Main Store" | "Sales Floor";
  mainStore?: number;
  salesFloor?: number;
};

let snapshot: InventorySnapshot = { ...EMPTY_INVENTORY_SNAPSHOT };
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: InventorySnapshot) {
  snapshot = next;
  emit();
}

export function subscribeInventory(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getInventorySnapshot() {
  return snapshot;
}

export function getInventoryServerSnapshot() {
  return EMPTY_INVENTORY_SNAPSHOT;
}

export async function refreshInventorySnapshot() {
  const next = await fetchInventorySnapshotAction();
  setSnapshot(next);
}

export function ensureInventoryLoaded() {
  if (snapshot.loadedAt || loadPromise) return loadPromise;
  loadPromise = refreshInventorySnapshot()
    .catch((error) => {
      setSnapshot({
        ...EMPTY_INVENTORY_SNAPSHOT,
        error: error instanceof Error ? error.message : "Failed to load inventory",
      });
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

export function categoryProductCount(name: string, products = snapshot.products) {
  return products.filter((item) => item.category === name).length;
}

export async function addProductCategory(input: { name: string; description?: string }) {
  const result = await createCategoryAction(input);
  if (!result.ok) {
    return { error: result.error, category: null as SupermarketCategory | null };
  }
  await refreshInventorySnapshot();
  const category = snapshot.categories.find((c) => c.id === result.category.id) ?? {
    id: result.category.id as string,
    name: String(result.category.name ?? input.name),
    description: String(result.category.description ?? ""),
    isActive: true,
  };
  return { error: null, category };
}

export async function updateProductCategory(
  id: string,
  input: { name: string; description?: string },
) {
  const previous = snapshot.categories.find((item) => item.id === id);
  const result = await updateCategoryAction(id, input);
  if (!result.ok) {
    return {
      error: result.error,
      category: null as SupermarketCategory | null,
      previousName: previous?.name ?? null,
    };
  }
  await refreshInventorySnapshot();
  const category = snapshot.categories.find((c) => c.id === id) ?? null;
  return { error: null, category, previousName: previous?.name ?? null };
}

export async function deleteProductCategory(id: string) {
  const current = snapshot.categories.find((item) => item.id === id);
  const result = await deleteCategoryAction(id);
  if (!result.ok) {
    return {
      error: result.error,
      inUse: result.error.toLowerCase().includes("in use"),
    };
  }
  await refreshInventorySnapshot();
  return { error: null, inUse: false, name: current?.name };
}

export async function setProductCategoryActive(id: string, isActive: boolean) {
  const result = await setCategoryActiveAction(id, isActive);
  if (!result.ok) return { error: result.error };
  await refreshInventorySnapshot();
  return { error: null };
}

export async function upsertProduct(product: SupermarketProduct) {
  const result = await upsertProductAction(product);
  if (!result.ok) return { error: result.error };
  await refreshInventorySnapshot();
  return { error: null, id: result.id };
}

export async function toggleProductActive(productId: string) {
  const result = await toggleProductActiveAction(productId);
  if (!result.ok) return { error: result.error };
  await refreshInventorySnapshot();
  return { error: null };
}

export function nextGoodsReceivedReference() {
  const numbers = snapshot.purchases
    .map((p) => p.number)
    .concat(snapshot.movements.map((m) => m.reference))
    .filter(Boolean);
  const max = numbers.reduce((acc, value) => {
    const match = value.match(/(\d+)$/);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `GRN-${String(max + 1).padStart(5, "0")}`;
}

export async function addInventorySupplier(name: string) {
  const result = await createSupplierAction({ name });
  if (!result.ok) return { error: result.error, name: null as string | null };
  await refreshInventorySnapshot();
  return { error: null, name: name.trim() };
}

export async function createSupplierRecord(input: CreateSupplierInput) {
  const result = await createSupplierAction({
    name: input.name,
    contactPerson: input.contactPerson,
    phone: input.phone,
    email: input.email,
    address: input.address,
  });
  if (!result.ok) return { error: result.error, supplier: null };
  await refreshInventorySnapshot();
  const supplier = snapshot.suppliers.find((s) => s.id === result.id) ?? null;
  return { error: null, supplier };
}

export async function receiveStock(input: ReceiveStockInput) {
  const kind = input.type === "Opening Stock" ? "Opening Balance" : "Increase";
  const before = snapshot.batches
    .filter((batch) => batch.productId === input.productId)
    .reduce((sum, batch) => sum + batch.quantity, 0);
  const result = await adjustStockAction({
    productId: input.productId,
    kind,
    quantity: input.quantity,
    location: input.location ?? "Main Store",
    reason: input.reference ?? "",
    note: input.note ?? "",
  });
  if (!result.ok) return { error: result.error, movement: null, newStock: before };
  await refreshInventorySnapshot();
  const newStock = before + input.quantity;
  return {
    error: null,
    newStock,
    movement: {
      id: result.id,
      productId: input.productId,
      quantity: input.quantity,
      reference: input.reference ?? "GRN",
      type: input.type ?? "Received",
    },
  };
}

export async function adjustStock(input: AdjustStockInput) {
  const result = await adjustStockAction({
    productId: input.productId,
    kind: input.kind,
    quantity: input.quantity,
    location: input.location,
    reason: input.reason,
    note: input.note,
    correctionDirection: input.correctionDirection,
  });
  if (!result.ok) return { error: result.error };
  await refreshInventorySnapshot();
  return { error: null };
}

export async function transferStock(input: TransferStockInput) {
  const out = await adjustStockAction({
    productId: input.productId,
    kind: "Decrease",
    quantity: input.quantity,
    location: input.from,
    reason: "Transfer",
    note: `Transfer to ${input.to}`,
  });
  if (!out.ok) return { error: out.error };
  const inn = await adjustStockAction({
    productId: input.productId,
    kind: "Increase",
    quantity: input.quantity,
    location: input.to,
    reason: "Transfer",
    note: `Transfer from ${input.from}`,
  });
  if (!inn.ok) return { error: inn.error };
  await refreshInventorySnapshot();
  return { error: null };
}

export function nextPurchaseOrderNumber() {
  const max = snapshot.purchaseOrders.reduce((acc, po) => {
    const match = po.number.match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `PO-${String(max + 1).padStart(5, "0")}`;
}

export function nextPurchaseNumber() {
  const max = snapshot.purchases.reduce((acc, p) => {
    const match = p.number.match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `GRN-${String(max + 1).padStart(5, "0")}`;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const result = await createPurchaseOrderAction({
    supplierId: input.supplierId,
    orderDate: input.orderDate,
    expectedDate: input.expectedDate,
    discount: input.discount,
    tax: input.tax,
    notes: input.notes,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantityOrdered: line.quantity,
      buyingPrice: line.buyingPrice,
    })),
  });
  if (!result.ok) return { error: result.error, order: null as PurchaseOrder | null };

  if (input.status === "Sent") {
    await sendPurchaseOrderAction(result.id);
  }

  await refreshInventorySnapshot();
  const order = snapshot.purchaseOrders.find((item) => item.id === result.id) ?? null;
  return { error: null, order };
}

export async function sendPurchaseOrder(orderId: string) {
  const result = await sendPurchaseOrderAction(orderId);
  if (!result.ok) return { error: result.error };
  await refreshInventorySnapshot();
  return { error: null };
}

export async function receivePurchaseOrder(input: ReceivePurchaseOrderInput) {
  const order = snapshot.purchaseOrders.find((item) => item.id === input.purchaseOrderId);
  if (!order) return { error: "Purchase order not found.", purchase: null as Purchase | null };

  const lines = input.lines
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const poLine = order.lines.find((item) => item.productId === line.productId);
      return {
        purchaseOrderItemId: poLine?.id ?? "",
        quantity: line.quantity,
        unitCost: poLine?.buyingPrice,
        mainStoreQty: line.mainStore,
        salesFloorQty: line.salesFloor,
      };
    });

  if (lines.some((line) => !line.purchaseOrderItemId)) {
    return { error: "A received product is not on this purchase order.", purchase: null };
  }

  const result = await receivePurchaseOrderAction({
    purchaseOrderId: input.purchaseOrderId,
    lines,
  });
  if (!result.ok) return { error: result.error, purchase: null };

  await refreshInventorySnapshot();
  const purchase = snapshot.purchases.find((item) => item.id === result.id) ?? null;
  const updatedOrder = snapshot.purchaseOrders.find((item) => item.id === input.purchaseOrderId);
  return {
    error: null,
    purchase,
    orderStatus: updatedOrder?.status,
  };
}

export const NEW_PRODUCT_BARCODE_KEY = "rm-supermarket-new-product-barcode";

export function rememberNewProductBarcode(barcode: string) {
  try {
    sessionStorage.setItem(NEW_PRODUCT_BARCODE_KEY, barcode);
  } catch {
    // ignore
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

export function useSupermarketInventory() {
  const state = useSyncExternalStore(subscribeInventory, getInventorySnapshot, getInventoryServerSnapshot);

  if (typeof window !== "undefined") {
    ensureInventoryLoaded();
  }

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
    refresh: refreshInventorySnapshot,
  };
}
