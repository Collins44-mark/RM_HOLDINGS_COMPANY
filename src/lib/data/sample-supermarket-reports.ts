import { SUPERMARKET_SAMPLE } from "@/lib/data/sample-supermarket";
import { seedPurchases, seedSuppliers } from "@/lib/data/supermarket-purchasing";
import { SUPERMARKET_RETURNS, filterReturns } from "@/lib/data/sample-supermarket-returns";
import { SUPERMARKET_SAMPLE_PRODUCTS } from "@/lib/data/supermarket-inventory";
import {
  FINANCE_SUPPLIER,
  getSupermarketFinanceSummary,
  getProductProfitRows,
  recordedExpenseTotal,
  getFinanceActivitySnapshot,
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
    description: "Sales performance, revenue, transactions and payment methods.",
    href: "/supermarket/reports/sales",
  },
  inventory: {
    title: "Inventory Report",
    description: "Current stock, stock value, movements and low-stock items.",
    href: "/supermarket/reports/inventory",
  },
  purchases: {
    title: "Purchase Report",
    description: "Purchases, suppliers, received stock and supplier payments.",
    href: "/supermarket/reports/purchases",
  },
  "profit-loss": {
    title: "Profit & Loss",
    description: "Revenue, product profit, operating expenses and net profit.",
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

export type SalesReportData = {
  periodLabel: string;
  periodDates: string;
  totalRevenue: number;
  totalTransactions: number;
  itemsSold: number;
  discounts: number;
  returnsAmount: number;
  returnsCount: number;
  paymentBreakdown: { method: string; amount: number; count: number }[];
  dailySales: { day: string; amount: number; transactions: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  sales: SupermarketSale[];
};

export function buildSalesReportData(preset: SalesPeriodPreset, range: SalesDateRange): SalesReportData {
  const period = resolveReportPeriod(preset, range);
  const sales = filterSales(SUPERMARKET_SALES, {
    start: period.start,
    end: period.end,
    cashier: "all",
    payment: "all",
    status: "all",
    query: "",
  });
  const returns = filterReturns(SUPERMARKET_RETURNS, {
    start: period.start,
    end: period.end,
    cashier: "all",
    method: "all",
    status: "all",
    query: "",
  });

  const paymentMap = new Map<string, { amount: number; count: number }>();
  const dailyMap = new Map<string, { amount: number; transactions: number }>();
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  let discounts = 0;
  let itemsSold = 0;

  for (const sale of sales) {
    discounts += sale.discount;
    itemsSold += sale.itemsCount;
    const pay = paymentMap.get(sale.payment) ?? { amount: 0, count: 0 };
    pay.amount += saleTotal(sale);
    pay.count += 1;
    paymentMap.set(sale.payment, pay);

    const day = sale.dateLabel;
    const daily = dailyMap.get(day) ?? { amount: 0, transactions: 0 };
    daily.amount += saleTotal(sale);
    daily.transactions += 1;
    dailyMap.set(day, daily);

    for (const line of sale.lines) {
      const product = productMap.get(line.name) ?? { quantity: 0, revenue: 0 };
      product.quantity += line.quantity;
      product.revenue += line.quantity * line.unitPrice;
      productMap.set(line.name, product);
    }
  }

  return {
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
    totalRevenue: sales.reduce((sum, sale) => sum + saleTotal(sale), 0),
    totalTransactions: sales.length,
    itemsSold,
    discounts,
    returnsAmount: returns.reduce((sum, row) => sum + row.amount, 0),
    returnsCount: returns.length,
    paymentBreakdown: [...paymentMap.entries()]
      .map(([method, value]) => ({ method, ...value }))
      .sort((a, b) => b.amount - a.amount),
    dailySales: [...dailyMap.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .slice(0, 14),
    topProducts: [...productMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8),
    sales,
  };
}

export type InventoryReportData = {
  periodLabel: string;
  periodDates: string;
  totalProducts: number;
  totalStockUnits: number;
  totalInventoryValue: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  movements: { label: string; count: number }[];
  lowStockProducts: { name: string; sku: string; stock: number; reorderLevel: number; value: number }[];
};

export function buildInventoryReportData(preset: SalesPeriodPreset, range: SalesDateRange): InventoryReportData {
  const period = resolveReportPeriod(preset, range);
  const products = SUPERMARKET_SAMPLE_PRODUCTS.filter((item) => item.isActive !== false);
  const rows = products.map((product, index) => {
    const stock =
      product.reorderLevel > 0
        ? Math.max(0, product.reorderLevel + ((index * 7) % 25) - 4)
        : Math.max(0, 8 + (index % 12));
    const status = stock === 0 ? "Out of Stock" : stock <= product.reorderLevel ? "Low Stock" : "In Stock";
    return {
      name: product.name,
      sku: product.sku,
      stock,
      reorderLevel: product.reorderLevel,
      buyingPrice: product.buyingPrice,
      status,
      value: stock * product.buyingPrice,
    };
  });

  const lowStockProducts = rows
    .filter((item) => item.status === "Low Stock" || item.status === "Out of Stock")
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 12)
    .map(({ name, sku, stock, reorderLevel, value }) => ({ name, sku, stock, reorderLevel, value }));

  return {
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
    totalProducts: rows.length,
    totalStockUnits: rows.reduce((sum, item) => sum + item.stock, 0),
    totalInventoryValue:
      SUPERMARKET_SAMPLE.kpis.inventoryValue ||
      rows.reduce((sum, item) => sum + item.value, 0),
    inStock: rows.filter((item) => item.status === "In Stock").length,
    lowStock: rows.filter((item) => item.status === "Low Stock").length,
    outOfStock: rows.filter((item) => item.status === "Out of Stock").length,
    movements: [
      { label: "Received", count: 18 },
      { label: "Sold", count: 64 },
      { label: "Returned", count: 7 },
      { label: "Adjusted", count: 4 },
      { label: "Transferred", count: 3 },
    ],
    lowStockProducts,
  };
}

export type PurchaseReportData = {
  periodLabel: string;
  periodDates: string;
  totalPurchases: number;
  purchaseCount: number;
  supplierCount: number;
  amountPaid: number;
  outstanding: number;
  purchases: { number: string; supplier: string; date: string; amount: number; paymentStatus: string }[];
  suppliers: { name: string; purchases: number; paid: number; outstanding: number }[];
};

function purchaseDay(iso: string) {
  return iso.slice(0, 10);
}

export function buildPurchaseReportData(preset: SalesPeriodPreset, range: SalesDateRange): PurchaseReportData {
  const period = resolveReportPeriod(preset, range);
  const purchases = seedPurchases().filter((item) => {
    const day = purchaseDay(item.receivedAt);
    return day >= period.start && day <= period.end;
  });
  const allPurchases = seedPurchases();
  const suppliers = seedSuppliers();

  const amountPaid = purchases.reduce((sum, item) => {
    if (item.paymentStatus === "Paid") return sum + item.totalCost;
    if (item.paymentStatus === "Partial") return sum + Math.round(item.totalCost / 2);
    return sum;
  }, 0);

  const outstanding = Math.max(
    0,
    FINANCE_SUPPLIER.totalPurchases - FINANCE_SUPPLIER.totalPaid,
  );

  const supplierRows = suppliers.map((supplier) => {
    const rows = allPurchases.filter((item) => item.supplierId === supplier.id);
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
  });

  return {
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
    totalPurchases: purchases.reduce((sum, item) => sum + item.totalCost, 0),
    purchaseCount: purchases.length,
    supplierCount: suppliers.length,
    amountPaid,
    outstanding,
    purchases: purchases.map((item) => ({
      number: item.number,
      supplier: item.supplierName,
      date: formatSalesDate(item.receivedAt),
      amount: item.totalCost,
      paymentStatus: item.paymentStatus,
    })),
    suppliers: supplierRows.filter((item) => item.purchases > 0).sort((a, b) => b.purchases - a.purchases),
  };
}

export type ProfitLossReportData = {
  periodLabel: string;
  periodDates: string;
  revenue: number;
  productProfit: number;
  operatingExpenses: number;
  netProfit: number;
  topProducts: { name: string; unitsSold: number; productProfit: number }[];
};

export function buildProfitLossReportData(preset: SalesPeriodPreset, range: SalesDateRange): ProfitLossReportData {
  const period = resolveReportPeriod(preset, range);
  const activity = getFinanceActivitySnapshot();
  const expensesOverride = recordedExpenseTotal(activity.expenses);
  const summary = getSupermarketFinanceSummary(preset, range, expensesOverride);
  const products = getProductProfitRows()
    .slice()
    .sort((a, b) => b.productProfit - a.productProfit)
    .slice(0, 8)
    .map((row) => ({
      name: row.product,
      unitsSold: row.unitsSold,
      productProfit: row.productProfit,
    }));

  return {
    periodLabel: period.label,
    periodDates:
      period.start === period.end
        ? formatSalesDate(period.start)
        : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
    revenue: summary.revenue,
    productProfit: summary.productProfit,
    operatingExpenses: summary.expenses,
    netProfit: summary.netProfit,
    topProducts: products,
  };
}

export function reportGeneratedDate() {
  return formatSalesDate(new Date().toISOString());
}
