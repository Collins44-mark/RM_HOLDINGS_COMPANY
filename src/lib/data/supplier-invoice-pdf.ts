import { APP_NAME } from "@/lib/config/app";
import { downloadPdfBytes, formatPdfNumber, pdfAscii } from "@/lib/pdf/report-document";
import { CorporateReportDocument } from "@/lib/pdf/corporate-report-document";

export type SupplierInvoicePdfPayload = {
  number: string;
  supplierName: string;
  poNumber: string;
  receiptNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  verificationStatus: string;
  notes: string;
  lines: { name: string; quantity: number; unitCost: number; lineTotal: number }[];
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

export function downloadSupplierInvoiceDocument(invoice: SupplierInvoicePdfPayload) {
  const doc = new CorporateReportDocument({
    businessUnit: "Supermarket",
    title: "Supplier Invoice",
    subtitle: `${APP_NAME} · live purchase invoice record`,
    periodLabel: invoice.number,
    periodDates: invoice.invoiceDate,
    generatedAt: new Date().toISOString(),
  });

  doc.addSectionTable(
    "Invoice",
    [
      { key: "label", label: "Field", width: 220 },
      { key: "value", label: "Value", width: 291 },
    ],
    [
      { label: "Supplier", value: pdfAscii(invoice.supplierName) },
      { label: "Invoice number", value: pdfAscii(invoice.number) },
      { label: "Purchase / PO number", value: pdfAscii(invoice.poNumber || "-") },
      { label: "Goods receipt", value: pdfAscii(invoice.receiptNumber || "-") },
      { label: "Date", value: pdfAscii(invoice.invoiceDate) },
      { label: "Due date", value: pdfAscii(invoice.dueDate || "-") },
      { label: "Verification", value: pdfAscii(invoice.verificationStatus) },
      { label: "Payment status", value: paymentLabel(invoice.paymentStatus) },
    ],
  );

  doc.addSectionTable(
    "Items",
    [
      { key: "name", label: "Item", width: 190 },
      { key: "quantity", label: "Qty", width: 55, align: "right" },
      { key: "unitCost", label: "Unit cost", width: 120, align: "right" },
      { key: "lineTotal", label: "Subtotal", width: 146, align: "right" },
    ],
    invoice.lines.map((line) => ({
      name: pdfAscii(line.name),
      quantity: String(line.quantity),
      unitCost: money(line.unitCost),
      lineTotal: money(line.lineTotal),
    })),
    {
      totalRow: {
        name: "Totals",
        quantity: "",
        unitCost: `Tax ${money(invoice.tax)}`,
        lineTotal: money(invoice.total),
      },
    },
  );

  const outstanding = Math.max(0, invoice.total - invoice.amountPaid);
  doc.addSectionTable(
    "Payment",
    [
      { key: "label", label: "Field", width: 220 },
      { key: "value", label: "Value", width: 291 },
    ],
    [
      { label: "Subtotal", value: money(invoice.subtotal) },
      { label: "Tax", value: money(invoice.tax) },
      { label: "Total", value: money(invoice.total) },
      { label: "Paid", value: money(invoice.amountPaid) },
      { label: "Outstanding", value: money(outstanding) },
      { label: "Payment status", value: paymentLabel(invoice.paymentStatus) },
    ],
  );

  const filename = `RM-Supermarket-Supplier-Invoice-${pdfAscii(invoice.number).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  downloadPdfBytes(doc.build(), filename);
}
