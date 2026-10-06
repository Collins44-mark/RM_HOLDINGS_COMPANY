import { APP_NAME } from "@/lib/config/app";
import { downloadPdfBytes, formatPdfNumber, pdfAscii } from "@/lib/pdf/report-document";
import { CorporateReportDocument } from "@/lib/pdf/corporate-report-document";

export type PurchaseDocumentPdfPayload = {
  number: string;
  poNumber: string;
  supplierName: string;
  orderDate: string;
  receivedDate: string;
  status: string;
  discount: number;
  tax: number;
  subtotal: number;
  grandTotal: number;
  paymentStatus: string;
  receipts: string[];
  lines: { name: string; quantity: number; buyingPrice: number; lineTotal: number }[];
};

function money(value: number) {
  return `TZS ${formatPdfNumber(value)}`;
}

function paymentLabel(status: string) {
  const code = status.toUpperCase();
  if (code === "PAID") return "Paid";
  if (code === "PARTIAL") return "Partially Paid";
  return "Unpaid";
}

function poStatusLabel(status: string) {
  const code = status.toUpperCase();
  if (code === "PARTIALLY_RECEIVED") return "Partially Received";
  if (code === "RECEIVED") return "Received";
  return status;
}

export function downloadPurchaseDocument(document: PurchaseDocumentPdfPayload) {
  const doc = new CorporateReportDocument({
    businessUnit: "Supermarket",
    title: "Purchase Invoice / Receipt",
    subtitle: `${APP_NAME} · system purchase document`,
    periodLabel: document.number,
    periodDates: document.receivedDate || document.orderDate,
    generatedAt: new Date().toISOString(),
  });

  doc.addSectionTable(
    "Document",
    [
      { key: "label", label: "Field", width: 220 },
      { key: "value", label: "Value", width: 291 },
    ],
    [
      { label: "Company", value: pdfAscii(APP_NAME) },
      { label: "Business unit", value: "Supermarket" },
      { label: "Document number", value: pdfAscii(document.number) },
      { label: "Purchase order", value: pdfAscii(document.poNumber || "-") },
      { label: "Supplier", value: pdfAscii(document.supplierName) },
      { label: "Order date", value: pdfAscii(document.orderDate || "-") },
      { label: "Received date", value: pdfAscii(document.receivedDate || "-") },
      { label: "Status", value: pdfAscii(poStatusLabel(document.status)) },
      { label: "Payment status", value: paymentLabel(document.paymentStatus) },
      { label: "Goods receipts", value: pdfAscii(document.receipts.join(", ") || "-") },
    ],
  );

  doc.addSectionTable(
    "Items",
    [
      { key: "name", label: "Product", width: 190 },
      { key: "quantity", label: "Qty", width: 55, align: "right" },
      { key: "buyingPrice", label: "Buying price", width: 120, align: "right" },
      { key: "lineTotal", label: "Line total", width: 146, align: "right" },
    ],
    document.lines.map((line) => ({
      name: pdfAscii(line.name),
      quantity: String(line.quantity),
      buyingPrice: money(line.buyingPrice),
      lineTotal: money(line.lineTotal),
    })),
    {
      totalRow: {
        name: "Totals",
        quantity: "",
        buyingPrice: `Tax ${money(document.tax)}`,
        lineTotal: money(document.grandTotal),
      },
    },
  );

  doc.addSectionTable(
    "Summary",
    [
      { key: "label", label: "Field", width: 220 },
      { key: "value", label: "Value", width: 291 },
    ],
    [
      { label: "Subtotal", value: money(document.subtotal) },
      { label: "Discount", value: money(document.discount) },
      { label: "Tax", value: money(document.tax) },
      { label: "Grand total", value: money(document.grandTotal) },
      { label: "Payment status", value: paymentLabel(document.paymentStatus) },
    ],
  );

  const filename = `RM-Supermarket-Purchase-${pdfAscii(document.number).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  downloadPdfBytes(doc.build(), filename);
}
