import { getSchoolFeesWorkspaceAction } from "@/actions/school/fees";
import { SchoolFeesPage } from "@/components/school/SchoolFeesPage";

export const metadata = { title: "Fees & Payments" };

export default async function SchoolFeesRoute() {
  const initial = await getSchoolFeesWorkspaceAction();
  return <SchoolFeesPage initial={initial} />;
}
