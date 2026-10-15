import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import type { RiceReportsWorkspace } from "@/actions/rice/workspace";
import { createTranslator, type Locale } from "@/lib/i18n";

function kg(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale === "sw" ? "sw-TZ" : "en-TZ", { maximumFractionDigits: 2 }).format(value)} kg`;
}

export function downloadRiceReportsPdf(workspace: RiceReportsWorkspace, locale: Locale = "en") {
  const t = createTranslator(locale);
  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: APP_NAME,
    businessUnit: t("rice.unit"),
    title: t("rice.pdf.title"),
    subtitle: t("rice.pdf.subtitle"),
    periodLabel: workspace.periodLabel,
    periodDates: workspace.periodLabel,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: t("rice.unit"),
  });
  doc.addMetrics([
    { label: t("rice.purchases.title"), value: formatTzs(workspace.summary.purchasesTotal) },
    { label: t("rice.finance.sales"), value: formatTzs(workspace.summary.salesTotal) },
    { label: t("rice.finance.service"), value: formatTzs(workspace.summary.serviceIncome) },
    { label: t("rice.finance.cogs"), value: formatTzs(workspace.summary.cogs) },
    { label: t("rice.finance.loss"), value: formatTzs(workspace.summary.productionLoss) },
    { label: t("rice.finance.expenses"), value: formatTzs(workspace.summary.expenses) },
    { label: t("rice.finance.inventory"), value: formatTzs(workspace.summary.inventoryValue) },
    { label: t("rice.finance.net"), value: formatTzs(workspace.summary.netProfit) },
  ]);
  doc.addSectionTable(
    t("rice.pdf.purchases"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "number", label: t("rice.purchases.no"), width: 80 },
      { key: "party", label: t("rice.purchases.supplier"), width: 140 },
      { key: "qty", label: t("rice.purchases.qty"), width: 80 },
      { key: "total", label: t("common.total"), width: 90 },
      { key: "paid", label: t("common.paid"), width: 90 },
      { key: "balance", label: t("rice.pdf.payable"), width: 90 },
    ],
    workspace.purchases.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      party: row.partyName,
      qty: kg(row.qtyKg, locale),
      total: formatTzs(row.total),
      paid: formatTzs(row.paid),
      balance: formatTzs(row.balance),
    })),
    { emptyMessage: t("rice.purchases.empty") },
  );
  doc.addSectionTable(
    t("rice.pdf.production"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "number", label: t("rice.milling.batch"), width: 80 },
      { key: "input", label: t("rice.pdf.paddyIn"), width: 90 },
      { key: "output", label: t("rice.milling.outputs"), width: 260 },
      { key: "waste", label: t("rice.milling.wastage"), width: 80 },
      { key: "cost", label: t("rice.milling.cost"), width: 90 },
    ],
    workspace.batches.map((row) => ({
      date: row.producedOn,
      number: row.number,
      input: kg(row.inputQtyKg, locale),
      output: row.outputs.map((item) => `${item.itemName} ${kg(item.qtyKg, locale)}`).join("; ") || "—",
      waste: kg(row.wastageKg, locale),
      cost: formatTzs(row.processingCost),
    })),
    { emptyMessage: t("rice.milling.empty") },
  );
  doc.addSectionTable(
    t("rice.pdf.inventory"),
    [
      { key: "name", label: t("common.item"), width: 180 },
      { key: "kind", label: t("rice.settings.kind"), width: 100 },
      { key: "qty", label: t("common.quantity"), width: 100 },
      { key: "value", label: t("common.value"), width: 120 },
    ],
    workspace.items.map((row) => ({ name: row.name, kind: row.kind, qty: kg(row.qtyKg, locale), value: formatTzs(row.valueTzs) })),
    { emptyMessage: t("rice.pdf.inventoryEmpty") },
  );
  doc.addSectionTable(
    t("rice.reports.storage"),
    [
      { key: "account", label: t("rice.storage.account"), width: 100 },
      { key: "party", label: t("rice.storage.customer"), width: 200 },
      { key: "qty", label: t("rice.storage.balance"), width: 120 },
    ],
    workspace.accounts.map((row) => ({ account: row.accountNumber, party: row.partyName, qty: kg(row.qtyKg, locale) })),
    { emptyMessage: t("rice.storage.balancesEmpty") },
  );
  doc.addSectionTable(
    t("rice.finance.sales"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "number", label: t("rice.purchases.no"), width: 80 },
      { key: "party", label: t("rice.sales.buyer"), width: 160 },
      { key: "total", label: t("common.total"), width: 90 },
      { key: "paid", label: t("common.paid"), width: 90 },
      { key: "balance", label: t("rice.pdf.receivable"), width: 100 },
    ],
    workspace.sales.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      party: row.partyName,
      total: formatTzs(row.total),
      paid: formatTzs(row.paid),
      balance: formatTzs(row.balance),
    })),
    { emptyMessage: t("rice.sales.empty") },
  );
  doc.addSectionTable(
    t("rice.finance.service"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "number", label: t("rice.purchases.no"), width: 90 },
      { key: "kind", label: t("common.type"), width: 100 },
      { key: "party", label: t("rice.storage.customer"), width: 180 },
      { key: "amount", label: t("common.amount"), width: 100 },
    ],
    workspace.services.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      kind: row.kind,
      party: row.partyName ?? "—",
      amount: formatTzs(row.amount),
    })),
    { emptyMessage: t("rice.storage.serviceEmpty") },
  );
  doc.addSectionTable(
    t("rice.finance.expenses"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "number", label: t("rice.purchases.no"), width: 90 },
      { key: "kind", label: t("common.type"), width: 120 },
      { key: "amount", label: t("common.amount"), width: 100 },
      { key: "notes", label: t("common.notes"), width: 250 },
    ],
    workspace.expenses.map((row) => ({
      date: row.occurredOn,
      number: row.number,
      kind: row.kind,
      amount: formatTzs(row.amount),
      notes: row.notes ?? "—",
    })),
    { emptyMessage: t("rice.finance.empty") },
  );
  downloadPdfBytes(doc.build(), `rice-mill-report-${workspace.periodLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
