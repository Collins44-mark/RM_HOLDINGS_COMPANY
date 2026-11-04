import { notFound } from "next/navigation";
import { formatTzs } from "@/lib/format/currency";
import { listExpenseDirectory } from "@/lib/property/expense-directory";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default async function PrintExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const directory = await listExpenseDirectory();
  const expense = directory.expenses.find((item) => item.id === id);
  if (!expense) notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">RM Holdings Ltd</p>
          <h1 className="mt-1 text-3xl font-extrabold">Expense</h1>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{expense.expense_number || "—"}</p>
          <p className="text-sm text-slate-500">{expense.payment_status}</p>
        </div>
      </div>
      <section className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <p><span className="text-slate-500">Expense</span><br /><strong>{expense.title}</strong></p>
        <p><span className="text-slate-500">Category</span><br /><strong>{expense.category}</strong></p>
        <p><span className="text-slate-500">Property</span><br /><strong>{expense.property_name || "—"}</strong></p>
        <p><span className="text-slate-500">Unit</span><br /><strong>{expense.unit_name || "—"}</strong></p>
        <p><span className="text-slate-500">Expense date</span><br /><strong>{formatDate(expense.expense_date)}</strong></p>
        <p><span className="text-slate-500">Due date</span><br /><strong>{formatDate(expense.due_date)}</strong></p>
        <p><span className="text-slate-500">Vendor</span><br /><strong>{expense.vendor_name || "—"}</strong></p>
        <p><span className="text-slate-500">Reference</span><br /><strong>{expense.receipt_reference || "—"}</strong></p>
      </section>
      <p className="mt-4 text-sm text-slate-600">{expense.description || "No description."}</p>
      <table className="mt-8 w-full text-sm">
        <tbody>
          <tr><td className="py-2">Amount</td><td className="py-2 text-right">{formatTzs(expense.amount)}</td></tr>
          <tr><td className="py-2">Paid</td><td className="py-2 text-right">{formatTzs(expense.amount_paid)}</td></tr>
          <tr><td className="py-2 font-bold">Outstanding</td><td className="py-2 text-right font-bold">{formatTzs(expense.balance)}</td></tr>
        </tbody>
      </table>
      <button type="button" className="print-button mt-8 rounded-xl bg-[#0b2244] px-4 py-2 text-white">Print</button>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelector('.print-button')?.addEventListener('click', () => window.print());" }} />
      <style>{`@media print { .print-button { display: none } body { background: white } }`}</style>
    </main>
  );
}
