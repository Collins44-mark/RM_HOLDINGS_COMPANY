import { loadFarmFuelWorkspaceAction } from "@/actions/farm/workspace";
import { FarmFuelPage } from "@/components/farm/FarmFuelPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fuel & Maintenance" };

export default async function FarmFuelRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadFarmFuelWorkspaceAction({ period, from: params.from, to: params.to });
  return <FarmFuelPage initial={initial} period={period} />;
}
