"use client";

import { recordReportExportAction } from "@/actions/report-audit";
import { downloadPdfBytes } from "@/lib/pdf/report-document";
import { buildSchoolReportPdf } from "@/lib/school/school-report-document";
import type { SchoolReportKind, SchoolReportWorkspace } from "@/lib/school/report-types";
import { SCHOOL_REPORT_DEFS } from "@/lib/school/report-types";

function filename(kind: SchoolReportKind, schoolName: string) {
  const safe = schoolName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "School";
  return `RM-${safe}-${kind}-report.pdf`;
}

export async function exportSchoolReportPdf(workspace: SchoolReportWorkspace) {
  const def = SCHOOL_REPORT_DEFS.find((item) => item.id === workspace.kind);
  downloadPdfBytes(buildSchoolReportPdf(workspace), filename(workspace.kind, workspace.schoolName));
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
