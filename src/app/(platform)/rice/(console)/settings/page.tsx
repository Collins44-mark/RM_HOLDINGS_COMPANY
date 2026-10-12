import { loadRiceSettingsWorkspaceAction } from "@/actions/rice/workspace";
import { RiceSettingsPage } from "@/components/rice/RiceSettingsPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function RiceSettingsRoute() {
  const initial = await loadRiceSettingsWorkspaceAction();
  return <RiceSettingsPage initial={initial} />;
}
