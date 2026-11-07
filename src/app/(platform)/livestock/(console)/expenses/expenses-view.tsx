"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { LIVESTOCK_EXPENSE_CATEGORIES } from "@/lib/livestock/actions";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Field, Panel, SaveButton, fieldClass, money, useLivestock } from "../livestock-ui";

export function ExpensesView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, error, save } = useLivestock(initial);
  const [form, setForm] = useState("");
  const [menuId, setMenuId] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const categories = LIVESTOCK_EXPENSE_CATEGORIES.filter((category) => category !== "Livestock Purchase");
  const expensePage = useListPage(data.expenses, `expenses:${data.expenses.length}`);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await save({ ...payload, action: "expense" }, { close: () => setForm("") });
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expenses</h1>
          <p className="mt-1 text-sm text-slate-500">Unpaid expenses stay outstanding until a payment is recorded. Purchase costs are created from livestock purchases.</p>
        </div>
        <button type="button" onClick={() => setForm("expense")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add expense</button>
      </div>
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead><tr>{["Reference", "Date", "Category", "Description", "Amount", "Paid", "Balance", "Status", "Action"].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
          <tbody>
            {expensePage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.expense_code}</td>
                <td className="px-3 py-2">{String(row.expense_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{money(Number(row.amount))}</td>
                <td className="px-3 py-2">{money(row.amount_paid)}</td>
                <td className="px-3 py-2">{money(row.balance)}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  {row.status !== "Cancelled" ? <button type="button" aria-label={`${row.expense_code} actions`} onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 160) });
                    setMenuId(menuId === row.id ? "" : row.id);
                  }} className="p-1 text-slate-600"><MoreVertical size={16} /></button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar page={expensePage.page} total={data.expenses.length} pageSize={expensePage.pageSize} onPage={expensePage.setPage} onPageSize={expensePage.setPageSize} />
        {menuId ? (
          <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
            <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
              {data.expenses.filter((row) => row.id === menuId).flatMap((row) => [
                ...(row.balance > 0 ? [{ label: "Pay", run: () => setForm(row.id) }] : []),
                ...(!row.purchase_id ? [{ label: "Cancel", run: () => { void save({ action: "expense-cancel", id: row.id }, { mark: row.id }); } }] : []),
              ]).map((action) => (
                <button key={action.label} type="button" className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${action.label === "Cancel" ? "text-rose-700" : "text-slate-800"}`} onClick={() => { setMenuId(""); action.run(); }}>{action.label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {form === "expense" ? (
        <Panel title="Add expense" onClose={() => setForm("")} onSubmit={onSubmit}>
          <Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field>
          <Field label="Category"><select name="category" className={fieldClass}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
          <Field label="Description"><input name="description" required className={fieldClass} /></Field>
          <Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required className={fieldClass} /></Field>
          <Field label="Animal type" hint="Optional"><select name="animal_type_id" className={fieldClass}><option value="">None</option>{data.types.filter((type) => type.name.toLowerCase() !== "eggs").map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
          <Field label="Poultry house" hint="Optional"><select name="house_id" className={fieldClass}><option value="">None</option>{data.houses.map((house) => <option key={house.id} value={house.id}>{house.house_name}</option>)}</select></Field>
          <Field label="Vendor"><input name="vendor_name" className={fieldClass} /></Field>
          <Field label="Due date"><input name="due_date" type="date" className={fieldClass} /></Field>
          <Field label="Notes"><textarea name="notes" className={fieldClass} /></Field>
          <SaveButton state={state} label="Save expense" />
        </Panel>
      ) : null}
      {form && form !== "expense" ? (
        <Panel title="Expense payment" onClose={() => setForm("")} onSubmit={async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
          await save({ action: "expense-payment", id: form, amount: payload.amount, date: payload.date, request_key: crypto.randomUUID() }, { close: () => setForm("") });
        }}>
          <Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required className={fieldClass} /></Field>
          <Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field>
          <SaveButton state={state} label="Save payment" />
        </Panel>
      ) : null}
    </div>
  );
}
