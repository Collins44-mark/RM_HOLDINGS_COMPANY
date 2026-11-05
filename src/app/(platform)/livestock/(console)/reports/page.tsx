import { reportPeriodRange } from "@/lib/data/report-period";
import { listLivestockDirectory } from "@/lib/livestock/directory";
import ReportsView from "./reports-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livestock Reports" };

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function LivestockReportsPage() {
  const range = reportPeriodRange("this-month", new Date());
  return <ReportsView initial={await listLivestockDirectory()} seed={{ from: iso(range.from), to: iso(range.to), label: range.label }} />;
}
