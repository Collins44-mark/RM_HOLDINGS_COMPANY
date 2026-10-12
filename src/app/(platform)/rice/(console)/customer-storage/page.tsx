import { loadRiceStorageWorkspaceAction } from "@/actions/rice/workspace";
import { RiceStoragePage } from "@/components/rice/RiceStoragePage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Storage" };

export default async function RiceStorageRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadRiceStorageWorkspaceAction({ period, from: params.from, to: params.to });
  return <RiceStoragePage initial={initial} period={period} />;
}
