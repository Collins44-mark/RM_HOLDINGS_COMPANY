export type SupermarketSaleStatus = "Completed" | "Pending" | "Refunded";
export type SupermarketPurchaseStatus = "Received" | "Pending";
export type SupermarketPayment = "Cash" | "Mobile Money" | "Card";

export type SupermarketStockAlert = {
  id: string;
  label: string;
  count: number;
  hint: string;
  href: string;
  tone: "watch" | "critical" | "soon";
};

export type SupermarketSaleRow = {
  invoice: string;
  time: string;
  items: number;
  cashier: string;
  payment: SupermarketPayment;
  amount: number;
  status: SupermarketSaleStatus;
};

export type SupermarketProductRow = {
  name: string;
  sold: number;
};

export type SupermarketPurchaseRow = {
  supplier: string;
  reference: string;
  date: string;
  amount: number;
  status: SupermarketPurchaseStatus;
};

export type SupermarketSampleDashboard = {
  kpis: {
    todaySales: number;
    todaySalesDelta: number;
    todayOrders: number;
    todayOrdersDelta: number;
    grossProfit: number;
    grossProfitDelta: number;
    inventoryValue: number;
  };
  salesOverview: {
    today: number;
    week: number;
    month: number;
    trend: { label: string; amount: number }[];
  };
  stockAlerts: SupermarketStockAlert[];
  recentSales: SupermarketSaleRow[];
  topProducts: SupermarketProductRow[];
  recentPurchases: SupermarketPurchaseRow[];
};

export const SUPERMARKET_SAMPLE: SupermarketSampleDashboard = {
  kpis: {
    todaySales: 4_850_000,
    todaySalesDelta: 12.5,
    todayOrders: 126,
    todayOrdersDelta: 8.3,
    grossProfit: 1_420_000,
    grossProfitDelta: 9.7,
    inventoryValue: 38_750_000,
  },
  salesOverview: {
    today: 4_850_000,
    week: 28_640_000,
    month: 112_450_000,
    trend: [
      { label: "Mon", amount: 3_240_000 },
      { label: "Tue", amount: 3_810_000 },
      { label: "Wed", amount: 4_120_000 },
      { label: "Thu", amount: 3_560_000 },
      { label: "Fri", amount: 4_980_000 },
      { label: "Sat", amount: 5_220_000 },
      { label: "Sun", amount: 4_850_000 },
    ],
  },
  stockAlerts: [
    {
      id: "low",
      label: "Low Stock",
      count: 12,
      hint: "Below reorder level",
      href: "/supermarket/stock",
      tone: "watch",
    },
    {
      id: "out",
      label: "Out of Stock",
      count: 4,
      hint: "Unavailable for sale",
      href: "/supermarket/stock",
      tone: "critical",
    },
    {
      id: "expiring",
      label: "Expiring Soon",
      count: 6,
      hint: "Within 14 days",
      href: "/supermarket/stock",
      tone: "soon",
    },
  ],
  recentSales: [
    {
      invoice: "INV-1048",
      time: "10:42 AM",
      items: 5,
      cashier: "John",
      payment: "Cash",
      amount: 85_000,
      status: "Completed",
    },
    {
      invoice: "INV-1047",
      time: "10:31 AM",
      items: 3,
      cashier: "Mary",
      payment: "Mobile Money",
      amount: 42_500,
      status: "Completed",
    },
    {
      invoice: "INV-1046",
      time: "10:18 AM",
      items: 8,
      cashier: "John",
      payment: "Card",
      amount: 156_000,
      status: "Completed",
    },
    {
      invoice: "INV-1045",
      time: "09:54 AM",
      items: 2,
      cashier: "Amina",
      payment: "Cash",
      amount: 18_700,
      status: "Completed",
    },
    {
      invoice: "INV-1044",
      time: "09:41 AM",
      items: 4,
      cashier: "Mary",
      payment: "Mobile Money",
      amount: 63_200,
      status: "Completed",
    },
  ],
  topProducts: [
    { name: "Rice 25kg", sold: 124 },
    { name: "Sugar 1kg", sold: 98 },
    { name: "Cooking Oil 5L", sold: 76 },
    { name: "Maize Flour 2kg", sold: 65 },
    { name: "Wheat Flour 2kg", sold: 51 },
  ],
  recentPurchases: [
    {
      supplier: "Coastal Traders",
      reference: "PO-2214",
      date: "12 Sep 2026",
      amount: 4_250_000,
      status: "Received",
    },
    {
      supplier: "Dar Wholesale",
      reference: "PO-2213",
      date: "11 Sep 2026",
      amount: 1_890_000,
      status: "Pending",
    },
    {
      supplier: "Kilimo Supplies",
      reference: "PO-2212",
      date: "10 Sep 2026",
      amount: 2_640_000,
      status: "Received",
    },
    {
      supplier: "Harbor Foods",
      reference: "PO-2211",
      date: "09 Sep 2026",
      amount: 975_000,
      status: "Pending",
    },
  ],
};
