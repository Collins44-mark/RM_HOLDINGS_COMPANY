import { listLivestockDirectory } from "@/lib/livestock/directory";
import { ExpensesView } from "./expenses-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livestock Expenses" };

export default async function LivestockExpensesPage() {
  return <ExpensesView initial={await listLivestockDirectory()} />;
}
