import { loadRiceReportsWorkspaceAction } from "@/actions/rice/workspace";
import { RiceReportsPage } from "@/components/rice/RiceReportsPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function RiceReportsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadRiceReportsWorkspaceAction({ period, from: params.from, to: params.to });
  return <RiceReportsPage initial={initial} period={period} />;
}
