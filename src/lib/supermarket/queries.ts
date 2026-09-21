import { requireSupermarketContext, mapDbError } from "@/lib/supermarket/access";
import {
  emptySnapshot,
  mapBatch,
  mapCategory,
  mapMovement,
  mapProduct,
  mapPurchase,
  mapPurchaseOrder,
  mapSupplier,
} from "@/lib/supermarket/mappers";
import type { InventorySnapshot, PurchaseOrder, Purchase } from "@/lib/supermarket/types";

export async function loadInventorySnapshot(): Promise<InventorySnapshot> {
  const { supabase, businessUnitId } = await requireSupermarketContext();

  const [
    categoriesRes,
    productsRes,
    suppliersRes,
    batchesRes,
    movementsRes,
    poRes,
    poItemsRes,
    receiptsRes,
    receiptItemsRes,
  ] = await Promise.all([
    supabase.from("sm_categories").select("*").eq("business_unit_id", businessUnitId).order("name"),
    supabase.from("sm_products").select("*").eq("business_unit_id", businessUnitId).order("name"),
    supabase.from("sm_suppliers").select("*").eq("business_unit_id", businessUnitId).order("name"),
    supabase.from("sm_stock_batches").select("*").eq("business_unit_id", businessUnitId).gt("quantity", 0),
    supabase
      .from("sm_stock_movements")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("sm_purchase_orders")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false }),
    supabase.from("sm_purchase_order_items").select("*"),
    supabase
      .from("sm_goods_receipts")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("received_at", { ascending: false }),
    supabase.from("sm_goods_receipt_items").select("*"),
  ]);

  const firstError =
    categoriesRes.error ||
    productsRes.error ||
    suppliersRes.error ||
    batchesRes.error ||
    movementsRes.error ||
    poRes.error ||
    poItemsRes.error ||
    receiptsRes.error ||
    receiptItemsRes.error;

  if (firstError) {
    return emptySnapshot(firstError.message);
  }

  const categories = (categoriesRes.data ?? []).map((row) => mapCategory(row as Record<string, unknown>));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const suppliers = (suppliersRes.data ?? []).map((row) => mapSupplier(row as Record<string, unknown>));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  const products = (productsRes.data ?? []).map((row) =>
    mapProduct(row as Record<string, unknown>, categoryNameById),
  );
  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const productSkuById = new Map(products.map((p) => [p.id, p.sku]));

  const batches = (batchesRes.data ?? []).map((row) =>
    mapBatch(row as Record<string, unknown>, supplierNameById),
  );
  const movements = (movementsRes.data ?? []).map((row) => mapMovement(row as Record<string, unknown>));

  const poItemsByPo = new Map<string, PurchaseOrder["lines"]>();
  for (const raw of poItemsRes.data ?? []) {
    const row = raw as Record<string, unknown>;
    const poId = String(row.purchase_order_id);
    const list = poItemsByPo.get(poId) ?? [];
    const productId = String(row.product_id);
    list.push({
      id: String(row.id),
      productId,
      productName: productNameById.get(productId) ?? "Product",
      sku: productSkuById.get(productId) ?? "",
      quantityOrdered: Number(row.quantity_ordered) || 0,
      quantityReceived: Number(row.quantity_received) || 0,
      buyingPrice: Number(row.unit_cost) || 0,
    });
    poItemsByPo.set(poId, list);
  }

  const purchaseOrders = (poRes.data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return mapPurchaseOrder(
      row,
      poItemsByPo.get(String(row.id)) ?? [],
      supplierNameById.get(String(row.supplier_id)) ?? "Supplier",
    );
  });

  const receiptItemsByReceipt = new Map<string, Purchase["lines"]>();
  for (const raw of receiptItemsRes.data ?? []) {
    const row = raw as Record<string, unknown>;
    const receiptId = String(row.goods_receipt_id);
    const list = receiptItemsByReceipt.get(receiptId) ?? [];
    const productId = String(row.product_id);
    list.push({
      id: String(row.id),
      productId,
      productName: productNameById.get(productId) ?? "Product",
      sku: productSkuById.get(productId) ?? "",
      quantity: Number(row.quantity) || 0,
      buyingPrice: Number(row.unit_cost) || 0,
      mainStore: Number(row.main_store_qty) || 0,
      salesFloor: Number(row.sales_floor_qty) || 0,
    });
    receiptItemsByReceipt.set(receiptId, list);
  }

  const poNumberById = new Map(purchaseOrders.map((po) => [po.id, po.number]));
  const purchases = (receiptsRes.data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const poId = row.purchase_order_id ? String(row.purchase_order_id) : null;
    return mapPurchase(
      row,
      receiptItemsByReceipt.get(String(row.id)) ?? [],
      supplierNameById.get(String(row.supplier_id)) ?? "Supplier",
      poId ? poNumberById.get(poId) ?? null : null,
    );
  });

  return {
    products,
    batches,
    movements,
    categories,
    suppliers,
    purchaseOrders,
    purchases,
    loadedAt: new Date().toISOString(),
    error: null,
  };
}

export async function getSupermarketBusinessUnitId() {
  const { businessUnitId } = await requireSupermarketContext();
  return businessUnitId;
}

/** Lightweight check used by UI loaders. */
export async function pingSupermarketTables() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { error } = await supabase
      .from("sm_products")
      .select("id", { count: "exact", head: true })
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Database unavailable",
    };
  }
}
