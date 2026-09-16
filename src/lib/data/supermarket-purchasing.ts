export const STOCK_LOCATIONS = ["Main Store", "Sales Floor"] as const;
export type StockLocation = (typeof STOCK_LOCATIONS)[number];
export type StockDestination = StockLocation | "Split";

export const STOCK_MOVEMENT_CODES = [
  "PURCHASE_RECEIVED",
  "STOCK_TRANSFER",
  "STOCK_ADJUSTMENT",
  "OPENING_STOCK",
] as const;
export type StockMovementCode = (typeof STOCK_MOVEMENT_CODES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "Draft",
  "Sent",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_PAYMENT_STATUSES = ["Unpaid", "Partial", "Paid"] as const;
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number];

export const SUPPLIER_STATUSES = ["Active", "Inactive"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  status: SupplierStatus;
};

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
  notes: string;
  status: PurchaseOrderStatus;
  discount: number;
  tax: number;
  lines: PurchaseOrderLine[];
  createdAt: string;
};

export type PurchaseLine = {
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
  itemCount: number;
  totalCost: number;
  paymentStatus: PurchasePaymentStatus;
  status: "Received";
  lines: PurchaseLine[];
  receivedBy: string;
};

export type CreatePurchaseOrderInput = {
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  notes?: string;
  discount?: number;
  tax?: number;
  lines: {
    productId: string;
    quantity: number;
    buyingPrice: number;
  }[];
  status: Extract<PurchaseOrderStatus, "Draft" | "Sent">;
};

export type ReceivePurchaseLineInput = {
  productId: string;
  quantity: number;
  mainStore: number;
  salesFloor: number;
};

export type ReceivePurchaseOrderInput = {
  purchaseOrderId: string;
  lines: ReceivePurchaseLineInput[];
  user?: string;
  receivedAt?: string;
};

export type TransferStockInput = {
  productId: string;
  from: StockLocation;
  to: StockLocation;
  quantity: number;
  user?: string;
};

export type CreateSupplierInput = {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: SupplierStatus;
};

export type PurchaseOrderKpiFocus = "all" | "open" | "pending" | "partial" | "completed" | "value";

export function supplierNames(suppliers: Supplier[]) {
  return suppliers.map((item) => item.name);
}

export function purchaseOrderLineTotal(line: Pick<PurchaseOrderLine, "quantityOrdered" | "buyingPrice">) {
  return line.quantityOrdered * line.buyingPrice;
}

export function purchaseOrderSubtotal(order: Pick<PurchaseOrder, "lines">) {
  return order.lines.reduce((sum, line) => sum + purchaseOrderLineTotal(line), 0);
}

export function purchaseOrderGrandTotal(order: Pick<PurchaseOrder, "lines" | "discount" | "tax">) {
  return Math.max(0, purchaseOrderSubtotal(order) - (order.discount || 0) + (order.tax || 0));
}

export function purchaseOrderItemCount(order: Pick<PurchaseOrder, "lines">) {
  return order.lines.length;
}

export function purchaseLineRemaining(line: Pick<PurchaseOrderLine, "quantityOrdered" | "quantityReceived">) {
  return Math.max(0, line.quantityOrdered - line.quantityReceived);
}

export function derivePurchaseOrderStatus(lines: PurchaseOrderLine[], current: PurchaseOrderStatus): PurchaseOrderStatus {
  if (current === "Draft" || current === "Cancelled") return current;
  const ordered = lines.reduce((sum, line) => sum + line.quantityOrdered, 0);
  const received = lines.reduce((sum, line) => sum + line.quantityReceived, 0);
  if (received <= 0) return "Sent";
  if (received < ordered) return "Partially Received";
  return "Received";
}

export function receivablePurchaseOrders(orders: PurchaseOrder[]) {
  return orders.filter((order) => order.status === "Sent" || order.status === "Partially Received");
}

export function purchaseOrderMatchesFocus(order: PurchaseOrder, focus: PurchaseOrderKpiFocus) {
  if (focus === "all" || focus === "value") return order.status !== "Cancelled";
  if (focus === "open") return order.status === "Draft" || order.status === "Sent";
  if (focus === "pending") return order.status === "Sent";
  if (focus === "partial") return order.status === "Partially Received";
  return order.status === "Received";
}

