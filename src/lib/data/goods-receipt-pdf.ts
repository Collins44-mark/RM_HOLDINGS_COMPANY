import { APP_NAME } from "@/lib/config/app";
import { downloadPdfBytes, formatPdfNumber, pdfAscii } from "@/lib/pdf/report-document";
import { CorporateReportDocument } from "@/lib/pdf/corporate-report-document";

export type GoodsReceiptPdfPayload = {
  number: string;
  poNumber: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  status: string;
  itemCount: number;
  total: number;
  lines: {
    name: string;
    sku: string;
    orderedQty: number;
    receivedQty: number;
    unitCost: number;
    lineTotal: number;
  }[];
};

function money(value: number) {
  return `TZS ${formatPdfNumber(value)}`;
}

export function downloadGoodsReceiptDocument(document: GoodsReceiptPdfPayload) {
  const doc = new CorporateReportDocument({
    businessUnit: "Supermarket",
    title: "Goods Receipt",
    subtitle: `${APP_NAME} · warehouse receipt`,
    periodLabel: document.number,
    periodDates: document.receivedDate,
    generatedAt: new Date().toISOString(),
  });

  doc.addSectionTable(
    "Receipt",
    [
      { key: "label", label: "Field", width: 220 },
      { key: "value", label: "Value", width: 291 },
    ],
    [
      { label: "Company", value: pdfAscii(APP_NAME) },
      { label: "Business unit", value: "Supermarket" },
      { label: "GRN number", value: pdfAscii(document.number) },
      { label: "Purchase order", value: pdfAscii(document.poNumber || "-") },
      { label: "Supplier", value: pdfAscii(document.supplierName) },
      { label: "Received date", value: pdfAscii(document.receivedDate || "-") },
      { label: "Received by", value: pdfAscii(document.receivedBy || "-") },
      { label: "Status", value: pdfAscii(document.status) },
    ],
  );

  doc.addSectionTable(
    "Items",
    [
      { key: "name", label: "Product", width: 150 },
      { key: "orderedQty", label: "Ordered", width: 58, align: "right" },
      { key: "receivedQty", label: "Received", width: 62, align: "right" },
      { key: "unitCost", label: "Unit cost", width: 105, align: "right" },
      { key: "lineTotal", label: "Line total", width: 136, align: "right" },
    ],
    document.lines.map((line) => ({
      name: pdfAscii(line.name),
      orderedQty: String(line.orderedQty),
      receivedQty: String(line.receivedQty),
      unitCost: money(line.unitCost),
      lineTotal: money(line.lineTotal),
    })),
    {
      totalRow: {
        name: "Total received value",
        orderedQty: "",
        receivedQty: String(document.itemCount),
        unitCost: "",
        lineTotal: money(document.total),
      },
    },
  );

  const filename = `RM-Supermarket-Goods-Receipt-${pdfAscii(document.number).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  downloadPdfBytes(doc.build(), filename);
}
