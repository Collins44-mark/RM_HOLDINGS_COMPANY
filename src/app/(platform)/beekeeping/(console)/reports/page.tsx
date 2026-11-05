import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import ReportsView from "./reports-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beekeeping Reports" };

export default async function BeekeepingReportsPage() {
  return <ReportsView initial={await listBeekeepingDirectory()} />;
}
