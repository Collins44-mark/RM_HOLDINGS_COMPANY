import type {
  InventorySnapshot,
  Purchase,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchasePaymentStatus,
  StockBatch,
  StockLocation,
  StockMovement,
  SupermarketCategory,
  SupermarketProduct,
  Supplier,
  Promotion,
  SupermarketSale,
  ExpenseRecord,
  PaymentRecord,
} from "@/lib/supermarket/types";

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mapCategory(row: Record<string, unknown>): SupermarketCategory {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    isActive: Boolean(row.is_active ?? true),
  };
}

export function mapProduct(
  row: Record<string, unknown>,
  categoryNameById: Map<string, string>,
): SupermarketProduct {
  const categoryId = row.category_id ? String(row.category_id) : null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sku: String(row.sku ?? ""),
    barcode: String(row.barcode ?? ""),
    category: categoryId ? categoryNameById.get(categoryId) ?? "" : "",
    categoryId,
    unit: String(row.unit ?? "Piece"),
    buyingPrice: num(row.buying_price),
    sellingPrice: num(row.selling_price),
    reorderLevel: Math.trunc(num(row.reorder_level)),
    trackExpiry: Boolean(row.track_expiry),
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
  };
}

export function mapBatch(
  row: Record<string, unknown>,
  supplierNameById: Map<string, string>,
): StockBatch {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    batchNumber: String(row.batch_number ?? ""),
    quantity: Math.trunc(num(row.quantity)),
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    buyingPrice: num(row.buying_price),
    supplier: row.supplier_id ? supplierNameById.get(String(row.supplier_id)) ?? "" : "",
    receivedAt: String(row.received_at ?? row.created_at ?? ""),
    location: (row.location as StockLocation) || "Main Store",
  };
}

function movementTypeFromCode(code: string): StockMovement["type"] {
  switch (code) {
    case "OPENING_BALANCE":
      return "Opening Stock";
    case "PURCHASE":
      return "Received";
    case "SALE":
      return "Sale";
    case "SALE_RETURN":
      return "Return";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return "Transfer";
    default:
      return "Adjustment";
  }
}

