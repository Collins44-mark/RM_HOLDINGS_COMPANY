import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
} from "@/lib/supermarket/access";
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
import type {
  InventorySnapshot,
  PurchaseOrder,
  Purchase,
  StockMovement,
  SupermarketCategory,
  SupermarketProduct,
  Supplier,
  StockBatch,
} from "@/lib/supermarket/types";

function queryErrorMessage(error: unknown) {
  return actionErrorMessage(error);
}

function firstQueryError(
  ...results: Array<{ error: { message: string; code?: string } | null }>
) {
  for (const result of results) {
    if (result.error) return result.error;
  }
  return null;
}

/** Map PostgREST/Postgres errors to actionable messages (privilege vs real DB). */
function failMessage(error: { message: string; code?: string }) {
  try {
    mapDbError(error);
  } catch (mapped) {
    return queryErrorMessage(mapped);
  }
  return error.message;
}

const PO_LIMIT = 100;
const RECEIPT_LIMIT = 100;
const MOVEMENT_LIMIT = 200;

const PO_COLUMNS =
  "id, po_number, supplier_id, order_date, expected_date, status, discount, tax, notes, created_at, total";
const RECEIPT_COLUMNS =
  "id, receipt_number, purchase_order_id, supplier_id, received_at, payment_status, total_cost, notes";
const PO_ITEM_COLUMNS =
  "id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost";
const RECEIPT_ITEM_COLUMNS =
  "id, goods_receipt_id, product_id, quantity, unit_cost, main_store_qty, sales_floor_qty";


const PRODUCT_COLUMNS =
  "id, name, sku, barcode, category_id, unit, buying_price, selling_price, reorder_level, track_expiry, is_active, created_at, supplier_id";
const CATEGORY_COLUMNS = "id, name, description, is_active";
const SUPPLIER_COLUMNS =
  "id, name, contact_person, phone, email, address, status, notes, created_at";
const BATCH_COLUMNS =
  "id, product_id, batch_number, quantity, expiry_date, buying_price, supplier_id, received_at, location";
const MOVEMENT_COLUMNS =
  "id, product_id, batch_id, movement_code, quantity, created_at, reference, note, reason, from_location, to_location, source_document_id, source_document_type, created_by";

export type ProductsWorkspace = {
  products: SupermarketProduct[];
  categories: SupermarketCategory[];
  suppliers: Supplier[];
  batches: StockBatch[];
  error: string | null;
};

export type PurchasingWorkspace = {
  purchaseOrders: PurchaseOrder[];
  purchases: Purchase[];
  error: string | null;
};

/** Products page / POS / promotions — no POs, receipts, or movements. */
export async function loadProductsWorkspace(): Promise<ProductsWorkspace> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const [categoriesRes, productsRes, suppliersRes, batchesRes] = await Promise.all([
      supabase
        .from("sm_categories")
        .select(CATEGORY_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_products")
        .select(PRODUCT_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_suppliers")
        .select(SUPPLIER_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_stock_batches")
        .select(BATCH_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .gt("quantity", 0),
    ]);

    const err = firstQueryError(categoriesRes, productsRes, suppliersRes, batchesRes);
    if (err) {
      return {
        products: [],
        categories: [],
        suppliers: [],
        batches: [],
        error: failMessage(err),
      };
    }

    const categories = (categoriesRes.data ?? []).map((row) =>
      mapCategory(row as Record<string, unknown>),
    );
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const suppliers = (suppliersRes.data ?? []).map((row) =>
      mapSupplier(row as Record<string, unknown>),
    );
    const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));
    const products = (productsRes.data ?? []).map((row) =>
      mapProduct(row as Record<string, unknown>, categoryNameById),
    );
    const batches = (batchesRes.data ?? []).map((row) =>
      mapBatch(row as Record<string, unknown>, supplierNameById),
    );

    // Empty arrays are success — never treat zero rows as an error.
    return { products, categories, suppliers, batches, error: null };
  } catch (error) {
    return {
      products: [],
      categories: [],
      suppliers: [],
      batches: [],
      error: queryErrorMessage(error),
    };
  }
}

