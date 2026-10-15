import { loadFarmReportsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmReportsPage } from "@/components/farm/FarmReportsPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function FarmReportsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadFarmReportsWorkspaceAction({ period, from: params.from, to: params.to });
  return <FarmReportsPage initial={initial} period={period} />;
}
