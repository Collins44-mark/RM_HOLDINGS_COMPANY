import { loadSchoolExpensesWorkspaceAction } from "@/actions/school/expenses";
import { SchoolExpensesPage } from "@/components/school/SchoolExpensesPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses" };

export default async function SchoolExpensesRoute() {
  const initial = await loadSchoolExpensesWorkspaceAction({ period: "this-month" });
  return <SchoolExpensesPage initial={initial} />;
}
