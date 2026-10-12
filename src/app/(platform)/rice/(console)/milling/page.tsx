import { loadRiceMillingWorkspaceAction } from "@/actions/rice/workspace";
import { RiceMillingPage } from "@/components/rice/RiceMillingPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Milling & Production" };

export default async function RiceMillingRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadRiceMillingWorkspaceAction({ period, from: params.from, to: params.to });
  return <RiceMillingPage initial={initial} period={period} />;
}
