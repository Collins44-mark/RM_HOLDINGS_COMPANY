import { loadSchoolStoreWorkspaceAction } from "@/actions/school/store";
import { SchoolStorePage } from "@/components/school/SchoolStorePage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Store & Inventory" };

export default async function SchoolStoreRoute() {
  const initial = await loadSchoolStoreWorkspaceAction({ view: "overview" });
  return <SchoolStorePage initial={initial} />;
}
