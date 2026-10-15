import { loadFarmFinanceWorkspaceAction } from "@/actions/farm/workspace";
import { FarmFinancePage } from "@/components/farm/FarmFinancePage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function FarmFinanceRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadFarmFinanceWorkspaceAction({ period, from: params.from, to: params.to });
  return <FarmFinancePage initial={initial} period={period} />;
}
