import { PageHeader } from "@/components/ui/PageHeader";
import { GroupReportsView } from "@/components/reports/GroupReportsView";
import { ReportPeriodSelector } from "@/components/reports/ReportPeriodSelector";
import {
  getConsolidatedReport,
  parseReportPeriod,
} from "@/lib/data/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const report = await getConsolidatedReport({ period, from, to });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Reports"
        description="Group-level operational and financial reports from live production ledgers."
        action={<ReportPeriodSelector period={period} label={report.label} />}
      />
      <GroupReportsView report={report} />
    </div>
  );
}
