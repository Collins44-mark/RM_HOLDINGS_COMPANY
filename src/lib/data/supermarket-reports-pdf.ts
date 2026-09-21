import {
  downloadPdfBytes,
  formatPdfGeneratedAt,
  formatPdfNumber,
  formatPdfPercent,
  pdfAscii,
  type TableColumn,
} from "@/lib/pdf/report-document";
import {
  CorporateReportDocument,
  CorporateSalesDocument,
} from "@/lib/pdf/corporate-report-document";
import type {
  InventoryReportData,
  ProfitLossReportData,
  PurchaseReportData,
  SalesReportData,
  SalesReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import {
  fetchInventoryReportAction,
  fetchProfitLossReportAction,
  fetchPurchaseReportAction,
  fetchSalesReportAction,
} from "@/actions/supermarket/reports";

const BUSINESS_UNIT = "Supermarket System";

function filtersDescription(filters: SalesReportFilters = {}) {
  const parts: string[] = [];
  if (filters.cashier && filters.cashier !== "all") parts.push(`Cashier: ${filters.cashier}`);
  if (filters.payment && filters.payment !== "all") parts.push(`Payment Method: ${filters.payment}`);
  if (filters.category && filters.category !== "all") parts.push(`Category: ${filters.category}`);
  const filterText =
    parts.length > 0 ? ` Applied filters: ${parts.join("; ")}.` : "";
  return `This report shows the sales performance for the selected period based on applied filters (if any).${filterText} All figures are in Tanzanian Shillings (TZS).`;
}

function salesReportFilename(periodLabel: string) {
  const slug = pdfAscii(periodLabel)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `RM-Supermarket-Sales-Report-${slug || "Period"}.pdf`;
}

function inventoryReportFilename(periodLabel: string) {
  const slug = pdfAscii(periodLabel)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `RM-Supermarket-Inventory-Report-${slug || "Period"}.pdf`;
}

function formatPdfTzs(amount: number) {
  return `TZS ${formatPdfNumber(amount)}`;
}

function renderSalesPdf(data: SalesReportData, filters: SalesReportFilters = {}) {
  const doc = new CorporateSalesDocument({
    businessUnit: BUSINESS_UNIT,
    title: "Sales Report",
    subtitle: "Sales performance for the selected period.",
    periodLabel: data.periodLabel,
    periodDates: data.periodDates,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: "Collins Sarungi",
    preparedRole: "System Administrator",
    filtersNote: filtersDescription(filters),
  });

  doc.addSectionTable(
    "Sales Summary",
    [
      { key: "metric", label: "Metric", width: 360 },
      { key: "value", label: "Value", width: 151, align: "right" },
    ],
    [
      { metric: "Total Revenue (TZS)", value: formatPdfNumber(data.totalRevenue) },
      { metric: "Total Sales (Transactions)", value: formatPdfNumber(data.totalSales) },
      { metric: "Items Sold", value: formatPdfNumber(data.itemsSold) },
      { metric: "Returns (TZS)", value: formatPdfNumber(data.returnsAmount) },
    ],
  );

  const paymentCols: TableColumn[] = [
    { key: "method", label: "Payment Method", width: 78 },
    { key: "count", label: "Transactions", width: 50, align: "right" },
    { key: "amount", label: "Amount (TZS)", width: 70, align: "right" },
    { key: "pct", label: "% of Sales", width: 50, align: "right" },
  ];
  const paymentTotalCount = data.paymentBreakdown.reduce((sum, row) => sum + row.count, 0);
  const paymentTotalAmount = data.paymentBreakdown.reduce((sum, row) => sum + row.amount, 0);

  const cashierCols: TableColumn[] = [
    { key: "cashier", label: "Cashier", width: 58 },
    { key: "sales", label: "Sales", width: 36, align: "right" },
    { key: "items", label: "Items Sold", width: 48, align: "right" },
    { key: "revenue", label: "Revenue (TZS)", width: 66, align: "right" },
    { key: "pct", label: "% of Sales", width: 40, align: "right" },
  ];
  const cashierSales = data.cashierPerformance.reduce((sum, row) => sum + row.sales, 0);
  const cashierItems = data.cashierPerformance.reduce((sum, row) => sum + row.itemsSold, 0);
  const cashierRevenue = data.cashierPerformance.reduce((sum, row) => sum + row.revenue, 0);

  doc.addTwoColumnSections(
    {
      title: "Sales by Payment Method",
      columns: paymentCols,
      rows: data.paymentBreakdown.map((row) => ({
        method: row.method,
        count: formatPdfNumber(row.count),
        amount: formatPdfNumber(row.amount),
        pct: formatPdfPercent(row.percentage),
      })),
      totalRow: {
        method: "Total",
        count: formatPdfNumber(paymentTotalCount),
        amount: formatPdfNumber(paymentTotalAmount),
        pct: formatPdfPercent(100),
      },
    },
    {
      title: "Cashier Performance",
      columns: cashierCols,
      rows: data.cashierPerformance.map((row) => ({
        cashier: row.cashier,
        sales: formatPdfNumber(row.sales),
        items: formatPdfNumber(row.itemsSold),
        revenue: formatPdfNumber(row.revenue),
        pct: formatPdfPercent(
          cashierRevenue > 0 ? Math.round((row.revenue / cashierRevenue) * 1000) / 10 : 0,
        ),
      })),
      totalRow: {
        cashier: "Total",
        sales: formatPdfNumber(cashierSales),
        items: formatPdfNumber(cashierItems),
        revenue: formatPdfNumber(cashierRevenue),
        pct: formatPdfPercent(100),
      },
    },
  );

  const productCols: TableColumn[] = [
    { key: "rank", label: "#", width: 22, align: "center" },
    { key: "product", label: "Product", width: 108 },
    { key: "qty", label: "Quantity Sold", width: 58, align: "right" },
    { key: "revenue", label: "Revenue (TZS)", width: 60, align: "right" },
  ];

  doc.addTwoColumnSections(
    {
      title: "Top Selling Products",
      columns: productCols,
      rows: data.topProducts.map((row, index) => ({
        rank: String(index + 1),
        product: row.name,
        qty: formatPdfNumber(row.quantity),
        revenue: formatPdfNumber(row.revenue),
      })),
    },
    {
      title: "Low Selling Products",
      columns: productCols,
      rows: data.lowProducts.map((row, index) => ({
        rank: String(index + 1),
        product: row.name,
        qty: formatPdfNumber(row.quantity),
        revenue: formatPdfNumber(row.revenue),
      })),
    },
  );

  return doc.build();
}

function renderInventoryPdf(data: InventoryReportData) {
  const doc = new CorporateReportDocument({
    businessUnit: BUSINESS_UNIT,
    title: "Inventory Report",
    subtitle: "Stock levels, valuation and expiry status for the selected period.",
    periodLabel: data.periodLabel,
    periodDates: data.periodDates,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: "Collins Sarungi",
    preparedRole: "System Administrator",
    filtersNote:
      "This report shows inventory valuation at buying/cost price. Expired stock is excluded from sellable inventory value and reported separately. All figures are in Tanzanian Shillings (TZS).",
  });

  doc.addSectionTable(
    "Inventory Summary",
    [
      { key: "metric", label: "Metric", width: 340 },
      { key: "value", label: "Value", width: 171, align: "right" },
    ],
    [
      { metric: "Total Products", value: formatPdfNumber(data.totalProducts) },
      { metric: "Total Stock Units", value: formatPdfNumber(data.totalStockUnits) },
      { metric: "Inventory Value (TZS)", value: formatPdfNumber(data.totalInventoryValue) },
      { metric: "Low Stock Items", value: formatPdfNumber(data.lowStock) },
      { metric: "Expiring Soon", value: formatPdfNumber(data.expiringSoon) },
      { metric: "Expired Items", value: formatPdfNumber(data.expiredItems) },
      {
        metric: "Expired Stock Value / Loss (TZS)",
        value: formatPdfNumber(data.expiredStockValue),
      },
    ],
  );

  doc.addSectionTable(
    "Stock Movement",
    [
      { key: "movement", label: "Movement", width: 220 },
      { key: "count", label: "Count", width: 120, align: "right" },
      { key: "quantity", label: "Quantity", width: 171, align: "right" },
    ],
    data.movements.map((row) => ({
      movement: row.label,
      count: formatPdfNumber(row.count),
      quantity: formatPdfNumber(row.quantity),
    })),
  );

  doc.addFlowingSectionTable(
    "Inventory Valuation",
    [
      { key: "rank", label: "#", width: 28, align: "center" },
      { key: "product", label: "Product", width: 150 },
      { key: "qty", label: "Quantity", width: 58, align: "right" },
      { key: "price", label: "Buying Price", width: 95, align: "right" },
      { key: "value", label: "Stock Value", width: 95, align: "right" },
      { key: "status", label: "Status", width: 85 },
    ],
    data.valuation.map((row, index) => ({
      rank: String(index + 1),
      product: row.name,
      qty: formatPdfNumber(row.quantity),
      price: formatPdfTzs(row.buyingPrice),
      value: formatPdfTzs(row.stockValue),
      status: row.status,
    })),
    {
      subtitle: "Current stock valuation by product.",
      statusKey: "status",
    },
  );

  return doc.build();
}

function renderPurchasePdf(data: PurchaseReportData) {
  const doc = new CorporateReportDocument({
    businessUnit: BUSINESS_UNIT,
    title: "Purchase Report",
    subtitle: "Purchases, suppliers and outstanding amounts for the selected period.",
    periodLabel: data.periodLabel,
    periodDates: data.periodDates,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: "Collins Sarungi",
    preparedRole: "System Administrator",
    filtersNote:
      "This report summarizes purchase activity for the selected period. All figures are in Tanzanian Shillings (TZS).",
  });

  doc.addSectionTable(
    "Purchase Summary",
    [
      { key: "metric", label: "Metric", width: 360 },
      { key: "value", label: "Value", width: 151, align: "right" },
    ],
    [
      { metric: "Total Purchases (TZS)", value: formatPdfNumber(data.totalPurchases) },
      { metric: "Purchase Orders", value: formatPdfNumber(data.purchaseCount) },
      { metric: "Items Purchased", value: formatPdfNumber(data.itemsPurchased) },
      { metric: "Amount Paid (TZS)", value: formatPdfNumber(data.amountPaid) },
      { metric: "Outstanding (TZS)", value: formatPdfNumber(data.outstanding) },
    ],
  );

  doc.addSectionTable(
    "Purchases by Supplier",
    [
      { key: "supplier", label: "Supplier", width: 170 },
      { key: "purchases", label: "Amount (TZS)", width: 100, align: "right" },
      { key: "paid", label: "Paid", width: 100, align: "right" },
      { key: "due", label: "Outstanding", width: 141, align: "right" },
    ],
    data.suppliers.map((row) => ({
      supplier: row.name,
      purchases: formatPdfNumber(row.purchases),
      paid: formatPdfNumber(row.paid),
      due: formatPdfNumber(row.outstanding),
    })),
  );

  doc.addFlowingSectionTable(
    "Purchase Details",
    [
      { key: "number", label: "PO Number", width: 80 },
      { key: "supplier", label: "Supplier", width: 130 },
      { key: "date", label: "Date", width: 80 },
      { key: "items", label: "Items", width: 45, align: "right" },
      { key: "amount", label: "Amount (TZS)", width: 90, align: "right" },
      { key: "status", label: "Payment", width: 86 },
    ],
    data.purchases.map((row) => ({
      number: row.number,
      supplier: row.supplier,
      date: row.date,
      items: formatPdfNumber(row.items),
      amount: formatPdfNumber(row.amount),
      status: row.paymentStatus,
    })),
  );

  const outstandingSuppliers = data.suppliers.filter((row) => row.outstanding > 0);
  if (outstandingSuppliers.length > 0) {
    doc.addSectionTable(
      "Supplier Outstanding",
      [
        { key: "supplier", label: "Supplier", width: 320 },
        { key: "due", label: "Amount Due (TZS)", width: 191, align: "right" },
      ],
      outstandingSuppliers.map((row) => ({
        supplier: row.name,
        due: formatPdfNumber(row.outstanding),
      })),
    );
  }

  return doc.build();
}

function renderProfitLossPdf(data: ProfitLossReportData) {
  const doc = new CorporateReportDocument({
    businessUnit: BUSINESS_UNIT,
    title: "Profit & Loss",
    subtitle: "Financial performance for the selected period.",
    periodLabel: data.periodLabel,
    periodDates: data.periodDates,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: "Collins Sarungi",
    preparedRole: "System Administrator",
    filtersNote:
      "Net Profit = Gross Profit - Operating Expenses - Loss from Expired/Damaged Stock. Expired stock loss is excluded from COGS to avoid double-counting. All figures are in Tanzanian Shillings (TZS).",
  });

  doc.addSectionTable(
    "Profit & Loss Statement",
    [
      { key: "desc", label: "Description", width: 360 },
      { key: "amount", label: "Amount (TZS)", width: 151, align: "right" },
    ],
    [
      { desc: "Revenue", amount: formatPdfNumber(data.revenue) },
      { desc: "Less: Cost of Goods Sold", amount: formatPdfNumber(data.costOfGoodsSold) },
      { desc: "Gross Profit", amount: formatPdfNumber(data.grossProfit) },
      { desc: "Less: Operating Expenses", amount: formatPdfNumber(data.operatingExpenses) },
      {
        desc: "Less: Loss from Expired/Damaged Stock",
        amount: formatPdfNumber(data.inventoryLoss),
      },
      { desc: "Net Profit", amount: formatPdfNumber(data.netProfit) },
      { desc: "Gross Margin", amount: formatPdfPercent(data.grossMargin) },
      { desc: "Net Margin", amount: formatPdfPercent(data.netMargin) },
    ],
    {
      emphasize: { key: "desc", values: ["Gross Profit", "Net Profit"] },
    },
  );

  doc.addSectionTable(
    "Operating Expenses",
    [
      { key: "category", label: "Category", width: 140 },
      { key: "description", label: "Description", width: 220 },
      { key: "amount", label: "Amount (TZS)", width: 151, align: "right" },
    ],
    data.expenses.map((row) => ({
      category: row.category,
      description: row.description,
      amount: formatPdfNumber(row.amount),
    })),
    {
      totalRow: {
        category: "Total",
        description: "",
        amount: formatPdfNumber(data.operatingExpenses),
      },
    },
  );

  doc.addSectionTable(
    "Stock Losses",
    [
      { key: "type", label: "Category", width: 360 },
      { key: "amount", label: "Amount (TZS)", width: 151, align: "right" },
    ],
    [
      { type: "Expired Stock", amount: formatPdfNumber(data.inventoryLoss) },
      { type: "Damaged Stock", amount: formatPdfNumber(0) },
      { type: "Lost Stock", amount: formatPdfNumber(0) },
    ],
  );

  return doc.build();
}

/** Export PDF from live report payload already loaded on screen. */
export function downloadSalesReportPdfFromData(data: SalesReportData, filters: SalesReportFilters = {}) {
  downloadPdfBytes(renderSalesPdf(data, filters), salesReportFilename(data.periodLabel));
}

export function downloadInventoryReportPdfFromData(data: InventoryReportData) {
  downloadPdfBytes(renderInventoryPdf(data), inventoryReportFilename(data.periodLabel));
}

export function downloadPurchaseReportPdfFromData(data: PurchaseReportData) {
  downloadPdfBytes(renderPurchasePdf(data), "RM-Supermarket-Purchase-Report.pdf");
}

export function downloadProfitLossReportPdfFromData(data: ProfitLossReportData) {
  downloadPdfBytes(renderProfitLossPdf(data), "RM-Supermarket-Profit-Loss-Report.pdf");
}

/**
 * Fetch live Supabase report data, then export PDF.
 * Never uses sample/mock report builders.
 */
export async function downloadReportPdf(
  kind: "sales" | "inventory" | "purchases" | "profit-loss",
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: SalesReportFilters = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (kind === "sales") {
    const result = await fetchSalesReportAction(preset, range, filters);
    if (!result.ok) return result;
    downloadSalesReportPdfFromData(result.data, filters);
    return { ok: true };
  }
  if (kind === "inventory") {
    const result = await fetchInventoryReportAction(preset, range);
    if (!result.ok) return result;
    downloadInventoryReportPdfFromData(result.data);
    return { ok: true };
  }
  if (kind === "purchases") {
    const result = await fetchPurchaseReportAction(preset, range);
    if (!result.ok) return result;
    downloadPurchaseReportPdfFromData(result.data);
    return { ok: true };
  }
  const result = await fetchProfitLossReportAction(preset, range);
  if (!result.ok) return result;
  downloadProfitLossReportPdfFromData(result.data);
  return { ok: true };
}

/** @deprecated Prefer downloadSalesReportPdfFromData with live report data. */
export async function downloadSalesCenterReportPdf(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: SalesReportFilters = {},
) {
  return downloadReportPdf("sales", preset, range, filters);
}
