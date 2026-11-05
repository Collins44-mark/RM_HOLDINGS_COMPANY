import { listLivestockDirectory } from "@/lib/livestock/directory";
import { HousesView } from "./houses-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Poultry Houses" };

export default async function PoultryHousesPage() {
  return <HousesView initial={await listLivestockDirectory()} />;
}
