import { loadFarmOperationsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmOperationsPage } from "@/components/farm/FarmOperationsPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Farm" };

export default async function FarmOperationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadFarmOperationsWorkspaceAction({ period, from: params.from, to: params.to });
  return <FarmOperationsPage initial={initial} period={period} />;
}
