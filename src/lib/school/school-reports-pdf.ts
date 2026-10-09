"use client";

import { recordReportExportAction } from "@/actions/report-audit";
import {
  downloadPdfBytes,
  formatPdfGeneratedAt,
  ReportDocument,
  type TableColumn,
} from "@/lib/pdf/report-document";
import type { SchoolReportKind, SchoolReportWorkspace } from "@/lib/school/report-types";
import { SCHOOL_REPORT_DEFS } from "@/lib/school/report-types";

function filename(kind: SchoolReportKind, schoolName: string) {
  const safe = schoolName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "School";
  return `RM-${safe}-${kind}-report.pdf`;
}

export async function exportSchoolReportPdf(workspace: SchoolReportWorkspace) {
  const def = SCHOOL_REPORT_DEFS.find((item) => item.id === workspace.kind);
  const columns: TableColumn[] = workspace.columns.map((col) => ({
    key: col.key,
    label: col.label,
    width: Math.max(36, Math.floor(511 / Math.max(workspace.columns.length, 1))),
    align: col.align ?? "left",
  }));
  const used = columns.reduce((sum, col) => sum + col.width, 0);
  if (columns.length && used !== 511) columns[columns.length - 1].width += 511 - used;

  const doc = new ReportDocument({
    businessUnit: workspace.schoolName,
    title: def?.label ?? "School Report",
    subtitle: def?.description ?? "School report",
    periodLabel: workspace.periodLabel,
    periodDates: `${workspace.from} to ${workspace.to}`,
    generatedAt: formatPdfGeneratedAt(),
    preparedBy: workspace.preparedBy,
    preparedRole: workspace.preparedRole,
    filtersNote: workspace.filtersNote,
  });

  if (workspace.cards.length) {
    doc.addSectionTitle("Summary");
    doc.addSimpleTable(
      [
        { key: "label", label: "Measure", width: 280 },
        { key: "value", label: "Value", width: 231, align: "right" },
      ],
      workspace.cards.map((card) => ({
        label: card.hint ? `${card.label} (${card.hint})` : card.label,
        value: card.value,
      })),
    );
  }

  doc.addSectionTitle("Records");
  if (workspace.rows.length) {
    doc.addSimpleTable(columns, workspace.rows, { sectionTitle: "Records" });
  } else {
    doc.addReportNote("No matching records for the selected filters.");
  }

  downloadPdfBytes(doc.build(), filename(workspace.kind, workspace.schoolName));
  const registryId = def?.registryId ?? workspace.kind;
  if (
    registryId === "school-finance" ||
    registryId === "school-admissions" ||
    registryId === "school-students" ||
    registryId === "school-parents" ||
    registryId === "school-transport"
  ) {
    await recordReportExportAction({ kind: registryId, period: workspace.periodLabel });
  }
}
