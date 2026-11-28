import { redirect } from "next/navigation";
import { loadFarmOperationsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmOperationsPage } from "@/components/farm/FarmOperationsPage";
import { farmOpeningWindow } from "@/lib/farm/history-window";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Farm" };

export default async function FarmOperationsRoute({
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
    redirect(`/farm/operations?${next.toString()}`);
  }
  const initial = await loadFarmOperationsWorkspaceAction({ period: window.period, from: window.from, to: window.to });
  return <FarmOperationsPage initial={initial} period={window.period} from={window.from} to={window.to} query={query} />;
}
