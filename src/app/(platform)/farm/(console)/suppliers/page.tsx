import { loadFarmPartiesWorkspaceAction } from "@/actions/farm/workspace";
import { FarmPartiesPage } from "@/components/farm/FarmPartiesPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers" };

export default async function FarmSuppliersRoute() {
  const initial = await loadFarmPartiesWorkspaceAction("SUPPLIER");
  return <FarmPartiesPage initial={initial} kind="SUPPLIER" />;
}
