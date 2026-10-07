import { getSchoolSettingsWorkspaceAction } from "@/actions/school/settings";
import { SchoolSettingsPage } from "@/components/school/SchoolSettingsPage";

export const metadata = { title: "School Settings" };

export default async function SchoolSettingsRoute() {
  const initial = await getSchoolSettingsWorkspaceAction();
  return <SchoolSettingsPage initial={initial} />;
}
