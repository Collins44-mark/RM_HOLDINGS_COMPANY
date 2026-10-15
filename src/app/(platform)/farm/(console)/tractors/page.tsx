import { loadFarmTractorsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmTractorsPage } from "@/components/farm/FarmTractorsPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tractors & Equipment" };

export default async function FarmTractorsRoute() {
  const initial = await loadFarmTractorsWorkspaceAction();
  return <FarmTractorsPage initial={initial} />;
}
