import { loadFarmStaffWorkspaceAction } from "@/actions/farm/workspace";
import { FarmStaffPage } from "@/components/farm/FarmStaffPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employees" };

export default async function FarmStaffRoute() {
  const initial = await loadFarmStaffWorkspaceAction();
  return <FarmStaffPage initial={initial} />;
}
