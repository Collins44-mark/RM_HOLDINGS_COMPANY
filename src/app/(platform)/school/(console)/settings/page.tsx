import { getSchoolSettingsWorkspaceAction } from "@/actions/school/settings";
import { SchoolSettingsPage } from "@/components/school/SchoolSettingsPage";

export const metadata = { title: "School Settings" };

export default async function SchoolSettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const initial = await getSchoolSettingsWorkspaceAction();
  const { tab } = await searchParams;
  return <SchoolSettingsPage initial={initial} initialTab={tab} />;
}
