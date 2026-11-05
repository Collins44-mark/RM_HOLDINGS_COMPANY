import { listLivestockDirectory } from "@/lib/livestock/directory";
import { AnimalsView } from "./animals-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livestock Management" };

export default async function LivestockAnimalsPage() {
  const directory = await listLivestockDirectory();
  return <AnimalsView initial={directory} />;
}
