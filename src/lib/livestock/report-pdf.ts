import { CONTENT_W, ReportDocument, type TableColumn } from "@/lib/pdf/report-document";
import type { LivestockReport } from "@/lib/livestock/reports";

export function buildLivestockReportPdf(report: LivestockReport, periodLabel: string, generatedAt: string) {
  const width = CONTENT_W / Math.max(1, report.columns.length);
  const columns: TableColumn[] = report.columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    width: index === report.columns.length - 1 ? CONTENT_W - width * (report.columns.length - 1) : width,
  }));
  const document = new ReportDocument({
    businessUnit: "Livestock Farm",
    title: report.title,
    subtitle: "RM Holdings Ltd",
    periodLabel,
    periodDates: periodLabel,
    generatedAt,
  });
  document.addSectionTitle("Summary");
  document.addSimpleTable(
    [{ key: "label", label: "Item", width: CONTENT_W * 0.62 }, { key: "value", label: "Value", width: CONTENT_W * 0.38, align: "right" }],
    report.totals.map((total) => ({ label: total.label, value: total.value })),
  );
  document.addSectionTitle("Records");
  document.addSimpleTable(columns, report.rows);
  return document.build();
}
