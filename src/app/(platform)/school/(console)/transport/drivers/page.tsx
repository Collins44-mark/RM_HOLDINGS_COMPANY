import { getTransportDriversWorkspaceAction } from "@/actions/school/transport";
import { SchoolTransportDriversPage } from "@/components/school/SchoolTransportDriversPage";

export const metadata = { title: "Drivers" };

export default async function SchoolTransportDriversRoute() {
  const initial = await getTransportDriversWorkspaceAction();
  return <SchoolTransportDriversPage initial={initial} />;
}
