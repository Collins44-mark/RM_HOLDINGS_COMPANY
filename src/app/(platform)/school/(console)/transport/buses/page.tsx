import { getTransportBusesWorkspaceAction } from "@/actions/school/transport";
import { SchoolTransportBusesPage } from "@/components/school/SchoolTransportBusesPage";

export const metadata = { title: "School Buses" };

export default async function SchoolTransportBusesRoute() {
  const initial = await getTransportBusesWorkspaceAction();
  return <SchoolTransportBusesPage initial={initial} />;
}
