import { getTransportOverviewAction } from "@/actions/school/transport";
import { SchoolTransportOverviewPage } from "@/components/school/SchoolTransportOverviewPage";

export const metadata = { title: "Transport" };

export default async function SchoolTransportRoute() {
  const initial = await getTransportOverviewAction();
  return <SchoolTransportOverviewPage initial={initial} />;
}