/** Purchase orders + goods receipts only (requires product/supplier names from workspace). */
export async function loadPurchasingWorkspace(input?: {
  productNameById?: Map<string, string>;
  productSkuById?: Map<string, string>;
  supplierNameById?: Map<string, string>;
}): Promise<PurchasingWorkspace> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const [poRes, receiptsRes] = await Promise.all([
      supabase
        .from("sm_purchase_orders")
        .select(PO_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("created_at", { ascending: false })
        .limit(PO_LIMIT),
      supabase
        .from("sm_goods_receipts")
        .select(RECEIPT_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("received_at", { ascending: false })
        .limit(RECEIPT_LIMIT),
    ]);
    const parentErr = firstQueryError(poRes, receiptsRes);
    if (parentErr) {
      return { purchaseOrders: [], purchases: [], error: failMessage(parentErr) };
    }

    let productNameById = input?.productNameById;
    let productSkuById = input?.productSkuById;
    let supplierNameById = input?.supplierNameById;

    if (!productNameById || !productSkuById || !supplierNameById) {
      const [productsRes, suppliersRes] = await Promise.all([
        supabase
          .from("sm_products")
          .select("id, name, sku")
          .eq("business_unit_id", businessUnitId),
        supabase.from("sm_suppliers").select("id, name").eq("business_unit_id", businessUnitId),
      ]);
      productNameById = new Map((productsRes.data ?? []).map((p) => [p.id as string, String(p.name)]));
      productSkuById = new Map((productsRes.data ?? []).map((p) => [p.id as string, String(p.sku)]));
      supplierNameById = new Map(
        (suppliersRes.data ?? []).map((s) => [s.id as string, String(s.name)]),
      );
    }

    const poIds = (poRes.data ?? []).map((row) => row.id as string);
    const receiptIds = (receiptsRes.data ?? []).map((row) => row.id as string);

    const [poItemsRes, receiptItemsRes] = await Promise.all([
      poIds.length
        ? supabase.from("sm_purchase_order_items").select(PO_ITEM_COLUMNS).in("purchase_order_id", poIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      receiptIds.length
        ? supabase.from("sm_goods_receipt_items").select(RECEIPT_ITEM_COLUMNS).in("goods_receipt_id", receiptIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ]);
    const itemsErr = firstQueryError(poItemsRes, receiptItemsRes);
    if (itemsErr) {
      return { purchaseOrders: [], purchases: [], error: failMessage(itemsErr) };
    }

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

    return { purchaseOrders, purchases, error: null };
  } catch (error) {
    return {
      purchaseOrders: [],
      purchases: [],
      error: queryErrorMessage(error),
    };
  }
}

export async function loadStockMovements(limit = MOVEMENT_LIMIT): Promise<{
  movements: StockMovement[];
  error: string | null;
}> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_stock_movements")
      .select(MOVEMENT_COLUMNS)
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { movements: [], error: failMessage(error) };
    return {
      movements: (data ?? []).map((row) => mapMovement(row as Record<string, unknown>)),
      error: null,
    };
  } catch (error) {
    return {
      movements: [],
      error: queryErrorMessage(error),
    };
  }
}

/** Single-product movements for Products history drawer. */
export async function loadProductMovements(productId: string): Promise<{
  movements: StockMovement[];
  error: string | null;
}> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_stock_movements")
      .select(MOVEMENT_COLUMNS)
      .eq("business_unit_id", businessUnitId)
      .eq("product_id", productId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) return { movements: [], error: failMessage(error) };
    return {
      movements: (data ?? []).map((row) => mapMovement(row as Record<string, unknown>)),
      error: null,
    };
  } catch (error) {
    return {
      movements: [],
      error: queryErrorMessage(error),
    };
  }
}

