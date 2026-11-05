import { Suspense } from "react";
import {
  GroupFinancialReport,
  GroupOverviewReport,
  GroupPerformanceReport,
} from "@/components/reports/group/GroupReportPanels";
import { EmbeddedSupermarketReport } from "@/components/reports/EmbeddedSupermarketReport";
import { EmbeddedSchoolReport } from "@/components/reports/EmbeddedSchoolReport";
import { EmbeddedBeekeepingReport } from "@/components/reports/EmbeddedBeekeepingReport";
import { EmbeddedLivestockReport } from "@/components/reports/EmbeddedLivestockReport";
import { EmbeddedFarmReport } from "@/components/reports/EmbeddedFarmReport";
import { EmbeddedPropertyReport } from "@/components/reports/EmbeddedPropertyReport";
import { EmbeddedRiceReport } from "@/components/reports/EmbeddedRiceReport";
import { ReportEmptyState } from "@/components/reports/report-ui";
import { ReportMountFallback } from "@/components/supermarket/report-shell";
import type { ConsolidatedReport } from "@/lib/data/reports";
import type { ReportPeriod } from "@/lib/data/report-period";
import {
  getReportDefinition,
  moduleLabel,
  reportsForModule,
  type ReportModuleId,
} from "@/lib/reports/registry";

type Props = {
  moduleId: ReportModuleId;
  reportId: string | null;
  period: ReportPeriod;
  from?: string;
  to?: string;
  showResult: boolean;
  consolidated: ConsolidatedReport | null;
};

export function ReportResultRouter({
  moduleId,
  reportId,
  period,
  from,
  to,
  showResult,
  consolidated,
}: Props) {
  const available = reportsForModule(moduleId);

  if (available.length === 0) {
    return (
      <ReportEmptyState
        title="Reports are not available yet"
        description="This business module does not have live operational data connected yet."
      />
    );
  }

  if (!showResult || !reportId) {
    return (
      <ReportEmptyState
        title="Select a report to view"
        description="Choose a business module, report and period, then click View Report."
      />
    );
  }

  const definition = getReportDefinition(reportId);
  if (!definition || definition.module !== moduleId) {
    return (
      <ReportEmptyState
        title="Report not available"
        description={`No implemented report matches this selection for ${moduleLabel(moduleId)}.`}
      />
    );
  }

  if (moduleId === "group") {
    if (!consolidated) {
      return (
        <ReportEmptyState
          title="Report could not be loaded"
          description="Consolidated group data is temporarily unavailable."
        />
      );
    }

    if (reportId === "group-overview") return <GroupOverviewReport report={consolidated} />;
    if (reportId === "group-financial") return <GroupFinancialReport report={consolidated} />;
    if (reportId === "group-performance") return <GroupPerformanceReport report={consolidated} />;
  }

  if (moduleId === "supermarket") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedSupermarketReport
          reportId={reportId}
          period={period}
          from={from}
          to={to}
        />
      </Suspense>
    );
  }

  if (moduleId === "livestock") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedLivestockReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  if (moduleId === "beekeeping") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedBeekeepingReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  if (moduleId === "property") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedPropertyReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  if (moduleId === "rice") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedRiceReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  if (moduleId === "farm") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedFarmReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  if (moduleId === "school") {
    return (
      <Suspense fallback={<ReportMountFallback />}>
        <EmbeddedSchoolReport reportId={reportId} period={period} from={from} to={to} />
      </Suspense>
    );
  }

  return (
    <ReportEmptyState
      title="Report not available"
      description="This report is not implemented for the selected business module."
    />
  );
}
