import { loadRicePurchasesWorkspaceAction } from "@/actions/rice/workspace";
import { RicePurchasesPage } from "@/components/rice/RicePurchasesPage";
import { parseReportPeriod } from "@/lib/data/report-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchases" };

export default async function RicePurchasesRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const initial = await loadRicePurchasesWorkspaceAction({ period, from: params.from, to: params.to });
  return <RicePurchasesPage initial={initial} period={period} />;
}
