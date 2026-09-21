/** Shared supermarket domain types aligned to DB + existing UI contracts. */

export type StockLocation = "Main Store" | "Sales Floor";
export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";
export type ExpiryStatus = "Expired" | "Expiring Soon" | "Normal" | "No Expiry";

export type SupermarketCategory = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
};

export type SupermarketProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  categoryId?: string | null;
  unit: string;
  buyingPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  trackExpiry: boolean;
  isActive: boolean;
  createdAt: string;
  supplierId?: string | null;
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
  type: "Opening Stock" | "Received" | "Sale" | "Adjustment" | "Return" | "Transfer";
  quantity: number;
  date: string;
  reference: string;
  note: string;
  reason?: string;
  user?: string;
  movementCode?: string;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  sourceDocumentId?: string;
  sourceDocumentType?: string;
};

export type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  status: "Active" | "Inactive";
  notes?: string;
  createdAt?: string;
};

export type PurchaseOrderStatus =
  | "Draft"
  | "Sent"
  | "Partially Received"
  | "Received"
  | "Cancelled";

export type PurchaseOrderLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  buyingPrice: number;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  discount: number;
  tax: number;
  notes: string;
  lines: PurchaseOrderLine[];
  createdAt: string;
};

export type PurchasePaymentStatus = "Unpaid" | "Partial" | "Paid";

export type PurchaseLine = {
  id?: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  buyingPrice: number;
  mainStore: number;
  salesFloor: number;
};

export type Purchase = {
  id: string;
  number: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  receivedAt: string;
  paymentStatus: PurchasePaymentStatus;
  totalCost: number;
  itemCount: number;
  status: "Received";
  lines: PurchaseLine[];
  notes?: string;
  receivedBy: string;
};

export type InventorySnapshot = {
  products: SupermarketProduct[];
  batches: StockBatch[];
  movements: StockMovement[];
  categories: SupermarketCategory[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchases: Purchase[];
  loadedAt: string | null;
  error: string | null;
};

export type SalePaymentMethod = "Cash" | "Mobile Money" | "Card" | "Bank";

export type SupermarketSale = {
  id: string;
  invoiceNumber: string;
  date: string;
  cashier: string;
  cashierId: string | null;
  customer: string;
  payment: SalePaymentMethod | "Mixed";
  status: "Completed" | "Refunded" | "Partial Refund" | "Void";
  items: {
    id: string;
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cogs: number;
};

export type PromotionStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";
export type PromotionTargetType = "PRODUCTS" | "CATEGORIES" | "ALL_PRODUCTS";

export type Promotion = {
  id: string;
  name: string;
  description: string;
  type: string;
  typeId: string;
  targetType: PromotionTargetType;
  productIds: string[];
  categoryIds: string[];
  startDate: string;
  endDate: string;
  isPaused: boolean;
  allowMultipleUse: boolean;
  usageLimitEnabled: boolean;
  usageLimit: number | null;
  buyQuantity: number | null;
  freeQuantity: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  requiredQuantity: number | null;
  fixedPrice: number | null;
  bundlePrice: number | null;
  minimumSpend: number | null;
  tiers: { id: string; minimumSpend: number; discountPercent: number; sortOrder: number }[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseRecord = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentStatus: "PAID" | "UNPAID" | "PARTIAL";
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  direction: "IN" | "OUT";
  kind: string;
  method: string;
  amount: number;
  paymentDate: string;
  reference: string;
  notes: string;
  createdAt: string;
};

export const EMPTY_INVENTORY_SNAPSHOT: InventorySnapshot = {
  products: [],
  batches: [],
  movements: [],
  categories: [],
  suppliers: [],
  purchaseOrders: [],
  purchases: [],
  loadedAt: null,
  error: null,
};
