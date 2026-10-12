import { loadRiceFinanceWorkspaceAction } from "@/actions/rice/workspace";
import { RiceFinancePage } from "@/components/rice/RiceFinancePage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function RiceFinanceRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadRiceFinanceWorkspaceAction({ period, from: params.from, to: params.to });
  return <RiceFinancePage initial={initial} period={period} />;
}
