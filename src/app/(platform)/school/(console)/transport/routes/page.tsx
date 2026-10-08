import { getTransportRoutesWorkspaceAction } from "@/actions/school/transport";
import { SchoolTransportRoutesPage } from "@/components/school/SchoolTransportRoutesPage";

export const metadata = { title: "Routes" };

export default async function SchoolTransportRoutesRoute() {
  const initial = await getTransportRoutesWorkspaceAction();
  return <SchoolTransportRoutesPage initial={initial} />;
}