export function purchaseOrderKpis(orders: PurchaseOrder[]) {
  return {
    open: orders.filter((order) => order.status === "Draft" || order.status === "Sent").length,
    pending: orders.filter((order) => order.status === "Sent").length,
    partial: orders.filter((order) => order.status === "Partially Received").length,
    completed: orders.filter((order) => order.status === "Received").length,
    totalValue: orders
      .filter((order) => order.status !== "Cancelled")
      .reduce((sum, order) => sum + purchaseOrderGrandTotal(order), 0),
  };
}

export function supplierOutstanding(supplierId: string, purchases: Purchase[]) {
  return purchases
    .filter((item) => item.supplierId === supplierId)
    .reduce((sum, item) => {
      if (item.paymentStatus === "Paid") return sum;
      if (item.paymentStatus === "Partial") return sum + Math.round(item.totalCost / 2);
      return sum + item.totalCost;
    }, 0);
}

export function supplierPurchaseTotal(supplierId: string, purchases: Purchase[]) {
  return purchases
    .filter((item) => item.supplierId === supplierId)
    .reduce((sum, item) => sum + item.totalCost, 0);
}

export function nextDocumentNumber(prefix: string, values: string[]) {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const value of values) {
    const match = value.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function destinationFromAllocation(mainStore: number, salesFloor: number): StockDestination {
  if (mainStore > 0 && salesFloor > 0) return "Split";
  if (salesFloor > 0) return "Sales Floor";
  return "Main Store";
}

export function seedSuppliers(): Supplier[] {
  return [
    {
      id: "sup-coastal",
      name: "Coastal Traders",
      contactPerson: "Asha Mushi",
      phone: "+255 754 221 008",
      email: "orders@coastaltraders.co.tz",
      address: "Nyerere Road, Dar es Salaam",
      status: "Active",
    },
    {
      id: "sup-dar",
      name: "Dar Wholesale",
      contactPerson: "Juma Ally",
      phone: "+255 713 440 912",
      email: "sales@darwholesale.co.tz",
      address: "Uhuru Street, Kariakoo",
      status: "Active",
    },
    {
      id: "sup-kilimo",
      name: "Kilimo Supplies",
      contactPerson: "Neema Mwakyusa",
      phone: "+255 765 118 334",
      email: "hello@kilimosupplies.co.tz",
      address: "Morogoro Road, Ubungo",
      status: "Active",
    },
    {
      id: "sup-harbor",
      name: "Harbor Foods",
      contactPerson: "Peter Kimaro",
      phone: "+255 678 902 441",
      email: "orders@harborfoods.co.tz",
      address: "Bandari Road, Kurasini",
      status: "Active",
    },
    {
      id: "sup-kibo",
      name: "Kibo Oils",
      contactPerson: "Grace Lyimo",
      phone: "+255 755 019 220",
      email: "trade@kibooils.co.tz",
      address: "Nelson Mandela Road, Dar es Salaam",
      status: "Active",
    },
    {
      id: "sup-xyz",
      name: "XYZ Distributors",
      contactPerson: "Samuel Joseph",
      phone: "+255 622 445 870",
      email: "accounts@xyzdistributors.co.tz",
      address: "Msimbazi Street, Ilala",
      status: "Active",
    },
  ];
}

export function seedPurchaseOrders(): PurchaseOrder[] {
  return [
    {
      id: "po-0025",
      number: "PO-0025",
      supplierId: "sup-coastal",
      supplierName: "Coastal Traders",
      orderDate: "2026-09-16",
      expectedDate: "2026-09-20",
      notes: "Priority restock for weekend trade.",
      status: "Sent",
      discount: 0,
      tax: 0,
      createdAt: "2026-09-16T08:10:00.000Z",
      lines: [
        {
          id: "pol-0025-1",
          productId: "prd-rice-25",
          productName: "Rice 25kg",
          sku: "RICE-25",
          quantityOrdered: 50,
          quantityReceived: 0,
          buyingPrice: 42_000,
        },
        {
          id: "pol-0025-2",
          productId: "prd-oil-5",
          productName: "Cooking Oil 5L",
          sku: "OIL-5",
          quantityOrdered: 20,
          quantityReceived: 0,
          buyingPrice: 20_000,
        },
      ],
    },
    {
      id: "po-0024",
      number: "PO-0024",
      supplierId: "sup-dar",
      supplierName: "Dar Wholesale",
      orderDate: "2026-09-12",
      expectedDate: "2026-09-16",
      notes: "",
      status: "Partially Received",
      discount: 0,
      tax: 0,
      createdAt: "2026-09-12T09:20:00.000Z",
      lines: [
        {
          id: "pol-0024-1",
          productId: "prd-sugar-1",
          productName: "Sugar 1kg",
          sku: "SUGAR-1",
          quantityOrdered: 80,
          quantityReceived: 40,
          buyingPrice: 2_900,
        },
        {
          id: "pol-0024-2",
          productId: "prd-soda-500",
          productName: "Soda 500ml",
          sku: "SODA-500",
          quantityOrdered: 60,
          quantityReceived: 0,
          buyingPrice: 1_200,
        },
      ],
    },
    {
      id: "po-0023",
      number: "PO-0023",
      supplierId: "sup-kilimo",
      supplierName: "Kilimo Supplies",
      orderDate: "2026-09-08",
      expectedDate: "2026-09-11",
      notes: "",
      status: "Received",
      discount: 0,
      tax: 0,
      createdAt: "2026-09-08T11:00:00.000Z",
      lines: [
        {
          id: "pol-0023-1",
          productId: "prd-unga-2",
          productName: "Maize Flour 2kg",
          sku: "UNGA-2",
          quantityOrdered: 40,
          quantityReceived: 40,
          buyingPrice: 3_400,
        },
      ],
    },
    {
      id: "po-0022",
      number: "PO-0022",
      supplierId: "sup-harbor",
      supplierName: "Harbor Foods",
      orderDate: "2026-09-16",
      expectedDate: "2026-09-22",
      notes: "Hold until cooler space is confirmed.",
      status: "Draft",
      discount: 0,
      tax: 0,
      createdAt: "2026-09-16T07:40:00.000Z",
      lines: [
        {
          id: "pol-0022-1",
          productId: "prd-milk-500",
          productName: "Milk 500ml",
          sku: "MILK-500",
          quantityOrdered: 48,
          quantityReceived: 0,
          buyingPrice: 1_600,
        },
      ],
    },
    {
      id: "po-0021",
      number: "PO-0021",
      supplierId: "sup-coastal",
      supplierName: "Coastal Traders",
      orderDate: "2026-09-04",
      expectedDate: "2026-09-09",
      notes: "Cancelled after duplicate order.",
      status: "Cancelled",
      discount: 0,
      tax: 0,
      createdAt: "2026-09-04T14:15:00.000Z",
      lines: [
        {
          id: "pol-0021-1",
          productId: "prd-wash-1",
          productName: "Washing Powder 1kg",
          sku: "WASH-1",
          quantityOrdered: 24,
          quantityReceived: 0,
          buyingPrice: 4_800,
        },
      ],
    },
  ];
}

export function seedPurchases(): Purchase[] {
  return [
    {
      id: "pur-0024",
      number: "PUR-0024",
      purchaseOrderId: "po-0024",
      purchaseOrderNumber: "PO-0024",
      supplierId: "sup-dar",
      supplierName: "Dar Wholesale",
      receivedAt: "2026-09-14T10:15:00.000Z",
      itemCount: 1,
      totalCost: 116_000,
      paymentStatus: "Unpaid",
      status: "Received",
      receivedBy: "Collins Sarungi",
      lines: [
        {
          productId: "prd-sugar-1",
          productName: "Sugar 1kg",
          sku: "SUGAR-1",
          quantity: 40,
          buyingPrice: 2_900,
          mainStore: 25,
          salesFloor: 15,
        },
      ],
    },
    {
      id: "pur-0023",
      number: "PUR-0023",
      purchaseOrderId: "po-0023",
      purchaseOrderNumber: "PO-0023",
      supplierId: "sup-kilimo",
      supplierName: "Kilimo Supplies",
      receivedAt: "2026-09-11T13:40:00.000Z",
      itemCount: 1,
      totalCost: 136_000,
      paymentStatus: "Paid",
      status: "Received",
      receivedBy: "John",
      lines: [
        {
          productId: "prd-unga-2",
          productName: "Maize Flour 2kg",
          sku: "UNGA-2",
          quantity: 40,
          buyingPrice: 3_400,
          mainStore: 28,
          salesFloor: 12,
        },
      ],
    },
  ];
}
