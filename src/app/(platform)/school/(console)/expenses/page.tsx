import { listSchoolExpensesAction } from "@/actions/school/transport";
import { SchoolExpensesPage } from "@/components/school/SchoolExpensesPage";

export const metadata = { title: "Expenses" };

export default async function SchoolExpensesRoute() {
  const initial = await listSchoolExpensesAction();
  return <SchoolExpensesPage initial={initial} />;
}
