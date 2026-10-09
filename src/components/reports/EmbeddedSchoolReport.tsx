"use client";

import { SchoolReportsPage } from "@/components/school/SchoolReportsPage";
import type { ReportPeriod } from "@/lib/data/report-period";
import { schoolReportKindFromRegistryId } from "@/lib/school/report-types";

export function EmbeddedSchoolReport({
  reportId,
  period,
  from,
  to,
}: {
  reportId: string;
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const kind = schoolReportKindFromRegistryId(reportId);
  if (!kind) return null;
  return (
    <SchoolReportsPage
      initial={null}
      pending
      embedded
      controlledKind={kind}
      controlledPeriod={period}
      controlledFrom={from}
      controlledTo={to}
    />
  );
}
