import { loadFarmPartiesWorkspaceAction } from "@/actions/farm/workspace";
import { FarmPartiesPage } from "@/components/farm/FarmPartiesPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function FarmCustomersRoute() {
  const initial = await loadFarmPartiesWorkspaceAction("CUSTOMER");
  return <FarmPartiesPage initial={initial} kind="CUSTOMER" />;
}
