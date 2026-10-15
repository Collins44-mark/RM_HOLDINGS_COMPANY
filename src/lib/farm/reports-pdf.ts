import { APP_NAME } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import { downloadPdfBytes, formatPdfGeneratedAt } from "@/lib/pdf/report-document";
import { FormalReportDocument } from "@/lib/pdf/formal-layout";
import type { FarmReportsWorkspace } from "@/actions/farm/workspace";
import { createTranslator, type Locale } from "@/lib/i18n";

export function downloadFarmReportsPdf(workspace: FarmReportsWorkspace, locale: Locale = "en") {
  const t = createTranslator(locale);
  const doc = new FormalReportDocument({
    orientation: "landscape",
    brandName: APP_NAME,
    businessUnit: t("farm.unit"),
    title: t("farm.pdf.title"),
    subtitle: t("farm.pdf.subtitle"),
    periodLabel: workspace.periodLabel,
    periodDates: workspace.periodLabel,
    generatedAt: formatPdfGeneratedAt(),
    footerLeft: t("farm.unit"),
  });
  doc.addMetrics([
    { label: t("farm.kpi.income"), value: formatTzs(workspace.summary.serviceIncome) },
    { label: t("farm.finance.receivables"), value: formatTzs(workspace.summary.receivables) },
    { label: t("farm.kpi.spend"), value: formatTzs(workspace.summary.tractorExpense) },
    { label: t("rice.finance.expenses"), value: formatTzs(workspace.summary.expenses) },
    { label: t("rice.finance.net"), value: formatTzs(workspace.summary.netProfit) },
  ]);
  doc.addSectionTable(
    t("farm.job.list"),
    [
      { key: "date", label: t("common.date"), width: 80 },
      { key: "party", label: t("farm.job.customer"), width: 160 },
      { key: "service", label: t("farm.job.service"), width: 140 },
      { key: "total", label: t("common.total"), width: 90 },
      { key: "paid", label: t("common.paid"), width: 90 },
    ],
    workspace.jobs.map((row) => ({
      date: row.occurredOn,
      party: row.partyName,
      service: row.serviceName,
      total: formatTzs(row.agreedPrice),
      paid: formatTzs(row.amountPaid),
    })),
    { emptyMessage: t("farm.job.empty") },
  );
  downloadPdfBytes(doc.build(), `farm-tractor-report-${workspace.periodLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
