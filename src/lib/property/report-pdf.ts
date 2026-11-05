import { CONTENT_W, ReportDocument, type TableColumn } from "@/lib/pdf/report-document";
import type { ReportPayload } from "@/lib/property/report-types";

function columnsFor(report: ReportPayload): TableColumn[] {
  const weights = report.columns.map((column) => {
    const samples = report.rows.slice(0, 40).map((row) => String(row[column.key] || "").length);
    const longest = Math.max(column.label.length, ...samples, 4);
    return column.align === "right" ? Math.min(Math.max(longest, 8), 16) : Math.min(Math.max(longest, 10), 42);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const columns = report.columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    width: CONTENT_W * (weights[index] / total),
    align: column.align,
  }));
  const used = columns.reduce((sum, column) => sum + column.width, 0);
  columns[columns.length - 1].width += CONTENT_W - used;
  return columns;
}

export function buildPropertyReportPdf(report: ReportPayload) {
  const document = new ReportDocument({
    businessUnit: "Properties & Rentals",
    title: report.title,
    subtitle: report.module,
    periodLabel: report.period,
    periodDates: report.period,
    generatedAt: report.generatedAt,
    preparedBy: report.preparedBy || "RM Holdings",
    preparedRole: "Properties & Rentals",
    filtersNote: report.filters,
  });
  document.addSectionTitle("Summary");
  document.addSimpleTable(
    [
      { key: "label", label: "Item", width: CONTENT_W * 0.62 },
      { key: "value", label: "Value", width: CONTENT_W * 0.38, align: "right" },
    ],
    report.summary,
    { sectionTitle: "Summary" },
  );
  const columns = columnsFor(report);
  document.addSectionTitle("Records");
  document.addSimpleTable(
    columns,
    report.rows,
    { sectionTitle: "Records" },
  );
  if (report.rows.length === 0) document.addReportNote("No records match this report.");
  return document.build();
}
