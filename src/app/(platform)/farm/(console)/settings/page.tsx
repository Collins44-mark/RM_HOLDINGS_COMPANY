import { loadFarmSettingsWorkspaceAction } from "@/actions/farm/workspace";
import { FarmSettingsPage } from "@/components/farm/FarmSettingsPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function FarmSettingsRoute() {
  const initial = await loadFarmSettingsWorkspaceAction();
  return <FarmSettingsPage initial={initial} />;
}
