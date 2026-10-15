import { loadFarmJobsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmJobsPage } from "@/components/farm/FarmJobsPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Farm Services & Jobs" };

export default async function FarmJobsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadFarmJobsWorkspaceAction({ period, from: params.from, to: params.to });
  return <FarmJobsPage initial={initial} period={period} />;
}
