import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import HarvestsView from "./harvests-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Harvest Records" };

export default async function HarvestsPage() {
  return <HarvestsView initial={await listBeekeepingDirectory()} />;
}
