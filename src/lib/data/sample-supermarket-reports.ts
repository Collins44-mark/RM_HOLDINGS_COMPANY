import { seedPurchases, seedSuppliers } from "@/lib/data/supermarket-purchasing";
import { SUPERMARKET_RETURNS, filterReturns } from "@/lib/data/sample-supermarket-returns";
import { SUPERMARKET_SAMPLE_PRODUCTS } from "@/lib/data/supermarket-inventory";
import {
  FINANCE_SUPPLIER,
  getSupermarketFinanceSummary,
  recordedExpenseTotal,
  getFinanceActivitySnapshot,
  filterMockExpenses,
} from "@/lib/data/sample-supermarket-finance";
import {
  SUPERMARKET_SALES,
  filterSales,
  formatSalesDate,
  resolveSalesPeriod,
  saleTotal,
  type SalesDateRange,
  type SalesPeriodPreset,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";

export type ReportKind = "sales" | "inventory" | "purchases" | "profit-loss";

export const REPORT_AS_OF = "2026-09-16";

export const REPORT_KIND_META: Record<
  ReportKind,
  { title: string; description: string; href: string }
> = {
  sales: {
    title: "Sales Report",
    description: "Sales performance and transactions.",
    href: "/supermarket/reports/sales",
  },
  inventory: {
    title: "Inventory Report",
    description: "Stock levels and inventory value.",
    href: "/supermarket/reports/inventory",
  },
  purchases: {
    title: "Purchase Report",
    description: "Purchases and supplier payments.",
    href: "/supermarket/reports/purchases",
  },
  "profit-loss": {
    title: "Profit & Loss",
    description: "Revenue, expenses and net profit.",
    href: "/supermarket/reports/profit-loss",
  },
};

export function parseReportPeriodParams(params: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}): { preset: SalesPeriodPreset; range: SalesDateRange } {
  const period = params.period ?? "week";
  const range: SalesDateRange = {
    from: params.from || "2026-09-01",
    to: params.to || REPORT_AS_OF,
  };
  if (period === "today" || period === "yesterday" || period === "week" || period === "month") {
    return { preset: period, range };
  }
  if (period === "range") {
    return { preset: "range", range };
  }
  return { preset: "week", range };
}

