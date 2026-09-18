import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import {
  buildInventoryReportData,
  buildProfitLossReportData,
  buildPurchaseReportData,
  buildSalesReportData,
  reportGeneratedDate,
  type InventoryReportData,
  type ProfitLossReportData,
  type PurchaseReportData,
  type SalesReportData,
  type SalesReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, (char) => {
    if (char === "–" || char === "—") return "-";
    if (char === "•") return "-";
    return " ";
  });
}

function text(font: "F1" | "F2", size: number, x: number, y: number, value: string) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(ascii(value))}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.6) {
  return `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
}

function fillRect(x: number, y: number, w: number, h: number, color: string) {
  return `${color} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}

function clip(value: string, max: number) {
  const textValue = ascii(value);
  return textValue.length > max ? `${textValue.slice(0, Math.max(0, max - 3))}...` : textValue;
}

function buildPdf(pageStreams: string[]) {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pageStreams.map((_, index) => 5 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 6 + index * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  pageStreams.forEach((stream, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let offset = 0;
  const chunks: string[] = ["%PDF-1.4\n"];
  offset = chunks[0].length;
  const xref: number[] = [0];
  objects.forEach((body, index) => {
    xref.push(offset);
    const object = `${index + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(object);
    offset += object.length;
  });
  const xrefStart = offset;
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((value) => {
    xrefTable += `${String(value).padStart(10, "0")} 00000 n \n`;
  });
  chunks.push(
    xrefTable,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );
  return new TextEncoder().encode(chunks.join(""));
}

function header(reportName: string) {
  return [
    fillRect(0, PAGE_H - 72, PAGE_W, 72, "0.043 0.133 0.267"),
    "1 1 1 rg",
    text("F2", 11, MARGIN, PAGE_H - 28, APP_NAME.toUpperCase()),
    text("F1", 9, MARGIN, PAGE_H - 44, "RM Supermarket"),
    text("F2", 16, MARGIN, PAGE_H - 62, reportName),
    "0.043 0.133 0.267 rg",
  ];
}

function metaBlock(periodLabel: string, periodDates: string, generated: string) {
  return [
    text("F2", 9, MARGIN, PAGE_H - 96, "Report Period"),
    text("F1", 10, MARGIN, PAGE_H - 110, `${periodLabel}${periodDates ? `  |  ${periodDates}` : ""}`),
    text("F2", 9, MARGIN + 300, PAGE_H - 96, "Generated Date"),
    text("F1", 10, MARGIN + 300, PAGE_H - 110, generated),
  ];
}

function footer(pageNumber: number, pageCount: number) {
  return [
    "0.55 0.58 0.62 rg",
    line(MARGIN, 40, PAGE_W - MARGIN, 40, 0.4),
    text("F1", 8, MARGIN, 26, APP_NAME),
    text("F1", 8, MARGIN + 120, 26, ascii(APP_TAGLINE)),
    text("F1", 8, PAGE_W - MARGIN - 70, 26, `Page ${pageNumber} of ${pageCount}`),
    "0.043 0.133 0.267 rg",
  ];
}

function kpiCard(x: number, y: number, label: string, value: string, color: string) {
  return [
    fillRect(x, y, 122, 48, color),
    text("F1", 8, x + 10, y + 34, label),
    text("F2", 11, x + 10, y + 16, clip(value, 16)),
  ];
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderSalesPdf(data: SalesReportData) {
  const generated = reportGeneratedDate();
  const pages: string[][] = [];
  let page: string[] = [
    ...header("Sales Report"),
    ...metaBlock(data.periodLabel, data.periodDates, generated),
    ...kpiCard(MARGIN, PAGE_H - 180, "Total Revenue", formatTzs(data.totalRevenue), "0.933 0.961 0.996"),
    ...kpiCard(MARGIN + 132, PAGE_H - 180, "Sales", String(data.totalSales), "0.957 0.945 0.996"),
    ...kpiCard(MARGIN + 264, PAGE_H - 180, "Items Sold", String(data.itemsSold), "0.933 0.980 0.949"),
    ...kpiCard(MARGIN + 396, PAGE_H - 180, "Returns", formatTzs(data.returnsAmount), "1 0.945 0.945"),
    text("F2", 11, MARGIN, PAGE_H - 220, "Payment Methods"),
  ];
  let y = PAGE_H - 240;
  for (const row of data.paymentBreakdown) {
    page.push(
      text("F1", 9, MARGIN, y, `${row.method}  (${row.count})`),
      text("F2", 9, MARGIN + 220, y, formatTzs(row.amount)),
    );
    y -= 16;
  }
  y -= 10;
  page.push(text("F2", 11, MARGIN, y, "Cashier Performance"));
  y -= 18;
  for (const row of data.cashierPerformance) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Sales Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Cashier Performance (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, row.cashier),
      text("F1", 9, MARGIN + 120, y, `${row.sales} sales`),
      text("F1", 9, MARGIN + 200, y, `${row.itemsSold} items`),
      text("F2", 9, MARGIN + 300, y, formatTzs(row.revenue)),
    );
    y -= 15;
  }
  y -= 12;
  page.push(text("F2", 11, MARGIN, y, "Top Selling Products"));
  y -= 18;
  for (const row of data.topProducts) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Sales Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Top Selling Products (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, clip(row.name, 28)),
      text("F1", 9, MARGIN + 200, y, `${row.quantity} sold`),
      text("F2", 9, MARGIN + 300, y, formatTzs(row.revenue)),
    );
    y -= 15;
  }
  y -= 12;
  if (y < 140) {
    pages.push(page);
    page = [...header("Sales Report")];
    y = PAGE_H - 100;
  }
  page.push(text("F2", 11, MARGIN, y, "Low Selling Products"));
  y -= 18;
  for (const row of data.lowProducts) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Sales Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Low Selling Products (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, clip(row.name, 28)),
      text("F1", 9, MARGIN + 200, y, `${row.quantity} sold`),
      text("F2", 9, MARGIN + 300, y, formatTzs(row.revenue)),
    );
    y -= 15;
  }
  pages.push(page);
  const streams = pages.map((ops, index) => [...ops, ...footer(index + 1, pages.length)].join("\n"));
  return buildPdf(streams);
}

function renderInventoryPdf(data: InventoryReportData) {
  const generated = reportGeneratedDate();
  const pages: string[][] = [];
  let page: string[] = [
    ...header("Inventory Report"),
    ...metaBlock(data.periodLabel, data.periodDates, generated),
    ...kpiCard(MARGIN, PAGE_H - 180, "Total Products", String(data.totalProducts), "0.933 0.961 0.996"),
    ...kpiCard(MARGIN + 132, PAGE_H - 180, "Stock Units", String(data.totalStockUnits), "0.957 0.945 0.996"),
    ...kpiCard(MARGIN + 264, PAGE_H - 180, "Inventory Value", formatTzs(data.totalInventoryValue), "0.933 0.980 0.949"),
    ...kpiCard(MARGIN + 396, PAGE_H - 180, "Low Stock", String(data.lowStock), "1 0.973 0.918"),
    text("F1", 9, MARGIN, PAGE_H - 208, `Expiring Soon: ${data.expiringSoon}`),
    text("F1", 9, MARGIN + 160, PAGE_H - 208, `Expired Items: ${data.expiredItems}`),
    text("F1", 9, MARGIN + 320, PAGE_H - 208, `Expired Loss: ${formatTzs(data.expiredStockValue)}`),
    text("F2", 11, MARGIN, PAGE_H - 236, "Stock Movement"),
  ];
  let y = PAGE_H - 254;
  for (const row of data.movements) {
    page.push(text("F1", 9, MARGIN, y, row.label), text("F2", 9, MARGIN + 200, y, String(row.count)));
    y -= 15;
  }
  y -= 12;
  page.push(text("F2", 11, MARGIN, y, "Inventory Valuation"));
  y -= 18;
  for (const row of data.valuation) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Inventory Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Inventory Valuation (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, clip(row.name, 24)),
      text("F1", 9, MARGIN + 190, y, String(row.quantity)),
      text("F1", 8, MARGIN + 250, y, formatTzs(row.buyingPrice)),
      text("F2", 9, MARGIN + 360, y, formatTzs(row.stockValue)),
    );
    y -= 15;
  }
  y -= 12;
  if (y < 140) {
    pages.push(page);
    page = [...header("Inventory Report")];
    y = PAGE_H - 100;
  }
  page.push(text("F2", 11, MARGIN, y, "Expiry & Inventory Loss"));
  y -= 16;
  page.push(text("F1", 9, MARGIN, y, `Expired Stock Value / Loss: ${formatTzs(data.expiredStockValue)}`));
  y -= 18;
  for (const row of data.expiryRows) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Inventory Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Expiry & Inventory Loss (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, clip(row.name, 20)),
      text("F1", 9, MARGIN + 160, y, String(row.quantity)),
      text("F1", 8, MARGIN + 210, y, row.expiryDate),
      text("F1", 8, MARGIN + 300, y, row.status),
      text("F2", 9, MARGIN + 390, y, formatTzs(row.stockValue)),
    );
    y -= 15;
  }
  pages.push(page);
  return buildPdf(pages.map((ops, index) => [...ops, ...footer(index + 1, pages.length)].join("\n")));
}

function renderPurchasePdf(data: PurchaseReportData) {
  const generated = reportGeneratedDate();
  const pages: string[][] = [];
  let page: string[] = [
    ...header("Purchase Report"),
    ...metaBlock(data.periodLabel, data.periodDates, generated),
    ...kpiCard(MARGIN, PAGE_H - 180, "Total Purchases", formatTzs(data.totalPurchases), "0.933 0.961 0.996"),
    ...kpiCard(MARGIN + 132, PAGE_H - 180, "Purchases", String(data.purchaseCount), "0.957 0.945 0.996"),
    ...kpiCard(MARGIN + 264, PAGE_H - 180, "Amount Paid", formatTzs(data.amountPaid), "0.933 0.980 0.949"),
    ...kpiCard(MARGIN + 396, PAGE_H - 180, "Outstanding", formatTzs(data.outstanding), "1 0.973 0.918"),
    text("F2", 11, MARGIN, PAGE_H - 220, "Purchase Breakdown"),
  ];
  let y = PAGE_H - 240;
  for (const row of data.purchases) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Purchase Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Purchase Breakdown (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, row.number),
      text("F1", 9, MARGIN + 90, y, clip(row.supplier, 18)),
      text("F1", 8, MARGIN + 240, y, row.date),
      text("F2", 9, MARGIN + 330, y, formatTzs(row.amount)),
      text("F1", 8, MARGIN + 430, y, row.paymentStatus),
    );
    y -= 15;
  }
  y -= 12;
  if (y < 140) {
    pages.push(page);
    page = [...header("Purchase Report")];
    y = PAGE_H - 100;
  }
  page.push(text("F2", 11, MARGIN, y, "Supplier Summary"));
  y -= 18;
  for (const row of data.suppliers) {
    if (y < 90) {
      pages.push(page);
      page = [...header("Purchase Report"), text("F2", 11, MARGIN, PAGE_H - 96, "Supplier Summary (continued)")];
      y = PAGE_H - 120;
    }
    page.push(
      text("F1", 9, MARGIN, y, clip(row.name, 26)),
      text("F1", 8, MARGIN + 200, y, `Paid ${formatTzs(row.paid)}`),
      text("F2", 9, MARGIN + 360, y, `Due ${formatTzs(row.outstanding)}`),
    );
    y -= 15;
  }
  pages.push(page);
  return buildPdf(pages.map((ops, index) => [...ops, ...footer(index + 1, pages.length)].join("\n")));
}

function renderProfitLossPdf(data: ProfitLossReportData) {
  const generated = reportGeneratedDate();
  const page: string[] = [
    ...header("Profit & Loss"),
    ...metaBlock(data.periodLabel, data.periodDates, generated),
    text("F2", 11, MARGIN, PAGE_H - 140, "Profit & Loss Summary"),
    text("F1", 10, MARGIN, PAGE_H - 164, "Revenue"),
    text("F2", 10, MARGIN + 280, PAGE_H - 164, formatTzs(data.revenue)),
    text("F1", 10, MARGIN, PAGE_H - 182, "Cost of Goods Sold"),
    text("F1", 10, MARGIN + 280, PAGE_H - 182, `- ${formatTzs(data.costOfGoodsSold)}`),
    text("F2", 10, MARGIN, PAGE_H - 204, "Gross Profit"),
    text("F2", 10, MARGIN + 280, PAGE_H - 204, formatTzs(data.grossProfit)),
    text("F1", 10, MARGIN, PAGE_H - 222, "Operating Expenses"),
    text("F1", 10, MARGIN + 280, PAGE_H - 222, `- ${formatTzs(data.operatingExpenses)}`),
    text("F1", 10, MARGIN, PAGE_H - 240, "Loss from Expired/Damaged Stock"),
    text("F1", 10, MARGIN + 280, PAGE_H - 240, `- ${formatTzs(data.inventoryLoss)}`),
    text("F2", 11, MARGIN, PAGE_H - 266, "Net Profit"),
    text("F2", 11, MARGIN + 280, PAGE_H - 266, formatTzs(data.netProfit)),
    text("F1", 9, MARGIN, PAGE_H - 296, `Gross Margin: ${data.grossMargin}%`),
    text("F1", 9, MARGIN + 180, PAGE_H - 296, `Net Margin: ${data.netMargin}%`),
    text("F2", 11, MARGIN, PAGE_H - 328, "Operating Expenses"),
  ];
  let y = PAGE_H - 348;
  for (const row of data.expenses) {
    page.push(
      text("F1", 9, MARGIN, y, clip(row.category, 18)),
      text("F1", 8, MARGIN + 140, y, clip(row.description, 28)),
      text("F2", 9, MARGIN + 360, y, formatTzs(row.amount)),
    );
    y -= 15;
  }
  return buildPdf([[...page, ...footer(1, 1)].join("\n")]);
}

export function downloadSalesCenterReportPdf(
  preset: SalesPeriodPreset,
  range: SalesDateRange,
  filters: SalesReportFilters = {},
) {
  downloadBytes(renderSalesPdf(buildSalesReportData(preset, range, filters)), "RM-Supermarket-Sales-Report.pdf");
}

export function downloadInventoryCenterReportPdf(preset: SalesPeriodPreset, range: SalesDateRange) {
  downloadBytes(renderInventoryPdf(buildInventoryReportData(preset, range)), "RM-Supermarket-Inventory-Report.pdf");
}

export function downloadPurchaseCenterReportPdf(preset: SalesPeriodPreset, range: SalesDateRange) {
  downloadBytes(renderPurchasePdf(buildPurchaseReportData(preset, range)), "RM-Supermarket-Purchase-Report.pdf");
}

export function downloadProfitLossCenterReportPdf(preset: SalesPeriodPreset, range: SalesDateRange) {
  downloadBytes(renderProfitLossPdf(buildProfitLossReportData(preset, range)), "RM-Supermarket-Profit-Loss-Report.pdf");
}

export function downloadReportPdf(kind: "sales" | "inventory" | "purchases" | "profit-loss", preset: SalesPeriodPreset, range: SalesDateRange) {
  if (kind === "sales") return downloadSalesCenterReportPdf(preset, range);
  if (kind === "inventory") return downloadInventoryCenterReportPdf(preset, range);
  if (kind === "purchases") return downloadPurchaseCenterReportPdf(preset, range);
  return downloadProfitLossCenterReportPdf(preset, range);
}
