"use client";

import { useState } from "react";
import { LIVESTOCK_EXPENSE_CATEGORIES } from "@/lib/livestock/actions";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Panel, RowButton, SaveButton, fieldClass, money, useLivestock } from "../livestock-ui";

export function ExpensesView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, mark, error, save } = useLivestock(initial);
  const [form, setForm] = useState("");
  const categories = LIVESTOCK_EXPENSE_CATEGORIES.filter((category) => category !== "Livestock Purchase");

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
          <thead><tr>{["Reference", "Date", "Category", "Description", "Amount", "Paid", "Balance", "Status", ""].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
          <tbody>
            {data.expenses.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.expense_code}</td>
                <td className="px-3 py-2">{String(row.expense_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{money(Number(row.amount))}</td>
                <td className="px-3 py-2">{money(row.amount_paid)}</td>
                <td className="px-3 py-2">{money(row.balance)}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 space-x-2">
                  {row.status !== "Cancelled" && row.balance > 0 ? <button type="button" className="text-sm font-semibold text-[#0b2244]" onClick={() => setForm(row.id)}>Pay</button> : null}
                  {row.status !== "Cancelled" && !row.purchase_id ? <RowButton active={mark === row.id} state={state} label="Cancel" className="text-sm text-rose-700" onClick={() => save({ action: "expense-cancel", id: row.id }, { mark: row.id })} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {form === "expense" ? (
        <Panel title="Add expense" onClose={() => setForm("")} onSubmit={onSubmit}>
          <input name="date" type="date" required className={fieldClass} />
          <select name="category" className={fieldClass}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
          <input name="description" required placeholder="Description" className={fieldClass} />
          <input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className={fieldClass} />
          <select name="animal_type_id" className={fieldClass}><option value="">Related animal type</option>{data.types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          <select name="house_id" className={fieldClass}><option value="">Related poultry house</option>{data.houses.map((house) => <option key={house.id} value={house.id}>{house.house_name}</option>)}</select>
          <input name="vendor_name" placeholder="Vendor" className={fieldClass} />
          <input name="due_date" type="date" className={fieldClass} />
          <textarea name="notes" placeholder="Notes" className={fieldClass} />
          <SaveButton state={state} label="Save expense" />
        </Panel>
      ) : null}
      {form && form !== "expense" ? (
        <Panel title="Expense payment" onClose={() => setForm("")} onSubmit={async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
          await save({ action: "expense-payment", id: form, amount: payload.amount, date: payload.date, request_key: crypto.randomUUID() }, { close: () => setForm("") });
        }}>
          <input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className={fieldClass} />
          <input name="date" type="date" required className={fieldClass} />
          <SaveButton state={state} label="Save payment" />
        </Panel>
      ) : null}
    </div>
  );
}
