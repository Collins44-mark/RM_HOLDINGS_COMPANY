import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { formatSalesDate, salesKpis, type SupermarketSale } from "@/lib/data/sample-supermarket-sales";

export type SalesReportInput = {
  sales: SupermarketSale[];
  periodLabel: string;
  periodDates: string;
  cashierLabel: string;
  paymentLabel: string;
  statusLabel: string;
};

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

function buildPageHeader() {
  return [
    fillRect(0, PAGE_H - 72, PAGE_W, 72, "0.043 0.133 0.267"),
    "1 1 1 rg",
    text("F2", 11, MARGIN, PAGE_H - 28, APP_NAME.toUpperCase()),
    text("F1", 9, MARGIN, PAGE_H - 44, "SUPERmarket"),
    text("F2", 16, MARGIN, PAGE_H - 62, "Sales Report"),
    "0.043 0.133 0.267 rg",
  ];
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
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(xrefTable, trailer);

  return new TextEncoder().encode(chunks.join(""));
}

export function renderSalesReportPdf(input: SalesReportInput) {
  const kpis = salesKpis(input.sales);
  const generated = formatSalesDate(new Date().toISOString());
  const pages: string[] = [];
  const columns = [
    { key: "id", x: MARGIN, width: 62 },
    { key: "when", x: MARGIN + 62, width: 108 },
    { key: "customer", x: MARGIN + 170, width: 96 },
    { key: "items", x: MARGIN + 266, width: 36 },
    { key: "payment", x: MARGIN + 302, width: 78 },
    { key: "amount", x: MARGIN + 380, width: 78 },
    { key: "status", x: MARGIN + 458, width: 101 },
  ] as const;

  function tableHeader(y: number) {
    return [
      fillRect(MARGIN, y - 4, PAGE_W - MARGIN * 2, 18, "0.914 0.933 0.953"),
      "0.33 0.4 0.48 rg",
      text("F2", 7.5, columns[0].x + 4, y + 2, "INVOICE #"),
      text("F2", 7.5, columns[1].x + 4, y + 2, "DATE & TIME"),
      text("F2", 7.5, columns[2].x + 4, y + 2, "CUSTOMER"),
      text("F2", 7.5, columns[3].x + 4, y + 2, "ITEMS"),
      text("F2", 7.5, columns[4].x + 4, y + 2, "PAYMENT METHOD"),
      text("F2", 7.5, columns[5].x + 4, y + 2, "AMOUNT"),
      text("F2", 7.5, columns[6].x + 4, y + 2, "STATUS"),
      "0.043 0.133 0.267 rg",
    ];
  }

  function footer(pageNumber: number, pageCount: number) {
    return [
      "0.55 0.58 0.62 rg",
      line(MARGIN, 40, PAGE_W - MARGIN, 40, 0.4),
      text("F1", 8, MARGIN, 26, `${APP_NAME}`),
      text("F1", 8, MARGIN + 120, 26, ascii(APP_TAGLINE)),
      text("F1", 8, PAGE_W - MARGIN - 70, 26, `Page ${pageNumber} of ${pageCount}`),
      "0.043 0.133 0.267 rg",
    ];
  }

  const first: string[] = [
    ...buildPageHeader(),
    text("F2", 9, MARGIN, PAGE_H - 96, "Report Period"),
    text("F1", 10, MARGIN, PAGE_H - 110, `${input.periodLabel}${input.periodDates ? `  |  ${input.periodDates}` : ""}`),
    text("F2", 9, MARGIN + 280, PAGE_H - 96, "Generated Date"),
    text("F1", 10, MARGIN + 280, PAGE_H - 110, generated),
    text("F2", 9, MARGIN, PAGE_H - 132, "Cashier Filter"),
    text("F1", 10, MARGIN, PAGE_H - 146, input.cashierLabel),
    text("F2", 9, MARGIN + 186, PAGE_H - 132, "Payment Method Filter"),
    text("F1", 10, MARGIN + 186, PAGE_H - 146, input.paymentLabel),
    text("F2", 9, MARGIN + 372, PAGE_H - 132, "Status Filter"),
    text("F1", 10, MARGIN + 372, PAGE_H - 146, input.statusLabel),
    fillRect(MARGIN, PAGE_H - 214, 122, 48, "0.933 0.961 0.996"),
    fillRect(MARGIN + 132, PAGE_H - 214, 122, 48, "0.957 0.945 0.996"),
    fillRect(MARGIN + 264, PAGE_H - 214, 122, 48, "0.933 0.980 0.949"),
    fillRect(MARGIN + 396, PAGE_H - 214, 122, 48, "1 0.973 0.918"),
    text("F1", 8, MARGIN + 10, PAGE_H - 180, "Total Sales"),
    text("F2", 11, MARGIN + 10, PAGE_H - 198, formatTzs(kpis.totalSales)),
    text("F1", 8, MARGIN + 142, PAGE_H - 180, "Total Transactions"),
    text("F2", 11, MARGIN + 142, PAGE_H - 198, kpis.totalTransactions.toLocaleString("en-US")),
    text("F1", 8, MARGIN + 274, PAGE_H - 180, "Items Sold"),
    text("F2", 11, MARGIN + 274, PAGE_H - 198, kpis.itemsSold.toLocaleString("en-US")),
    text("F1", 8, MARGIN + 406, PAGE_H - 180, "Average Sale"),
    text("F2", 11, MARGIN + 406, PAGE_H - 198, formatTzs(kpis.averageSale)),
    text("F2", 11, MARGIN, PAGE_H - 240, "Sales Transactions"),
    ...tableHeader(PAGE_H - 258),
  ];

  const rows = input.sales.map((sale) => ({
    id: sale.id,
    when: `${sale.dateLabel} ${sale.timeLabel}`,
    customer: sale.customer,
    items: String(sale.itemsCount),
    payment: sale.payment,
    amount: formatTzs(sale.amount),
    status: sale.status,
  }));

  const bodyPages: string[][] = [first];
  let y = PAGE_H - 278;
  let pageIndex = 0;

  function ensureRowSpace() {
    if (y >= 68) return;
    pageIndex += 1;
    bodyPages[pageIndex] = [
      ...buildPageHeader(),
      text("F2", 11, MARGIN, PAGE_H - 96, "Sales Transactions"),
      ...tableHeader(PAGE_H - 114),
    ];
    y = PAGE_H - 134;
  }

  if (rows.length === 0) {
    first.push(text("F1", 10, MARGIN, y, "No sales match the selected filters."));
  } else {
    rows.forEach((row, index) => {
      ensureRowSpace();
      const ops = bodyPages[pageIndex];
      if (index % 2 === 1) {
        ops.push(fillRect(MARGIN, y - 3, PAGE_W - MARGIN * 2, 16, "0.973 0.976 0.984"));
      }
      ops.push(
        text("F1", 8, columns[0].x + 4, y + 2, clip(row.id, 12)),
        text("F1", 8, columns[1].x + 4, y + 2, clip(row.when, 22)),
        text("F1", 8, columns[2].x + 4, y + 2, clip(row.customer, 18)),
        text("F1", 8, columns[3].x + 4, y + 2, row.items),
        text("F1", 8, columns[4].x + 4, y + 2, clip(row.payment, 16)),
        text("F1", 8, columns[5].x + 4, y + 2, clip(row.amount, 16)),
        text("F1", 8, columns[6].x + 4, y + 2, row.status),
      );
      y -= 16;
    });
  }

  ensureRowSpace();
  if (y < 110) {
    pageIndex += 1;
    bodyPages[pageIndex] = [...buildPageHeader()];
    y = PAGE_H - 108;
  }
  const totals = bodyPages[pageIndex];
  totals.push(
    line(MARGIN, y + 10, PAGE_W - MARGIN, y + 10, 0.5),
    text("F2", 9, MARGIN, y - 6, "Total Sales"),
    text("F1", 9, MARGIN + 120, y - 6, formatTzs(kpis.totalSales)),
    text("F2", 9, MARGIN, y - 22, "Total Transactions"),
    text("F1", 9, MARGIN + 120, y - 22, kpis.totalTransactions.toLocaleString("en-US")),
    text("F2", 9, MARGIN, y - 38, "Items Sold"),
    text("F1", 9, MARGIN + 120, y - 38, kpis.itemsSold.toLocaleString("en-US")),
  );

  const count = bodyPages.length;
  const streams = bodyPages.map((ops, index) => [...ops, ...footer(index + 1, count)].join("\n"));
  return buildPdf(streams);
}

export function downloadSalesReportPdf(input: SalesReportInput) {
  const bytes = renderSalesReportPdf(input);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `RM-Holdings-Sales-Report.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