/** Products + live batches only — for inventory valuation reports (no POs/receipts/movements). */
export async function loadInventoryValuation(): Promise<{
  products: SupermarketProduct[];
  batches: StockBatch[];
  error: string | null;
}> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const [productsRes, categoriesRes, suppliersRes, batchesRes] = await Promise.all([
      supabase
        .from("sm_products")
        .select(PRODUCT_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_categories")
        .select(CATEGORY_COLUMNS)
        .eq("business_unit_id", businessUnitId),
      supabase
        .from("sm_suppliers")
        .select("id, name")
        .eq("business_unit_id", businessUnitId),
      supabase
        .from("sm_stock_batches")
        .select(BATCH_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .gt("quantity", 0),
    ]);

    const err = firstQueryError(productsRes, categoriesRes, suppliersRes, batchesRes);
    if (err) {
      return { products: [], batches: [], error: failMessage(err) };
    }

    const categories = (categoriesRes.data ?? []).map((row) =>
      mapCategory(row as Record<string, unknown>),
    );
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const supplierNameById = new Map(
      (suppliersRes.data ?? []).map((s) => [s.id as string, String(s.name)]),
    );
    const products = (productsRes.data ?? []).map((row) =>
      mapProduct(row as Record<string, unknown>, categoryNameById),
    );
    const batches = (batchesRes.data ?? []).map((row) =>
      mapBatch(row as Record<string, unknown>, supplierNameById),
    );

    return { products, batches, error: null };
  } catch (error) {
    return { products: [], batches: [], error: queryErrorMessage(error) };
  }
}

/**
 * Full snapshot for rare full refresh.
 * Prefer scoped loaders / loadInventoryValuation for UI pages and reports.
 */
export async function loadInventorySnapshot(): Promise<InventorySnapshot> {
  const productsWs = await loadProductsWorkspace();
  if (productsWs.error) return emptySnapshot(productsWs.error);

  const productNameById = new Map(productsWs.products.map((p) => [p.id, p.name]));
  const productSkuById = new Map(productsWs.products.map((p) => [p.id, p.sku]));
  const supplierNameById = new Map(productsWs.suppliers.map((s) => [s.id, s.name]));

  const [purchasing, movements] = await Promise.all([
    loadPurchasingWorkspace({ productNameById, productSkuById, supplierNameById }),
    loadStockMovements(),
  ]);

  if (purchasing.error) return emptySnapshot(purchasing.error);
  if (movements.error) return emptySnapshot(movements.error);

  return {
    products: productsWs.products,
    batches: productsWs.batches,
    categories: productsWs.categories,
    suppliers: productsWs.suppliers,
    purchaseOrders: purchasing.purchaseOrders,
    purchases: purchasing.purchases,
    movements: movements.movements,
    loadedAt: new Date().toISOString(),
    error: null,
  };
}

/** Lightweight catalog for Add Product form — no batches/purchasing/movements. */
export async function loadCatalogOptions(): Promise<{
  products: InventorySnapshot["products"];
  categories: InventorySnapshot["categories"];
  suppliers: InventorySnapshot["suppliers"];
  error: string | null;
}> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const [categoriesRes, productsRes, suppliersRes] = await Promise.all([
      supabase
        .from("sm_categories")
        .select(CATEGORY_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_products")
        .select(PRODUCT_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sm_suppliers")
        .select(SUPPLIER_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("name"),
    ]);

    const err = firstQueryError(categoriesRes, productsRes, suppliersRes);
    if (err) {
      return { products: [], categories: [], suppliers: [], error: failMessage(err) };
    }

    const categories = (categoriesRes.data ?? []).map((row) =>
      mapCategory(row as Record<string, unknown>),
    );
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const products = (productsRes.data ?? []).map((row) =>
      mapProduct(row as Record<string, unknown>, categoryNameById),
    );
    const suppliers = (suppliersRes.data ?? []).map((row) =>
      mapSupplier(row as Record<string, unknown>),
    );

    return { products, categories, suppliers, error: null };
  } catch (error) {
    return {
      products: [],
      categories: [],
      suppliers: [],
      error: queryErrorMessage(error),
    };
  }
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
