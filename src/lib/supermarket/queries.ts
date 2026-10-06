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
  mapPaymentRequest,
  mapPaymentStatus,
  mapProduct,
  mapPurchaseOrder,
  mapSupplier,
  mapSupplierInvoice,
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
  SupplierInvoice,
  SupplierPaymentRequest,
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

const PO_COLUMNS_BASE =
  "id, po_number, supplier_id, order_date, expected_date, status, discount, tax, notes, created_at, created_by, total";
const PO_COLUMNS = `${PO_COLUMNS_BASE}, purchase_document_number`;
const RECEIPT_COLUMNS =
  "id, receipt_number, purchase_order_id, supplier_id, received_at, payment_status, total_cost, notes";
const INVOICE_COLUMNS =
  "id, invoice_number, supplier_id, purchase_order_id, goods_receipt_id, invoice_date, due_date, subtotal, tax, total, amount_paid, verification_status, payment_status, notes, rejection_reason, discrepancies, created_by";
const INVOICE_ITEM_COLUMNS = "id, invoice_id, product_id, quantity, unit_cost, tax, line_total";
const PAYMENT_REQUEST_COLUMNS =
  "id, request_number, supplier_id, invoice_id, amount, method, due_date, reference, notes, status, prepared_by, posted_payment_id";
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
  supplierInvoices: SupplierInvoice[];
  paymentRequests: SupplierPaymentRequest[];
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
    const [poResPrimary, receiptsRes, invoiceRes, requestRes] = await Promise.all([
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
      supabase
        .from("sm_supplier_invoices")
        .select(INVOICE_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("created_at", { ascending: false })
        .limit(RECEIPT_LIMIT),
      supabase
        .from("sm_supplier_payment_requests")
        .select(PAYMENT_REQUEST_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .order("created_at", { ascending: false })
        .limit(RECEIPT_LIMIT),
    ]);
    const poRes =
      poResPrimary.error && /purchase_document_number/i.test(poResPrimary.error.message)
        ? await supabase
            .from("sm_purchase_orders")
            .select(PO_COLUMNS_BASE)
            .eq("business_unit_id", businessUnitId)
            .order("created_at", { ascending: false })
            .limit(PO_LIMIT)
        : poResPrimary;
    const invoiceMissing =
      Boolean(invoiceRes.error) && /sm_supplier_invoices|does not exist|PGRST/i.test(invoiceRes.error?.message ?? "");
    const requestMissing =
      Boolean(requestRes.error) && /sm_supplier_payment_requests|does not exist|PGRST/i.test(requestRes.error?.message ?? "");
    const parentErr = firstQueryError(
      poRes,
      receiptsRes,
      invoiceMissing ? { error: null } : invoiceRes,
      requestMissing ? { error: null } : requestRes,
    );
    if (parentErr) {
      return {
        purchaseOrders: [],
        purchases: [],
        supplierInvoices: [],
        paymentRequests: [],
        error: failMessage(parentErr),
      };
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
    const names = productNameById ?? new Map<string, string>();
    const skus = productSkuById ?? new Map<string, string>();
    const supplierNamesById = supplierNameById ?? new Map<string, string>();

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
      return {
        purchaseOrders: [],
        purchases: [],
        supplierInvoices: [],
        paymentRequests: [],
        error: failMessage(itemsErr),
      };
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
        productName: names.get(productId) ?? "Product",
        sku: skus.get(productId) ?? "",
        quantityOrdered: Number(row.quantity_ordered) || 0,
        quantityReceived: Number(row.quantity_received) || 0,
        buyingPrice: Number(row.unit_cost) || 0,
      });
      poItemsByPo.set(poId, list);
    }

    const mappedOrders = (poRes.data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return mapPurchaseOrder(
        row,
        poItemsByPo.get(String(row.id)) ?? [],
        supplierNamesById.get(String(row.supplier_id)) ?? "Supplier",
      );
    });
    const seenPoIds = new Set<string>();
    const purchaseOrders = mappedOrders.filter((order) => {
      if (seenPoIds.has(order.id)) return false;
      seenPoIds.add(order.id);
      return true;
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
        productName: names.get(productId) ?? "Product",
        sku: skus.get(productId) ?? "",
        quantity: Number(row.quantity) || 0,
        buyingPrice: Number(row.unit_cost) || 0,
        mainStore: Number(row.main_store_qty) || 0,
        salesFloor: Number(row.sales_floor_qty) || 0,
      });
      receiptItemsByReceipt.set(receiptId, list);
    }

    const poNumberById = new Map(purchaseOrders.map((po) => [po.id, po.number]));
    const receiptNumberById = new Map(
      (receiptsRes.data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return [String(row.id), String(row.receipt_number ?? "")] as const;
      }),
    );

    const invoiceRows = invoiceMissing ? [] : (invoiceRes.data ?? []);
    const requestRows = requestMissing ? [] : (requestRes.data ?? []);
    const invoiceIds = invoiceRows.map((row) => row.id as string);
    const invoiceItemsRes = invoiceIds.length
      ? await supabase.from("sm_supplier_invoice_items").select(INVOICE_ITEM_COLUMNS).in("invoice_id", invoiceIds)
      : { data: [] as Record<string, unknown>[], error: null };
    if (invoiceItemsRes.error) {
      return {
        purchaseOrders: [],
        purchases: [],
        supplierInvoices: [],
        paymentRequests: [],
        error: failMessage(invoiceItemsRes.error),
      };
    }

    const invoiceItemsById = new Map<string, SupplierInvoice["lines"]>();
    for (const raw of invoiceItemsRes.data ?? []) {
      const row = raw as Record<string, unknown>;
      const invoiceId = String(row.invoice_id);
      const list = invoiceItemsById.get(invoiceId) ?? [];
      const productId = String(row.product_id);
      list.push({
        id: String(row.id),
        productId,
        productName: names.get(productId) ?? "Product",
        sku: skus.get(productId) ?? "",
        quantity: Number(row.quantity) || 0,
        unitCost: Number(row.unit_cost) || 0,
        tax: Number(row.tax) || 0,
        lineTotal: Number(row.line_total) || 0,
      });
      invoiceItemsById.set(invoiceId, list);
    }

    const supplierInvoices = invoiceRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const poId = row.purchase_order_id ? String(row.purchase_order_id) : "";
      const receiptId = row.goods_receipt_id ? String(row.goods_receipt_id) : "";
      return mapSupplierInvoice(
        row,
        invoiceItemsById.get(String(row.id)) ?? [],
        supplierNamesById.get(String(row.supplier_id)) ?? "Supplier",
        poId ? poNumberById.get(poId) ?? "" : "",
        receiptId ? receiptNumberById.get(receiptId) ?? "" : "",
      );
    });

    const invoiceNumberById = new Map(supplierInvoices.map((item) => [item.id, item.number]));
    const paymentByPo = new Map<string, Purchase["paymentStatus"]>();
    for (const invoice of supplierInvoices) {
      if (invoice.purchaseOrderId && invoice.verificationStatus === "Verified") {
        paymentByPo.set(invoice.purchaseOrderId, invoice.paymentStatus);
      }
    }

    const purchasesByPo = new Map<string, Purchase>();
    for (const raw of receiptsRes.data ?? []) {
      const row = raw as Record<string, unknown>;
      const poId = row.purchase_order_id ? String(row.purchase_order_id) : "";
      if (!poId) continue;
      const receiptLines = receiptItemsByReceipt.get(String(row.id)) ?? [];
      const receipt = {
        id: String(row.id),
        number: String(row.receipt_number ?? ""),
        receivedAt: String(row.received_at ?? ""),
        itemCount: receiptLines.reduce((sum, line) => sum + line.quantity, 0),
        totalCost: Number(row.total_cost) || 0,
      };
      const existing = purchasesByPo.get(poId);
      if (existing) {
        existing.receipts.push(receipt);
        existing.totalCost += receipt.totalCost;
        existing.itemCount += receipt.itemCount;
        if (receipt.receivedAt > existing.receivedAt) existing.receivedAt = receipt.receivedAt;
        for (const line of receiptLines) {
          const prior = existing.lines.find((item) => item.productId === line.productId);
          if (prior) {
            prior.quantity += line.quantity;
            prior.mainStore += line.mainStore;
            prior.salesFloor += line.salesFloor;
          } else {
            existing.lines.push({ ...line });
          }
        }
        continue;
      }
      const po = purchaseOrders.find((item) => item.id === poId);
      purchasesByPo.set(poId, {
        id: poId,
        number: po?.purchaseDocumentNumber || String(row.receipt_number ?? ""),
        purchaseOrderId: poId,
        purchaseOrderNumber: poNumberById.get(poId) ?? "",
        supplierId: String(row.supplier_id),
        supplierName: supplierNamesById.get(String(row.supplier_id)) ?? "Supplier",
        receivedAt: receipt.receivedAt,
        paymentStatus: paymentByPo.get(poId) ?? mapPaymentStatus(String(row.payment_status)),
        totalCost: receipt.totalCost,
        itemCount: receipt.itemCount,
        status: po?.status === "Received" ? "Received" : "Partially Received",
        lines: receiptLines.map((line) => ({ ...line })),
        notes: String(row.notes ?? ""),
        receivedBy: "",
        receipts: [receipt],
      });
    }
    const purchases = [...purchasesByPo.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

    const paymentRequests = requestRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return mapPaymentRequest(
        row,
        supplierNamesById.get(String(row.supplier_id)) ?? "Supplier",
        invoiceNumberById.get(String(row.invoice_id)) ?? "",
      );
    });

    return { purchaseOrders, purchases, supplierInvoices, paymentRequests, error: null };
  } catch (error) {
    return {
      purchaseOrders: [],
      purchases: [],
      supplierInvoices: [],
      paymentRequests: [],
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
    supplierInvoices: purchasing.supplierInvoices,
    paymentRequests: purchasing.paymentRequests,
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

export async function loadProductByBarcode(barcode: string): Promise<{
  product: SupermarketProduct | null;
  error: string | null;
}> {
  const code = barcode.replace(/[\r\n\t]/g, "").trim();
  if (!code) return { product: null, error: null };
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_products")
      .select(PRODUCT_COLUMNS)
      .eq("business_unit_id", businessUnitId)
      .eq("barcode", code)
      .maybeSingle();
    if (error) mapDbError(error);
    if (!data) return { product: null, error: null };
    const categoryId = data.category_id ? String(data.category_id) : null;
    const names = new Map<string, string>();
    if (categoryId) {
      const { data: category } = await supabase
        .from("sm_categories")
        .select("id, name")
        .eq("id", categoryId)
        .maybeSingle();
      if (category?.id && category.name) names.set(String(category.id), String(category.name));
    }
    return { product: mapProduct(data as Record<string, unknown>, names), error: null };
  } catch (error) {
    return { product: null, error: queryErrorMessage(error) };
  }
}

const PO_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadPurchaseOrderByIdResult =
  | { status: "found"; order: PurchaseOrder }
  | { status: "not_found" }
  | { status: "error"; error: string };

/** One purchase order by database id — never loads the purchasing workspace. */
export async function loadPurchaseOrderById(poId: string): Promise<LoadPurchaseOrderByIdResult> {
  const id = poId.trim();
  if (!PO_ID_PATTERN.test(id)) return { status: "not_found" };

  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const poPrimary = await supabase
      .from("sm_purchase_orders")
      .select(PO_COLUMNS)
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    const poRes =
      poPrimary.error && /purchase_document_number/i.test(poPrimary.error.message)
        ? await supabase
            .from("sm_purchase_orders")
            .select(PO_COLUMNS_BASE)
            .eq("id", id)
            .eq("business_unit_id", businessUnitId)
            .maybeSingle()
        : poPrimary;
    if (poRes.error) return { status: "error", error: failMessage(poRes.error) };
    if (!poRes.data) return { status: "not_found" };

    const row = poRes.data as Record<string, unknown>;
    const supplierId = String(row.supplier_id ?? "");
    const [itemsRes, supplierRes] = await Promise.all([
      supabase.from("sm_purchase_order_items").select(PO_ITEM_COLUMNS).eq("purchase_order_id", id),
      supplierId
        ? supabase.from("sm_suppliers").select("id, name").eq("id", supplierId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (itemsRes.error) return { status: "error", error: failMessage(itemsRes.error) };
    if (supplierRes.error) return { status: "error", error: failMessage(supplierRes.error) };

    const itemRows = (itemsRes.data ?? []) as Record<string, unknown>[];
    const productIds = [...new Set(itemRows.map((item) => String(item.product_id)).filter(Boolean))];
    const productsRes = productIds.length
      ? await supabase.from("sm_products").select("id, name, sku").in("id", productIds)
      : { data: [] as Array<{ id: string; name: string; sku: string }>, error: null };
    if (productsRes.error) return { status: "error", error: failMessage(productsRes.error) };

    const names = new Map((productsRes.data ?? []).map((p) => [String(p.id), String(p.name)]));
    const skus = new Map((productsRes.data ?? []).map((p) => [String(p.id), String(p.sku)]));
    const lines: PurchaseOrder["lines"] = itemRows.map((item) => {
      const productId = String(item.product_id);
      return {
        id: String(item.id),
        productId,
        productName: names.get(productId) ?? "Product",
        sku: skus.get(productId) ?? "",
        quantityOrdered: Number(item.quantity_ordered) || 0,
        quantityReceived: Number(item.quantity_received) || 0,
        buyingPrice: Number(item.unit_cost) || 0,
      };
    });

    return {
      status: "found",
      order: mapPurchaseOrder(row, lines, String(supplierRes.data?.name ?? "Supplier")),
    };
  } catch (error) {
    return { status: "error", error: queryErrorMessage(error) };
  }
}

export type PurchaseOrderWorkspace = {
  order: PurchaseOrder;
  purchase: Purchase | null;
  invoices: SupplierInvoice[];
  paymentRequests: SupplierPaymentRequest[];
};

export type LoadPurchaseOrderWorkspaceResult =
  | { status: "found"; workspace: PurchaseOrderWorkspace }
  | { status: "not_found" }
  | { status: "error"; error: string };

/** One PO plus its receipts, supplier invoices, and payment requests. */
export async function loadPurchaseOrderWorkspace(poId: string): Promise<LoadPurchaseOrderWorkspaceResult> {
  const loaded = await loadPurchaseOrderById(poId);
  if (loaded.status !== "found") return loaded;
  const order = loaded.order;

  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const [receiptsRes, invoiceRes] = await Promise.all([
      supabase
        .from("sm_goods_receipts")
        .select(RECEIPT_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .eq("purchase_order_id", order.id)
        .order("received_at", { ascending: true }),
      supabase
        .from("sm_supplier_invoices")
        .select(INVOICE_COLUMNS)
        .eq("business_unit_id", businessUnitId)
        .eq("purchase_order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);
    const invoiceMissing =
      Boolean(invoiceRes.error) && /sm_supplier_invoices|does not exist|PGRST/i.test(invoiceRes.error?.message ?? "");
    if (receiptsRes.error) return { status: "error", error: failMessage(receiptsRes.error) };
    if (invoiceRes.error && !invoiceMissing) return { status: "error", error: failMessage(invoiceRes.error) };

    const receiptRows = (receiptsRes.data ?? []) as Record<string, unknown>[];
    const invoiceRows = invoiceMissing ? [] : ((invoiceRes.data ?? []) as Record<string, unknown>[]);
    const receiptIds = receiptRows.map((row) => String(row.id));
    const invoiceIds = invoiceRows.map((row) => String(row.id));

    const [receiptItemsRes, invoiceItemsRes, requestRes] = await Promise.all([
      receiptIds.length
        ? supabase.from("sm_goods_receipt_items").select(RECEIPT_ITEM_COLUMNS).in("goods_receipt_id", receiptIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      invoiceIds.length
        ? supabase.from("sm_supplier_invoice_items").select(INVOICE_ITEM_COLUMNS).in("invoice_id", invoiceIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      invoiceIds.length
        ? supabase
            .from("sm_supplier_payment_requests")
            .select(PAYMENT_REQUEST_COLUMNS)
            .eq("business_unit_id", businessUnitId)
            .in("invoice_id", invoiceIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ]);
    const requestMissing =
      Boolean(requestRes.error) &&
      /sm_supplier_payment_requests|does not exist|PGRST/i.test(requestRes.error?.message ?? "");
    if (receiptItemsRes.error) return { status: "error", error: failMessage(receiptItemsRes.error) };
    if (invoiceItemsRes.error) return { status: "error", error: failMessage(invoiceItemsRes.error) };
    if (requestRes.error && !requestMissing) return { status: "error", error: failMessage(requestRes.error) };

    const receiptItemsByReceipt = new Map<string, Purchase["lines"]>();
    for (const raw of receiptItemsRes.data ?? []) {
      const row = raw as Record<string, unknown>;
      const receiptId = String(row.goods_receipt_id);
      const list = receiptItemsByReceipt.get(receiptId) ?? [];
      const productId = String(row.product_id);
      const poLine = order.lines.find((item) => item.productId === productId);
      list.push({
        id: String(row.id),
        productId,
        productName: poLine?.productName ?? "Product",
        sku: poLine?.sku ?? "",
        quantity: Number(row.quantity) || 0,
        buyingPrice: Number(row.unit_cost) || 0,
        mainStore: Number(row.main_store_qty) || 0,
        salesFloor: Number(row.sales_floor_qty) || 0,
      });
      receiptItemsByReceipt.set(receiptId, list);
    }

    const receipts = receiptRows.map((row) => {
      const receiptId = String(row.id);
      const lines = receiptItemsByReceipt.get(receiptId) ?? [];
      return {
        id: receiptId,
        number: String(row.receipt_number ?? ""),
        receivedAt: String(row.received_at ?? ""),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        totalCost: Number(row.total_cost) || 0,
        lines,
      };
    });

    let purchase: Purchase | null = null;
    if (receipts.length) {
      const lines: Purchase["lines"] = [];
      for (const receipt of receipts) {
        for (const line of receipt.lines) {
          const prior = lines.find((item) => item.productId === line.productId);
          if (prior) {
            prior.quantity += line.quantity;
            prior.mainStore += line.mainStore;
            prior.salesFloor += line.salesFloor;
          } else {
            lines.push({ ...line });
          }
        }
      }
      const verifiedInvoice = invoiceRows.find(
        (row) => String(row.verification_status).toUpperCase() === "VERIFIED",
      );
      purchase = {
        id: order.id,
        number: order.purchaseDocumentNumber || receipts[0]?.number || order.number,
        purchaseOrderId: order.id,
        purchaseOrderNumber: order.number,
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        receivedAt: receipts[receipts.length - 1]?.receivedAt ?? "",
        paymentStatus: verifiedInvoice
          ? mapPaymentStatus(String(verifiedInvoice.payment_status))
          : "Unpaid",
        totalCost: receipts.reduce((sum, item) => sum + item.totalCost, 0),
        itemCount: receipts.reduce((sum, item) => sum + item.itemCount, 0),
        status: order.status === "Received" ? "Received" : "Partially Received",
        lines,
        notes: "",
        receivedBy: "",
        receipts: receipts.map((item) => ({
          id: item.id,
          number: item.number,
          receivedAt: item.receivedAt,
          itemCount: item.itemCount,
          totalCost: item.totalCost,
        })),
      };
    }

    const invoiceItemsById = new Map<string, SupplierInvoice["lines"]>();
    for (const raw of invoiceItemsRes.data ?? []) {
      const row = raw as Record<string, unknown>;
      const invoiceId = String(row.invoice_id);
      const list = invoiceItemsById.get(invoiceId) ?? [];
      const productId = String(row.product_id);
      const poLine = order.lines.find((item) => item.productId === productId);
      list.push({
        id: String(row.id),
        productId,
        productName: poLine?.productName ?? "Product",
        sku: poLine?.sku ?? "",
        quantity: Number(row.quantity) || 0,
        unitCost: Number(row.unit_cost) || 0,
        tax: Number(row.tax) || 0,
        lineTotal: Number(row.line_total) || 0,
      });
      invoiceItemsById.set(invoiceId, list);
    }

    const receiptNumberById = new Map(receipts.map((item) => [item.id, item.number]));
    const invoices = invoiceRows.map((row) =>
      mapSupplierInvoice(
        row,
        invoiceItemsById.get(String(row.id)) ?? [],
        order.supplierName,
        order.number,
        row.goods_receipt_id ? receiptNumberById.get(String(row.goods_receipt_id)) ?? "" : "",
      ),
    );
    const invoiceNumberById = new Map(invoices.map((item) => [item.id, item.number]));
    const paymentRequests = ((requestMissing ? [] : requestRes.data) ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return mapPaymentRequest(
        row,
        order.supplierName,
        invoiceNumberById.get(String(row.invoice_id)) ?? "",
      );
    });

    return { status: "found", workspace: { order, purchase, invoices, paymentRequests } };
  } catch (error) {
    return { status: "error", error: queryErrorMessage(error) };
  }
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
