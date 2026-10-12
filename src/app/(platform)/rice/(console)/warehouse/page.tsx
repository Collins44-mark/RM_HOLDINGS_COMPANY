import { loadRiceWarehouseWorkspaceAction } from "@/actions/rice/workspace";
import { RiceWarehousePage } from "@/components/rice/RiceWarehousePage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warehouse" };

export default async function RiceWarehouseRoute() {
  const initial = await loadRiceWarehouseWorkspaceAction();
  return <RiceWarehousePage initial={initial} />;
}
