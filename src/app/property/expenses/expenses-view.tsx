"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { PAYMENT_METHODS, businessToday } from "@/lib/property/invoices";
import { useListPage } from "@/lib/property/use-list-page";
import {
  EXPENSE_CATEGORIES,
  expenseDateWindow,
  type ExpenseBookingOption,
  type ExpenseOption,
  type ExpenseRecord,
} from "@/lib/property/expenses";
import { saveModuleJson } from "@/lib/offline/module-save";

type Draft = {
  title: string;
  category: string;
  description: string;
  expense_date: string;
  due_date: string;
  vendor_name: string;
  receipt_reference: string;
  property_id: string;
  unit_id: string;
  booking_id: string;
  amount: string;
  amount_paid: string;
  payment_method: string;
  payment_date: string;
  transaction_reference: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  category: EXPENSE_CATEGORIES[0],
  description: "",
  expense_date: businessToday(),
  due_date: "",
  vendor_name: "",
  receipt_reference: "",
  property_id: "",
  unit_id: "",
  booking_id: "",
  amount: "",
  amount_paid: "0",
  payment_method: "Cash",
  payment_date: businessToday(),
  transaction_reference: "",
});

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function ExpensesView({
  initialItems,
  properties,
  units,
}: {
  initialItems: ExpenseRecord[];
  properties: ExpenseOption[];
  units: ExpenseOption[];
  bookings: ExpenseBookingOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [datePreset, setDatePreset] = useState("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | "pay" | null>(null);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [payment, setPayment] = useState({ payment_date: businessToday(), amount: "", payment_method: "Cash", transaction_reference: "", notes: "" });
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [selected, setSelected] = useState<ExpenseRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ExpenseRecord | null>(null);
  const [reason, setReason] = useState("");
  const [cancelState, setCancelState] = useState("idle");
  const [cancelError, setCancelError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const period = expenseDateWindow(datePreset, fromDate, toDate);
  const visible = items.filter((expense) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [expense.expense_number, expense.title, expense.category, expense.vendor_name, expense.property_name, expense.unit_name, expense.receipt_reference].some((value) => value.toLowerCase().includes(text));
    const matchesDate = !period || (expense.expense_date >= period.from && expense.expense_date <= period.to);
    return matchesText && matchesDate && (!categoryFilter || expense.category === categoryFilter) && (!propertyFilter || expense.property_id === propertyFilter) && (!unitFilter || expense.unit_id === unitFilter);
  });
  const sorted = [...visible].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
  const listPage = useListPage(sorted, `${query}|${categoryFilter}|${propertyFilter}|${unitFilter}|${datePreset}|${fromDate}|${toDate}`);
  const filterUnits = units.filter((unit) => !propertyFilter || unit.property_id === propertyFilter);
  const dated = items.filter((expense) => expense.record_status !== "Cancelled" && (!period || (expense.expense_date >= period.from && expense.expense_date <= period.to)));
  const recordedAmount = dated.reduce((sum, expense) => sum + expense.amount, 0);

  function replaceExpense(expense: ExpenseRecord) {
    setItems((current) => current.some((item) => item.id === expense.id) ? current.map((item) => item.id === expense.id ? expense : item) : [expense, ...current]);
    setSelected((current) => current && current.id === expense.id ? expense : current);
  }

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFormMode("create");
    setSaveState("idle");
    setSaveError("");
  }

  function openEdit(expense: ExpenseRecord) {
    setEditing(expense);
    setDraft({
      ...emptyDraft(),
      title: expense.title,
      category: expense.category,
      description: expense.description,
      expense_date: expense.expense_date,
      due_date: expense.due_date,
      vendor_name: expense.vendor_name,
      receipt_reference: expense.receipt_reference,
      property_id: expense.property_id,
      unit_id: expense.unit_id,
      booking_id: expense.booking_id,
      amount: String(expense.amount),
      amount_paid: "0",
    });
    setFormMode("edit");
    setSaveState("idle");
    setSaveError("");
    setOpenMenuId(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle" || !formMode) return;
    setSaveState("saving");
    setSaveError("");
    const path = formMode === "pay" && editing ? `/api/property/expenses/${editing.id}/payments` : formMode === "edit" && editing ? `/api/property/expenses/${editing.id}` : "/api/property/expenses";
    const method = formMode === "edit" ? "PATCH" : "POST";
    const payload = formMode === "pay" ? payment : { ...draft, amount: Number(draft.amount || 0), amount_paid: 0, payment_date: draft.expense_date || draft.payment_date };
    try {
      const result = await saveModuleJson(path, method, payload);
      if (!result.ok || (result.queued === false && !result.data.data)) {
        setSaveError(result.ok ? "Save failed" : result.error);
        setSaveState("idle");
        return;
      }
      if (result.queued) {
        setSaveState("saved");
        setTimeout(() => { setFormMode(null); setSaveState("idle"); }, 700);
        return;
      }
      replaceExpense(result.data.data as ExpenseRecord);
      setSaveState("saved");
      setTimeout(() => { setFormMode(null); setSaveState("idle"); }, 700);
    } catch (error: any) {
      setSaveError(error?.message || "Network error");
      setSaveState("idle");
    }
  }

  async function confirmCancel(event: React.FormEvent) {
    event.preventDefault();
    if (!cancelTarget || cancelState !== "idle") return;
    setCancelState("saving");
    setCancelError("");
    try {
      const response = await fetch(`/api/property/expenses/${cancelTarget.id}/cancel`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        setCancelError(data.error || "Cancel failed");
        setCancelState("idle");
        return;
      }
      replaceExpense(data.data);
      setCancelState("saved");
      setTimeout(() => { setCancelTarget(null); setCancelState("idle"); }, 700);
    } catch (error: any) {
      setCancelError(error?.message || "Network error");
      setCancelState("idle");
    }
  }

  return (
    <main className="pb-10 text-slate-900">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold md:text-3xl">Expenses</h1>
          <p className="text-sm text-slate-500">Manage business expenses, operating costs, and payments.</p>
        </div>
        <button type="button" onClick={openCreate} className="shrink-0 whitespace-nowrap rounded-xl bg-[#0b2244] px-2.5 py-1.5 text-[13px] font-medium text-white md:px-4 md:py-2.5 md:text-base">+ Add Expense</button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Amount</p>
          <p className="mt-1 text-2xl font-extrabold">{formatTzs(recordedAmount)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Expenses</p>
          <p className="mt-1 text-2xl font-extrabold">{dated.length}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" className="min-w-[180px] flex-1 rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
        <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setUnitFilter(""); }} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All units</option>{filterUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
        <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
        {datePreset === "custom" ? (
          <>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
          </>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm md:min-w-0">
            <thead>
              <tr className="text-left text-xs font-semibold normal-case tracking-normal text-slate-500 md:font-normal md:uppercase md:tracking-wider md:text-slate-400">
                <th className="px-4 py-3">Expense No.</th>
                <th className="px-4 py-3 md:p-0">Category</th>
                <th className="px-4 py-3 md:p-0">Property / Unit</th>
                <th className="px-4 py-3 md:p-0">Amount</th>
                <th className="px-4 py-3 md:p-0" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{items.length === 0 ? "No expenses yet." : "No expenses match these filters."}</td></tr> : listPage.rows.map((expense) => (
                <tr key={expense.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-3 font-medium md:whitespace-normal">{expense.expense_number || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:whitespace-normal md:p-0">{expense.category}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:whitespace-normal md:p-0">{expense.property_name || "—"}{expense.unit_name ? ` / ${expense.unit_name}` : ""}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:p-0">{formatTzs(expense.amount)}</td>
                  <td className="px-4 py-3 text-right md:px-0 md:py-0 md:pr-3">
                    <button type="button" aria-label="Expense actions" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenuPos({ top: rect.bottom + 4, left: rect.right - 188 }); setOpenMenuId(openMenuId === expense.id ? null : expense.id); }}><MoreVertical size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4"><PaginationBar page={listPage.page} total={sorted.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
      </div>

      {openMenuId ? (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)}>
          <div className="absolute w-48 rounded-xl bg-white py-1 text-sm shadow-lg" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
            {(() => {
              const expense = items.find((item) => item.id === openMenuId);
              if (!expense) return null;
              return (
                <>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setSelected(expense); setOpenMenuId(null); }}>View Details</button>
                  {expense.record_status !== "Cancelled" ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => openEdit(expense)}>Edit Expense</button> : null}
                  {expense.balance > 0 && expense.record_status !== "Cancelled" ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setEditing(expense); setPayment({ payment_date: businessToday(), amount: String(expense.balance), payment_method: "Cash", transaction_reference: "", notes: "" }); setFormMode("pay"); setSaveState("idle"); setSaveError(""); setOpenMenuId(null); }}>Record Payment</button> : null}
                  <a className="block px-3 py-2 hover:bg-slate-50" href={`/property/expenses/${expense.id}/print`} target="_blank" rel="noreferrer">Print Expense</a>
                  {expense.amount_paid <= 0 && expense.record_status !== "Cancelled" ? <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-slate-50" onClick={() => { setCancelTarget(expense); setReason(""); setCancelError(""); setCancelState("idle"); setOpenMenuId(null); }}>Cancel Expense</button> : null}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {formMode ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]">
          <form onSubmit={handleSave} className="max-h-full min-h-0 w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">{formMode === "pay" ? "Record Payment" : formMode === "edit" ? "Edit Expense" : "Add Expense"}</h2>
            {formMode === "pay" && editing ? (
              <div className="mt-4 grid gap-3 text-sm">
                <p>{editing.title} · {formatTzs(editing.balance)} left</p>
                <label>Date<input type="date" required value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Amount<input required inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Method<select value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 text-sm">
                <label>Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Property<select required value={draft.property_id} onChange={(event) => setDraft({ ...draft, property_id: event.target.value, unit_id: "", booking_id: "" })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300"><option value="">Select</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                <label>Date<input type="date" required value={draft.expense_date} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Amount<input required inputMode="decimal" value={draft.amount} disabled={formMode === "edit" && (editing?.amount_paid || 0) > 0} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300 disabled:opacity-60" /></label>
                <label>Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              </div>
            )}
            {saveError ? <p className="mt-3 text-sm text-rose-700">{saveError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => saveState === "idle" && setFormMode(null)} className="rounded-xl px-4 py-2 text-slate-600">Close</button>
              <button type="submit" disabled={saveState !== "idle"} className={`flex min-w-[120px] items-center justify-center rounded-xl px-4 py-2 font-semibold text-white ${saveState === "saved" ? "bg-emerald-600" : "bg-[#0b2244]"}`}>
                {saveState === "saving" ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : saveState === "saved" ? "Saved" : formMode === "pay" ? "Record Payment" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <aside className="mt-[72px] mr-4 mb-4 flex h-[calc(100vh-72px)] w-full max-w-[520px] flex-col overflow-y-auto rounded-3xl border border-slate-100 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-md" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/90 px-8 pb-4 pt-8 backdrop-blur-md">
              <div>
                <div className="mb-1">
                  <h2 className="text-2xl font-extrabold leading-tight text-slate-900">{selected.title}</h2>
                </div>
                <p className="text-sm text-slate-500">{selected.expense_number || "Expense"} · {selected.property_name || "Property"} · {formatTzs(selected.amount)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="flex gap-1 border-b border-slate-100 px-8 pt-4">
              <button type="button" className="rounded-t-xl border-b-2 border-[#0b2244] px-3 py-2 text-sm font-medium text-[#0b2244]">Details</button>
            </div>
            <div className="flex-1 px-8 py-6">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Expense Information</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><div className="text-xs text-slate-400">Category</div><div className="font-semibold text-slate-900">{selected.category}</div></div>
                <div><div className="text-xs text-slate-400">Property</div><div className="font-semibold text-slate-900">{selected.property_name || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Date</div><div className="font-semibold text-slate-900">{formatDate(selected.expense_date)}</div></div>
                <div><div className="text-xs text-slate-400">Amount</div><div className="font-semibold text-slate-900">{formatTzs(selected.amount)}</div></div>
                <div className="col-span-2"><div className="text-xs text-slate-400">Description</div><div className="font-semibold text-slate-900">{selected.description || "—"}</div></div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]">
          <form onSubmit={confirmCancel} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Cancel {cancelTarget.expense_number || "expense"}</h2>
            <label className="mt-3 block text-sm">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
            {cancelError ? <p className="mt-2 text-sm text-rose-700">{cancelError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => cancelState === "idle" && setCancelTarget(null)} className="rounded-xl px-4 py-2 text-slate-600">Close</button>
              <button type="submit" disabled={cancelState !== "idle"} className="rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white">{cancelState === "saving" ? "…" : cancelState === "saved" ? "Saved" : "Cancel Expense"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
