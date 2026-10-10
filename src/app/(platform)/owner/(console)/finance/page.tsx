import { loadSchoolSalaryWorkspaceAction } from "@/actions/school/salary";
import { FinanceWorkspace } from "@/components/finance/FinanceWorkspace";
import {
  getConsolidatedFinanceForReportPeriod,
  parseFinanceTab,
} from "@/lib/data/finance";
import { parseReportPeriod } from "@/lib/data/report-period";

export const metadata = { title: "Finance (Consolidated)" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period);
  const tab = parseFinanceTab(params.tab);
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const [finance, salary] = await Promise.all([
    getConsolidatedFinanceForReportPeriod({ period, from, to }),
    loadSchoolSalaryWorkspaceAction({ period, from, to, status: "active" }),
  ]);

  return (
    <FinanceWorkspace
      period={period}
      label={finance.label}
      initialTab={tab}
      rows={finance.rows}
      totals={finance.totals}
      comparison={finance.comparison}
      comparisonLabel={finance.comparisonLabel}
      trend={finance.trend}
      trendGrain={finance.trendGrain}
      categories={finance.categories}
      salary={salary}
    />
  );
}
