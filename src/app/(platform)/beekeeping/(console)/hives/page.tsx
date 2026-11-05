import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import HivesView from "./hives-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beehives" };

export default async function HivesPage() {
  const directory = await listBeekeepingDirectory();
  return <HivesView initial={directory} />;
}
