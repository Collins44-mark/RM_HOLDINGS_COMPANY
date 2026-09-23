import {
  GroupFinancialReport,
  GroupOverviewReport,
  GroupPerformanceReport,
} from "@/components/reports/group/GroupReportPanels";
import { ReportEmptyState } from "@/components/reports/report-ui";
import {
  SupermarketInventoryWorkspaceReport,
  SupermarketProfitLossWorkspaceReport,
  SupermarketPurchasesWorkspaceReport,
  SupermarketSalesWorkspaceReport,
} from "@/components/reports/supermarket/SupermarketWorkspaceReports";
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

    if (reportId === "group-overview") {
      return <GroupOverviewReport report={consolidated} />;
    }
    if (reportId === "group-financial") {
      return <GroupFinancialReport report={consolidated} />;
    }
    if (reportId === "group-performance") {
      return <GroupPerformanceReport report={consolidated} />;
    }
  }

  if (moduleId === "supermarket") {
    if (reportId === "sm-sales") {
      return <SupermarketSalesWorkspaceReport period={period} from={from} to={to} />;
    }
    if (reportId === "sm-purchases") {
      return <SupermarketPurchasesWorkspaceReport period={period} from={from} to={to} />;
    }
    if (reportId === "sm-inventory") {
      return <SupermarketInventoryWorkspaceReport period={period} from={from} to={to} />;
    }
    if (reportId === "sm-profit-loss") {
      return <SupermarketProfitLossWorkspaceReport period={period} from={from} to={to} />;
    }
  }

  return (
    <ReportEmptyState
      title="Report not available"
      description="This report is not implemented for the selected business module."
    />
  );
}