export function mapMovement(row: Record<string, unknown>): StockMovement {
  const code = String(row.movement_code ?? "");
  return {
    id: String(row.id),
    productId: String(row.product_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    type: movementTypeFromCode(code),
    quantity: Math.trunc(num(row.quantity)),
    date: String(row.created_at ?? "").slice(0, 10),
    reference: String(row.reference ?? ""),
    note: String(row.note ?? ""),
    reason: String(row.reason ?? ""),
    movementCode: code,
    fromLocation: row.from_location as StockLocation | undefined,
    toLocation: row.to_location as StockLocation | undefined,
    sourceDocumentId: row.source_document_id ? String(row.source_document_id) : undefined,
    sourceDocumentType: row.source_document_type ? String(row.source_document_type) : undefined,
  };
}

export function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    contactPerson: String(row.contact_person ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    address: String(row.address ?? ""),
    status: String(row.status).toUpperCase() === "INACTIVE" ? "Inactive" : "Active",
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapPoStatus(status: string): PurchaseOrderStatus {
  switch (String(status).toUpperCase()) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "PARTIALLY_RECEIVED":
      return "Partially Received";
    case "RECEIVED":
      return "Received";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Draft";
  }
}

export function toDbPoStatus(status: PurchaseOrderStatus): string {
  switch (status) {
    case "Draft":
      return "DRAFT";
    case "Sent":
      return "SENT";
    case "Partially Received":
      return "PARTIALLY_RECEIVED";
    case "Received":
      return "RECEIVED";
    case "Cancelled":
      return "CANCELLED";
  }
}

export function mapPaymentStatus(status: string): PurchasePaymentStatus {
  switch (String(status).toUpperCase()) {
    case "PAID":
      return "Paid";
    case "PARTIAL":
      return "Partial";
    default:
      return "Unpaid";
  }
}

export function mapPurchaseOrder(
  row: Record<string, unknown>,
  lines: PurchaseOrder["lines"],
  supplierName: string,
): PurchaseOrder {
  return {
    id: String(row.id),
    number: String(row.po_number ?? ""),
    supplierId: String(row.supplier_id),
    supplierName,
    orderDate: String(row.order_date ?? ""),
    expectedDate: row.expected_date ? String(row.expected_date) : "",
    status: mapPoStatus(String(row.status)),
    discount: num(row.discount),
    tax: num(row.tax),
    notes: String(row.notes ?? ""),
    lines,
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapPurchase(
  row: Record<string, unknown>,
  lines: Purchase["lines"],
  supplierName: string,
  poNumber: string | null,
): Purchase {
  return {
    id: String(row.id),
    number: String(row.receipt_number ?? ""),
    purchaseOrderId: row.purchase_order_id ? String(row.purchase_order_id) : "",
    purchaseOrderNumber: poNumber ?? "",
    supplierId: String(row.supplier_id),
    supplierName,
    receivedAt: String(row.received_at ?? ""),
    paymentStatus: mapPaymentStatus(String(row.payment_status)),
    totalCost: num(row.total_cost),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    status: "Received",
    lines,
    notes: String(row.notes ?? ""),
    receivedBy: "",
  };
}

export function mapPromotion(
  row: Record<string, unknown>,
  typeCode: string,
  productIds: string[],
  categoryIds: string[],
  tiers: Promotion["tiers"],
): Promotion {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    type: typeCode,
    typeId: String(row.type_id),
    targetType: String(row.target_type) as Promotion["targetType"],
    productIds,
    categoryIds,
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    isPaused: Boolean(row.is_paused),
    allowMultipleUse: Boolean(row.allow_multiple_use ?? true),
    usageLimitEnabled: Boolean(row.usage_limit_enabled),
    usageLimit: row.usage_limit == null ? null : Math.trunc(num(row.usage_limit)),
    buyQuantity: row.buy_quantity == null ? null : Math.trunc(num(row.buy_quantity)),
    freeQuantity: row.free_quantity == null ? null : Math.trunc(num(row.free_quantity)),
    discountPercent: row.discount_percent == null ? null : num(row.discount_percent),
    discountAmount: row.discount_amount == null ? null : num(row.discount_amount),
    requiredQuantity: row.required_quantity == null ? null : Math.trunc(num(row.required_quantity)),
    fixedPrice: row.fixed_price == null ? null : num(row.fixed_price),
    bundlePrice: row.bundle_price == null ? null : num(row.bundle_price),
    minimumSpend: row.minimum_spend == null ? null : num(row.minimum_spend),
    tiers,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapSale(
  row: Record<string, unknown>,
  items: SupermarketSale["items"],
  cashierName: string,
  paymentLabel: SupermarketSale["payment"],
): SupermarketSale {
  const statusRaw = String(row.status ?? "COMPLETED").toUpperCase();
  const status: SupermarketSale["status"] =
    statusRaw === "REFUNDED"
      ? "Refunded"
      : statusRaw === "PARTIAL_REFUND"
        ? "Partial Refund"
        : statusRaw === "VOID"
          ? "Void"
          : "Completed";

  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number ?? ""),
    date: String(row.sale_date ?? row.created_at ?? ""),
    cashier: cashierName,
    cashierId: row.cashier_id ? String(row.cashier_id) : null,
    customer: String(row.customer_name ?? "Walk-in Customer"),
    payment: paymentLabel,
    status,
    items,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    total: num(row.total),
    cogs: num(row.cogs),
  };
}

export function mapExpense(row: Record<string, unknown>): ExpenseRecord {
  return {
    id: String(row.id),
    category: String(row.category ?? ""),
    description: String(row.description ?? ""),
    amount: num(row.amount),
    expenseDate: String(row.expense_date ?? ""),
    paymentStatus: String(row.payment_status ?? "PAID").toUpperCase() as ExpenseRecord["paymentStatus"],
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    direction: String(row.direction).toUpperCase() === "OUT" ? "OUT" : "IN",
    kind: String(row.kind ?? ""),
    method: String(row.method ?? ""),
    amount: num(row.amount),
    paymentDate: String(row.payment_date ?? ""),
    reference: String(row.reference ?? ""),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function emptySnapshot(error: string | null = null): InventorySnapshot {
  return {
    products: [],
    batches: [],
    movements: [],
    categories: [],
    suppliers: [],
    purchaseOrders: [],
    purchases: [],
    loadedAt: null,
    error,
  };
}