export function reportPeriodQuery(preset: SalesPeriodPreset, range: SalesDateRange) {
  if (preset === "range") {
    return `period=range&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  }
  return `period=${preset}`;
}

export function resolveReportPeriod(preset: SalesPeriodPreset, range: SalesDateRange) {
  return resolveSalesPeriod(preset, range, REPORT_AS_OF);
}

function periodMeta(preset: SalesPeriodPreset, range: SalesDateRange) {
  const period = resolveReportPeriod(preset, range);
  return {
    period,
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
  };
}

const PAYMENT_ORDER = ["Cash", "Mobile Money", "Card", "Bank"] as const;

export type SalesReportFilters = {
  cashier?: string;
  payment?: string;
  category?: string;
};

export type SalesReportData = {
  periodLabel: string;
  periodDates: string;
  comparisonLabel: string;
  totalRevenue: number;
  totalSales: number;
  itemsSold: number;
  discounts: number;
  returnsAmount: number;
  returnsCount: number;
  deltas: {
    revenue: number;
    sales: number;
    itemsSold: number;
    returns: number;
  };
  paymentBreakdown: { method: string; amount: number; count: number; percentage: number }[];
  cashierPerformance: { cashier: string; sales: number; itemsSold: number; revenue: number }[];
  dailySales: { day: string; amount: number; transactions: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  lowProducts: { name: string; quantity: number; revenue: number }[];
  /** Kept for PDF / legacy callers */
  totalTransactions: number;
  sales: SupermarketSale[];
};

function productCategoryMap() {
  const map = new Map<string, string>();
  for (const product of SUPERMARKET_SAMPLE_PRODUCTS) {
    map.set(product.name, product.category);
  }
  return map;
}

function daySpan(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function shiftIsoDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function comparisonLabelFor(preset: SalesPeriodPreset) {
  if (preset === "today") return "vs yesterday";
  if (preset === "yesterday") return "vs prior day";
  if (preset === "week") return "vs last week";
  if (preset === "month") return "vs last month";
  return "vs prior period";
}

function pctDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function collectSalesMetrics(
  sales: SupermarketSale[],
  category: string,
  categoryLookup: Map<string, string>,
) {
  const paymentMap = new Map<string, { amount: number; count: number }>();
  for (const method of PAYMENT_ORDER) paymentMap.set(method, { amount: 0, count: 0 });
  const cashierMap = new Map<string, { sales: number; itemsSold: number; revenue: number }>();
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  const dailyMap = new Map<string, { amount: number; transactions: number }>();
  let discounts = 0;
  let itemsSold = 0;
  let totalRevenue = 0;
  const matchedSales: SupermarketSale[] = [];

  for (const sale of sales) {
    const lines =
      category === "all"
        ? sale.lines
        : sale.lines.filter((line) => categoryLookup.get(line.name) === category);
    if (category !== "all" && lines.length === 0) continue;

    matchedSales.push(sale);
    const amount =
      category === "all"
        ? saleTotal(sale)
        : lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const saleItems = lines.reduce((sum, line) => sum + line.quantity, 0);
    discounts += category === "all" ? sale.discount : 0;
    itemsSold += saleItems;
    totalRevenue += amount;

    const pay = paymentMap.get(sale.payment) ?? { amount: 0, count: 0 };
    pay.amount += amount;
    pay.count += 1;
    paymentMap.set(sale.payment, pay);

    const cashier = cashierMap.get(sale.cashier) ?? { sales: 0, itemsSold: 0, revenue: 0 };
    cashier.sales += 1;
    cashier.itemsSold += saleItems;
    cashier.revenue += amount;
    cashierMap.set(sale.cashier, cashier);

    const daily = dailyMap.get(sale.dateLabel) ?? { amount: 0, transactions: 0 };
    daily.amount += amount;
    daily.transactions += 1;
    dailyMap.set(sale.dateLabel, daily);

    for (const line of lines) {
      const product = productMap.get(line.name) ?? { quantity: 0, revenue: 0 };
      product.quantity += line.quantity;
      product.revenue += line.quantity * line.unitPrice;
      productMap.set(line.name, product);
    }
  }

  return {
    paymentMap,
    cashierMap,
    productMap,
    dailyMap,
    discounts,
    itemsSold,
    totalRevenue,
    matchedSales,
  };
}

export function buildSalesReportData(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: SalesReportFilters = {},
): SalesReportData {
  const { period, periodLabel, periodDates } = periodMeta(preset, range);
  const cashier = filters.cashier && filters.cashier !== "all" ? filters.cashier : "all";
  const paymentRaw = filters.payment && filters.payment !== "all" ? filters.payment : "all";
  const category = filters.category && filters.category !== "all" ? filters.category : "all";
  const categoryLookup = productCategoryMap();

  const paymentForSales =
    paymentRaw === "Cash" || paymentRaw === "Mobile Money" || paymentRaw === "Card" ? paymentRaw : "all";

  const periodSales =
    paymentRaw === "Bank"
      ? []
      : filterSales(SUPERMARKET_SALES, {
          start: period.start,
          end: period.end,
          cashier,
          payment: paymentForSales,
          status: "all",
          query: "",
        });

  const returns = filterReturns(SUPERMARKET_RETURNS, {
    start: period.start,
    end: period.end,
    cashier,
    method: paymentForSales === "all" ? "all" : paymentForSales,
    status: "all",
    query: "",
  });

  const current = collectSalesMetrics(periodSales, category, categoryLookup);

  const span = daySpan(period.start, period.end);
  const prevEnd = shiftIsoDay(period.start, -1);
  const prevStart = shiftIsoDay(period.start, -span);
  const previousSales =
    paymentRaw === "Bank"
      ? []
      : filterSales(SUPERMARKET_SALES, {
          start: prevStart,
          end: prevEnd,
          cashier,
          payment: paymentForSales,
          status: "all",
          query: "",
        });
  const previous = collectSalesMetrics(previousSales, category, categoryLookup);

  const previousReturns = filterReturns(SUPERMARKET_RETURNS, {
    start: prevStart,
    end: prevEnd,
    cashier,
    method: paymentForSales === "all" ? "all" : paymentForSales,
    status: "all",
    query: "",
  });
  const returnsAmount = returns.reduce((sum, row) => sum + row.amount, 0);
  const previousReturnsAmount = previousReturns.reduce((sum, row) => sum + row.amount, 0);

  const catalogNames = new Set([
    ...SUPERMARKET_SAMPLE_PRODUCTS.filter((item) => item.isActive !== false).map((item) => item.name),
    ...current.productMap.keys(),
  ]);
  if (category !== "all") {
    for (const name of [...catalogNames]) {
      if (categoryLookup.get(name) !== category) catalogNames.delete(name);
    }
  }
  for (const name of catalogNames) {
    if (!current.productMap.has(name)) current.productMap.set(name, { quantity: 0, revenue: 0 });
  }

  const rankedProducts = [...current.productMap.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

  return {
    periodLabel,
    periodDates,
    comparisonLabel: comparisonLabelFor(preset),
    totalRevenue: current.totalRevenue,
    totalSales: current.matchedSales.length,
    totalTransactions: current.matchedSales.length,
    itemsSold: current.itemsSold,
    discounts: current.discounts,
    returnsAmount,
    returnsCount: returns.length,
    deltas: {
      revenue: pctDelta(current.totalRevenue, previous.totalRevenue),
      sales: pctDelta(current.matchedSales.length, previous.matchedSales.length),
      itemsSold: pctDelta(current.itemsSold, previous.itemsSold),
      returns: pctDelta(returnsAmount, previousReturnsAmount),
    },
    paymentBreakdown: PAYMENT_ORDER.map((method) => {
      const value = current.paymentMap.get(method) ?? { amount: 0, count: 0 };
      return {
        method,
        amount: value.amount,
        count: value.count,
        percentage:
          current.totalRevenue > 0 ? Math.round((value.amount / current.totalRevenue) * 1000) / 10 : 0,
      };
    }),
    cashierPerformance: [...current.cashierMap.entries()]
      .map(([name, value]) => ({ cashier: name, ...value }))
      .sort((a, b) => b.revenue - a.revenue),
    dailySales: [...current.dailyMap.entries()].map(([day, value]) => ({ day, ...value })).slice(0, 14),
    topProducts: rankedProducts.filter((row) => row.quantity > 0).slice(0, 5),
    lowProducts: [...rankedProducts].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 5),
    sales: current.matchedSales,
  };
}

export type InventoryReportFilters = {
  category?: string;
  status?: string;
};

export type InventoryReportData = {
  periodLabel: string;
  periodDates: string;
  comparisonLabel: string;
  totalProducts: number;
  totalStockUnits: number;
  totalInventoryValue: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  expiredItems: number;
  expiredStockValue: number;
  deltas: {
    products: number;
    stockUnits: number;
    inventoryValue: number;
    lowStock: number;
  };
  movements: { label: string; count: number; quantity: number }[];
  lowStockProducts: {
    name: string;
    sku: string;
    stock: number;
    reorderLevel: number;
    value: number;
    status: string;
  }[];
  valuation: {
    name: string;
    quantity: number;
    buyingPrice: number;
    stockValue: number;
    status: string;
    category: string;
  }[];
  expiryRows: {
    name: string;
    quantity: number;
    expiryDate: string;
    status: "Expiring Soon" | "Expired";
    stockValue: number;
  }[];
};

function shiftReportDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Shared mock expiry lots — used by Inventory Report and P&L so loss is never double-counted. */
export function buildExpiryInventoryLots(asOf = REPORT_AS_OF) {
  const products = SUPERMARKET_SAMPLE_PRODUCTS.filter((item) => item.isActive !== false);
  const lots: {
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    buyingPrice: number;
    expiryDate: string;
    status: "Expiring Soon" | "Expired";
    stockValue: number;
  }[] = [];

  products.forEach((product, index) => {
    if (!product.trackExpiry && index % 3 !== 0) return;
    const totalStock =
      product.reorderLevel > 0
        ? Math.max(0, product.reorderLevel + ((index * 7) % 25) - 4)
        : Math.max(0, 8 + (index % 12));
    if (totalStock <= 0) return;

    const expiredQty = index % 5 === 0 ? Math.min(totalStock, 2 + (index % 4)) : index % 7 === 0 ? Math.min(totalStock, 1 + (index % 3)) : 0;
    const soonQty =
      expiredQty < totalStock && (index % 4 === 1 || index % 6 === 0)
        ? Math.min(totalStock - expiredQty, 2 + (index % 5))
        : 0;

    if (expiredQty > 0) {
      const expiryDate = shiftReportDay(asOf, -(5 + (index % 20)));
      lots.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: expiredQty,
        buyingPrice: product.buyingPrice,
        expiryDate,
        status: "Expired",
        stockValue: expiredQty * product.buyingPrice,
      });
    }
    if (soonQty > 0) {
      const expiryDate = shiftReportDay(asOf, 3 + (index % 25));
      lots.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: soonQty,
        buyingPrice: product.buyingPrice,
        expiryDate,
        status: "Expiring Soon",
        stockValue: soonQty * product.buyingPrice,
      });
    }
  });

  const expiredStockValue = lots
    .filter((lot) => lot.status === "Expired")
    .reduce((sum, lot) => sum + lot.stockValue, 0);

  return { lots, expiredStockValue };
}

function inventoryRows(asOf = REPORT_AS_OF) {
  const products = SUPERMARKET_SAMPLE_PRODUCTS.filter((item) => item.isActive !== false);
  const { lots } = buildExpiryInventoryLots(asOf);
  const expiredByProduct = new Map<string, number>();
  for (const lot of lots) {
    if (lot.status !== "Expired") continue;
    expiredByProduct.set(lot.productId, (expiredByProduct.get(lot.productId) ?? 0) + lot.quantity);
  }

  return products.map((product, index) => {
    const stock =
      product.reorderLevel > 0
        ? Math.max(0, product.reorderLevel + ((index * 7) % 25) - 4)
        : Math.max(0, 8 + (index % 12));
    const expiredQty = Math.min(stock, expiredByProduct.get(product.id) ?? 0);
    const sellableStock = Math.max(0, stock - expiredQty);
    const status =
      sellableStock === 0 && stock > 0
        ? "Out of Stock"
        : sellableStock === 0
          ? "Out of Stock"
          : sellableStock <= product.reorderLevel
            ? "Low Stock"
            : "In Stock";
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      stock: sellableStock,
      totalStock: stock,
      expiredQty,
      reorderLevel: product.reorderLevel,
      buyingPrice: product.buyingPrice,
      status,
      value: sellableStock * product.buyingPrice,
    };
  });
}

function inventoryComparisonLabel(preset: SalesPeriodPreset) {
  if (preset === "today") return "vs yesterday";
  if (preset === "yesterday") return "vs prior day";
  if (preset === "week") return "vs last week";
  if (preset === "month") return "vs last month";
  return "vs prior period";
}

function inventoryPctDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export function buildInventoryReportData(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: InventoryReportFilters = {},
): InventoryReportData {
  const { periodLabel, periodDates } = periodMeta(preset, range);
  const rows = inventoryRows(REPORT_AS_OF);
  const { lots, expiredStockValue } = buildExpiryInventoryLots(REPORT_AS_OF);
  const category = filters.category && filters.category !== "all" ? filters.category : "all";
  const status = filters.status && filters.status !== "all" ? filters.status : "all";

  const soonProductIds = new Set(
    lots.filter((lot) => lot.status === "Expiring Soon").map((lot) => lot.productId),
  );
  const expiredProductIds = new Set(
    lots.filter((lot) => lot.status === "Expired").map((lot) => lot.productId),
  );

  const filteredRows = rows.filter((row) => {
    if (category !== "all" && row.category !== category) return false;
    if (status === "all") return true;
    if (status === "In Stock" || status === "Low Stock" || status === "Out of Stock") {
      return row.status === status;
    }
    if (status === "Expiring Soon") return soonProductIds.has(row.id);
    if (status === "Expired") return expiredProductIds.has(row.id);
    return true;
  });

  const expiryRows = lots
    .filter((lot) => {
      if (category === "all") return true;
      const product = rows.find((row) => row.id === lot.productId);
      return product?.category === category;
    })
    .slice()
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name))
    .map((lot) => ({
      name: lot.name,
      quantity: lot.quantity,
      expiryDate: formatSalesDate(lot.expiryDate),
      status: lot.status,
      stockValue: lot.stockValue,
    }));

  const lowStockProducts = filteredRows
    .filter((item) => item.status === "Low Stock" || item.status === "Out of Stock")
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 12)
    .map(({ name, sku, stock, reorderLevel, value, status: rowStatus }) => ({
      name,
      sku,
      stock,
      reorderLevel,
      value,
      status: rowStatus,
    }));

  const totalProducts = filteredRows.length;
  const totalStockUnits = filteredRows.reduce((sum, item) => sum + item.stock, 0);
  const totalInventoryValue = filteredRows.reduce((sum, item) => sum + item.value, 0);
  const lowStock = filteredRows.filter((item) => item.status === "Low Stock").length;

  // Stable mock prior-period baselines for trend badges (exact % match to report design)
  const priorProducts = totalProducts / 1.12;
  const priorUnits = totalStockUnits / 1.08;
  const priorValue = totalInventoryValue / 1.05;
  const priorLow = Math.max(1, lowStock / 2);

  return {
    periodLabel,
    periodDates,
    comparisonLabel: inventoryComparisonLabel(preset),
    totalProducts,
    totalStockUnits,
    totalInventoryValue,
    inStock: filteredRows.filter((item) => item.status === "In Stock").length,
    lowStock,
    outOfStock: filteredRows.filter((item) => item.status === "Out of Stock").length,
    expiringSoon: expiryRows
      .filter((lot) => lot.status === "Expiring Soon")
      .reduce((sum, lot) => sum + lot.quantity, 0),
    expiredItems: expiryRows
      .filter((lot) => lot.status === "Expired")
      .reduce((sum, lot) => sum + lot.quantity, 0),
    expiredStockValue: expiryRows
      .filter((lot) => lot.status === "Expired")
      .reduce((sum, lot) => sum + lot.stockValue, 0),
    deltas: {
      products: inventoryPctDelta(totalProducts, priorProducts),
      stockUnits: inventoryPctDelta(totalStockUnits, priorUnits),
      inventoryValue: inventoryPctDelta(totalInventoryValue, priorValue),
      lowStock: inventoryPctDelta(lowStock, priorLow),
    },
    movements: [
      { label: "Received", count: 18, quantity: 64 },
      { label: "Sold", count: 7, quantity: 40 },
      { label: "Returned", count: 4, quantity: 26 },
      { label: "Adjusted", count: 3, quantity: 14 },
      { label: "Transferred", count: 2, quantity: 13 },
    ],
    lowStockProducts,
    valuation: filteredRows
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((row) => ({
        name: row.name,
        quantity: row.stock,
        buyingPrice: row.buyingPrice,
        stockValue: row.value,
        status: row.status,
        category: row.category,
      })),
    expiryRows,
  };
}

export type PurchaseReportFilters = {
  supplier?: string;
  paymentStatus?: string;
};

export type PurchaseReportData = {
  periodLabel: string;
  periodDates: string;
  comparisonLabel: string;
  totalPurchases: number;
  purchaseCount: number;
  itemsPurchased: number;
  supplierCount: number;
  amountPaid: number;
  outstanding: number;
  averageOrderValue: number;
  deltas: {
    purchases: number;
    orders: number;
    items: number;
    outstanding: number;
  };
  purchases: {
    number: string;
    supplier: string;
    date: string;
    items: number;
    amount: number;
    paymentStatus: string;
    status: string;
  }[];
  suppliers: { name: string; purchases: number; paid: number; outstanding: number }[];
  paymentStatusSummary: {
    status: string;
    amount: number;
    count: number;
    percentage: number;
  }[];
};

function purchaseDay(iso: string) {
  return iso.slice(0, 10);
}

function purchaseComparisonLabel(preset: SalesPeriodPreset) {
  if (preset === "today") return "vs yesterday";
  if (preset === "yesterday") return "vs prior day";
  if (preset === "week") return "vs last week";
  if (preset === "month") return "vs last month";
  return "vs prior period";
}

function purchasePctDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

export function buildPurchaseReportData(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: PurchaseReportFilters = {},
): PurchaseReportData {
  const { period, periodLabel, periodDates } = periodMeta(preset, range);
  const supplierFilter = filters.supplier && filters.supplier !== "all" ? filters.supplier : "all";
  const paymentFilter =
    filters.paymentStatus && filters.paymentStatus !== "all" ? filters.paymentStatus : "all";

  const periodPurchases = seedPurchases().filter((item) => {
    const day = purchaseDay(item.receivedAt);
    if (day < period.start || day > period.end) return false;
    if (supplierFilter !== "all" && item.supplierName !== supplierFilter) return false;
    if (paymentFilter !== "all" && item.paymentStatus !== paymentFilter) return false;
    return true;
  });

  const allPurchases = seedPurchases();
  const suppliers = seedSuppliers();

  const amountPaid = periodPurchases.reduce((sum, item) => {
    if (item.paymentStatus === "Paid") return sum + item.totalCost;
    if (item.paymentStatus === "Partial") return sum + Math.round(item.totalCost / 2);
    return sum;
  }, 0);

  const totalPurchases = periodPurchases.reduce((sum, item) => sum + item.totalCost, 0);
  const purchaseCount = periodPurchases.length;
  const itemsPurchased = periodPurchases.reduce((sum, item) => sum + item.itemCount, 0);
  const outstanding = Math.max(0, FINANCE_SUPPLIER.totalPurchases - FINANCE_SUPPLIER.totalPaid);
  const averageOrderValue = purchaseCount > 0 ? Math.round(totalPurchases / purchaseCount) : 0;

  const supplierScopePurchases = allPurchases.filter((item) => {
    if (supplierFilter !== "all" && item.supplierName !== supplierFilter) return false;
    if (paymentFilter !== "all" && item.paymentStatus !== paymentFilter) return false;
    return true;
  });

  const supplierRows = suppliers
    .map((supplier) => {
      const rows = supplierScopePurchases.filter((item) => item.supplierId === supplier.id);
      const purchaseTotal = rows.reduce((sum, item) => sum + item.totalCost, 0);
      const paid = rows.reduce((sum, item) => {
        if (item.paymentStatus === "Paid") return sum + item.totalCost;
        if (item.paymentStatus === "Partial") return sum + Math.round(item.totalCost / 2);
        return sum;
      }, 0);
      return {
        name: supplier.name,
        purchases: purchaseTotal,
        paid,
        outstanding: Math.max(0, purchaseTotal - paid),
      };
    })
    .filter((item) => item.purchases > 0)
    .sort((a, b) => b.purchases - a.purchases);

  const supplierPurchaseTotal = supplierRows.reduce((sum, row) => sum + row.purchases, 0);
  const paymentBuckets = ["Paid", "Partial", "Unpaid"] as const;
  const paymentStatusSummary = paymentBuckets
    .map((status) => {
      const rows = supplierScopePurchases.filter((item) => item.paymentStatus === status);
      const amount = rows.reduce((sum, item) => sum + item.totalCost, 0);
      return {
        status,
        amount,
        count: rows.length,
        percentage:
          supplierPurchaseTotal > 0 ? Math.round((amount / supplierPurchaseTotal) * 1000) / 10 : 0,
      };
    })
    .filter((row) => row.count > 0 || row.amount > 0);

  const priorPurchases = totalPurchases / 1.12;
  const priorOrders = Math.max(purchaseCount, 1); // stable 0% when count unchanged vs designed baseline
  const priorItems = itemsPurchased / 2;
  const priorOutstanding = outstanding / 1.25;

  return {
    periodLabel,
    periodDates,
    comparisonLabel: purchaseComparisonLabel(preset),
    totalPurchases,
    purchaseCount,
    itemsPurchased,
    supplierCount: new Set(periodPurchases.map((item) => item.supplierName)).size || supplierRows.length,
    amountPaid,
    outstanding,
    averageOrderValue,
    deltas: {
      purchases: purchasePctDelta(totalPurchases, priorPurchases || 1),
      orders: purchaseCount === 0 ? 0 : purchasePctDelta(purchaseCount, priorOrders),
      items: purchasePctDelta(itemsPurchased, priorItems || (itemsPurchased === 0 ? 0 : 0.01)),
      outstanding: purchasePctDelta(outstanding, priorOutstanding || 1),
    },
    purchases: periodPurchases.map((item) => ({
      number: item.number,
      supplier: item.supplierName,
      date: formatSalesDate(item.receivedAt),
      items: item.itemCount,
      amount: item.totalCost,
      paymentStatus: item.paymentStatus,
      status: item.status,
    })),
    suppliers: supplierRows,
    paymentStatusSummary,
  };
}

export type ProfitLossReportData = {
  periodLabel: string;
  periodDates: string;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  inventoryLoss: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
  /** Kept for PDF backwards compatibility */
  productProfit: number;
  topProducts: { name: string; unitsSold: number; productProfit: number }[];
  expenses: { category: string; description: string; amount: number }[];
};

export function buildProfitLossReportData(preset: SalesPeriodPreset, range: SalesDateRange): ProfitLossReportData {
  const { period, periodLabel, periodDates } = periodMeta(preset, range);
  const activity = getFinanceActivitySnapshot();
  const expensesOverride = recordedExpenseTotal(activity.expenses);
  const summary = getSupermarketFinanceSummary(preset, range, expensesOverride);
  const revenue = summary.revenue;
  const grossProfit = summary.productProfit;
  const costOfGoodsSold = Math.max(0, revenue - grossProfit);
  const operatingExpenses = summary.expenses;
  // Same expired stock value as Inventory Report — deducted after gross profit, not inside COGS.
  const { expiredStockValue: inventoryLoss } = buildExpiryInventoryLots(REPORT_AS_OF);
  const netProfit = grossProfit - operatingExpenses - inventoryLoss;

  const expenses = filterMockExpenses(activity.expenses, {
    start: period.start,
    end: period.end,
    category: "all",
    paymentMethod: "all",
    query: "",
  }).map((item) => ({
    category: item.category,
    description: item.name || item.note || item.category,
    amount: item.amount,
  }));

  const fallbackExpenses =
    expenses.length > 0
      ? expenses
      : [
          { category: "Rent", description: "Shop rent", amount: Math.round(operatingExpenses * 0.35) },
          { category: "Utilities", description: "Electricity and water", amount: Math.round(operatingExpenses * 0.18) },
          { category: "Transport", description: "Delivery and logistics", amount: Math.round(operatingExpenses * 0.12) },
          { category: "Salaries", description: "Staff salaries", amount: Math.round(operatingExpenses * 0.28) },
          {
            category: "Other Operating Expenses",
            description: "Miscellaneous operating costs",
            amount: Math.max(0, operatingExpenses - Math.round(operatingExpenses * 0.93)),
          },
        ];

  return {
    periodLabel,
    periodDates,
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    inventoryLoss,
    netProfit,
    grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
    productProfit: grossProfit,
    topProducts: [],
    expenses: fallbackExpenses,
  };
}

export function reportGeneratedDate() {
  return formatSalesDate(new Date().toISOString());
}
