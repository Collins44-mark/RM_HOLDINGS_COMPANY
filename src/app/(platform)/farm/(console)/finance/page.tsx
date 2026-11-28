import { redirect } from "next/navigation";
import { loadFarmFinanceWorkspaceAction } from "@/actions/farm/workspace";
import { FarmFinancePage } from "@/components/farm/FarmFinancePage";
import { farmOpeningWindow } from "@/lib/farm/history-window";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function FarmFinanceRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  const window = farmOpeningWindow(params);
  const query = params.q?.trim() ?? "";
  if (window.redirect) {
    const next = new URLSearchParams({ period: window.period, from: window.from, to: window.to });
    if (query) next.set("q", query);
    redirect(`/farm/finance?${next.toString()}`);
  }
  const initial = await loadFarmFinanceWorkspaceAction({
    period: window.period,
    from: window.from,
    to: window.to,
    q: query,
  });
  return <FarmFinancePage initial={initial} period={window.period} from={window.from} to={window.to} query={query} />;
}
