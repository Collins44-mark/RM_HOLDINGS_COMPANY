import ExpensesView from "./expenses-view";
import { listExpenseDirectory } from "@/lib/property/expense-directory";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const directory = await listExpenseDirectory();
  return (
    <ExpensesView
      initialItems={directory.expenses}
      properties={directory.properties}
      units={directory.units}
      bookings={directory.bookings}
      income={directory.income}
    />
  );
}
