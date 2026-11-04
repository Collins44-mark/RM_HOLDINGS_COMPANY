import { CONTENT_W, ReportDocument, pdfTextWidth, type TableColumn } from "@/lib/pdf/report-document";
import type { ReportPayload } from "@/lib/property/report-types";

function columnsFor(report: ReportPayload): TableColumn[] {
  const weights = report.columns.map((column) => Math.max(pdfTextWidth(column.label, 8, true) + 12, column.align === "right" ? 58 : 70));
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

function clip(value: string, width: number) {
  const max = Math.max(4, Math.floor((width - 8) / 4.7));
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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
    report.rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, clip(row[column.key] || "—", column.width)]))),
    { sectionTitle: "Records" },
  );
  if (report.rows.length === 0) document.addReportNote("No records match this report.");
  return document.build();
}
