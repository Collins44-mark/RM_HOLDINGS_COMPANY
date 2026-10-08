import { getTransportServiceWorkspaceAction } from "@/actions/school/transport";
import { SchoolTransportServicePage } from "@/components/school/SchoolTransportServicePage";

export const metadata = { title: "Service" };

export default async function SchoolTransportServiceRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "maintenance" ? "maintenance" : "fuel";
  const initial = await getTransportServiceWorkspaceAction({ tab });
  return <SchoolTransportServicePage initial={initial} />;
}
