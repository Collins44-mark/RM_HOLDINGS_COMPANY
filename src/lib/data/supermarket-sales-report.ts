import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import { salesKpis, type SupermarketSale } from "@/lib/data/sample-supermarket-sales";

export type SalesReportInput = {
  sales: SupermarketSale[];
  periodLabel: string;
  periodDates: string;
  cashierLabel: string;
  paymentLabel: string;
  statusLabel: string;
};

export function renderSalesReportPdf(input: SalesReportInput) {
  const kpis = salesKpis(input.sales);
  const doc = new FormalReportDocument({
    brandName: APP_NAME,
    businessUnit: "Supermarket System",
    title: "Sales Report",
    subtitle: `Cashier: ${input.cashierLabel}  |  Payment: ${input.paymentLabel}  |  Status: ${input.statusLabel}`,
    periodLabel: input.periodLabel,
    periodDates: input.periodDates,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: APP_NAME,
  });
  doc.addMetrics([
    { label: "Total Sales", value: formatTzs(kpis.totalSales) },
    { label: "Transactions", value: String(kpis.totalTransactions) },
    { label: "Items Sold", value: String(kpis.itemsSold) },
    { label: "Average Sale", value: formatTzs(kpis.averageSale) },
  ]);
  doc.addSectionTable(
    "Sales Transactions",
    [
      { key: "id", label: "Invoice #", width: 70 },
      { key: "when", label: "Date & Time", width: 110 },
      { key: "customer", label: "Customer", width: 110 },
      { key: "items", label: "Items", width: 40, align: "right" },
      { key: "payment", label: "Payment", width: 80 },
      { key: "amount", label: "Amount", width: 70, align: "right" },
      { key: "status", label: "Status", width: 61 },
    ],
    input.sales.map((sale) => ({
      id: sale.id,
      when: `${sale.dateLabel} ${sale.timeLabel}`,
      customer: sale.customer,
      items: String(sale.itemsCount),
      payment: sale.payment,
      amount: formatTzs(sale.amount),
      status: sale.status,
    })),
  );
  return doc.build();
}

export function downloadSalesReportPdf(input: SalesReportInput) {
  downloadPdfBytes(renderSalesReportPdf(input), "RM-Holdings-Sales-Report.pdf");
}
