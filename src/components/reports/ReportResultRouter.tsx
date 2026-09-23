import { Suspense } from "react";
import {
  GroupFinancialReport,
  GroupOverviewReport,
  GroupPerformanceReport,
} from "@/components/reports/group/GroupReportPanels";
import { ReportEmptyState, ReportSurface } from "@/components/reports/report-ui";
import { SalesReportDetail } from "@/components/supermarket/SalesReportDetail";
import { PurchaseReportDetail } from "@/components/supermarket/PurchaseReportDetail";
import { InventoryReportDetail } from "@/components/supermarket/InventoryReportDetail";
import { ProfitLossReportDetail } from "@/components/supermarket/ProfitLossReportDetail";
import type { ConsolidatedReport } from "@/lib/data/reports";
import type { ReportPeriod } from "@/lib/data/report-period";
import { reportPeriodToSalesInput } from "@/lib/reports/period-bridge";
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

function ReportLoading() {
  return (
    <ReportSurface className="px-6 py-14 text-center text-[13.5px] text-slate-500">
      Loading report…
    </ReportSurface>
  );
}

function EmbeddedSupermarketReport({
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
  const controlledPeriod = reportPeriodToSalesInput(period, { from, to });
  const controlled = {
    preset: controlledPeriod.preset,
    range: controlledPeriod.range,
  };

  if (reportId === "sm-sales") {
    return <SalesReportDetail embedded controlledPeriod={controlled} />;
  }
  if (reportId === "sm-purchases") {
    return <PurchaseReportDetail embedded controlledPeriod={controlled} />;
  }
  if (reportId === "sm-inventory") {
    return <InventoryReportDetail embedded controlledPeriod={controlled} />;
  }
  if (reportId === "sm-profit-loss") {
    return <ProfitLossReportDetail embedded controlledPeriod={controlled} />;
  }
  return null;
}

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
      <Suspense fallback={<ReportLoading />}>
        <EmbeddedSupermarketReport
          reportId={reportId}
          period={period}
          from={from}
          to={to}
        />
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
