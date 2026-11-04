"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { PAYMENT_METHODS, businessToday } from "@/lib/property/invoices";
import { nextSerial } from "@/lib/property/serial";
import { useListPage } from "@/lib/property/use-list-page";
import {
  EXPENSE_CATEGORIES,
  expenseDateWindow,
  summarizeExpenses,
  type ExpenseBookingOption,
  type ExpenseOption,
  type ExpenseRecord,
  type PropertyIncome,
} from "@/lib/property/expenses";

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

function statusClass(status: string) {
  if (status === "Paid") return "bg-emerald-50 text-emerald-700";
  if (status === "Partially Paid") return "bg-sky-50 text-sky-700";
  if (status === "Overdue") return "bg-rose-50 text-rose-700";
  if (status === "Cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

export default function ExpensesView({
  initialItems,
  properties,
  units,
  bookings,
  income,
}: {
  initialItems: ExpenseRecord[];
  properties: ExpenseOption[];
  units: ExpenseOption[];
  bookings: ExpenseBookingOption[];
  income: PropertyIncome[];
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("date");
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

  const summary = useMemo(() => summarizeExpenses(items), [items]);
  const period = expenseDateWindow(datePreset, fromDate, toDate);
  const visible = items.filter((expense) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [expense.expense_number, expense.title, expense.category, expense.vendor_name, expense.property_name, expense.unit_name, expense.receipt_reference].some((value) => value.toLowerCase().includes(text));
    const matchesDate = !period || (expense.expense_date >= period.from && expense.expense_date <= period.to);
    return matchesText && matchesDate && (!categoryFilter || expense.category === categoryFilter) && (!propertyFilter || expense.property_id === propertyFilter) && (!unitFilter || expense.unit_id === unitFilter) && (!statusFilter || expense.payment_status === statusFilter);
  });
  const sorted = [...visible].sort((a, b) => {
    if (sortBy === "amount") return b.amount - a.amount;
    if (sortBy === "balance") return b.balance - a.balance;
    return b.expense_date.localeCompare(a.expense_date);
  });
  const listPage = useListPage(sorted, `${query}|${categoryFilter}|${propertyFilter}|${unitFilter}|${statusFilter}|${datePreset}|${fromDate}|${toDate}|${sortBy}`);
  const filterUnits = units.filter((unit) => !propertyFilter || unit.property_id === propertyFilter);
  const draftUnits = units.filter((unit) => unit.property_id === draft.property_id);
  const draftBookings = bookings.filter((booking) => !draft.property_id || booking.property_id === draft.property_id);
  const previewAmount = Number(draft.amount || 0);
  const previewPaid = formMode === "create" ? Number(draft.amount_paid || 0) : 0;
  const costs = summary.byProperty.map((property) => ({
    ...property,
    income: income.find((item) => item.id === property.id)?.income || 0,
    result: Math.round(((income.find((item) => item.id === property.id)?.income || 0) - property.paid) * 100) / 100,
  }));

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
    const payload = formMode === "pay" ? payment : { ...draft, amount: Number(draft.amount || 0), amount_paid: formMode === "create" ? Number(draft.amount_paid || 0) : 0 };
    try {
      const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        setSaveError(data.error || "Save failed");
        setSaveState("idle");
        return;
      }
      replaceExpense(data.data);
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
          <h1 className="text-3xl font-extrabold">Expenses</h1>
          <p className="text-sm text-slate-500">Manage business expenses, operating costs, and payments.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#0b2244] px-4 py-2.5 font-medium text-white">+ Add Expense</button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Total Expenses", summary.total], ["Paid", summary.paid], ["Pending", summary.pending], ["Overdue", summary.overdue]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-extrabold">{formatTzs(Number(value))}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Expense records", String(summary.records)], ["Collected", formatTzs(summary.collected)], ["Outstanding", formatTzs(summary.outstanding)]].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" className="min-w-[180px] flex-1 rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
        <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setUnitFilter(""); }} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All units</option>{filterUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All statuses</option>{["Pending", "Partially Paid", "Paid", "Overdue", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="date">Newest date</option><option value="amount">Highest amount</option><option value="balance">Highest balance</option></select>
        <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
          <option value="">All dates</option>
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
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-4 py-3">Expense No.</th><th>Expense</th><th>Category</th><th>Property / Unit</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sorted.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">{items.length === 0 ? "No expenses yet." : "No expenses match these filters."}</td></tr> : listPage.rows.map((expense) => (
                <tr key={expense.id}>
                  <td className="px-4 py-3 font-medium">{expense.expense_number || "—"}</td>
                  <td>{expense.title}</td>
                  <td>{expense.category}</td>
                  <td>{expense.property_name || "—"}{expense.unit_name ? ` / ${expense.unit_name}` : ""}</td>
                  <td>{formatDate(expense.expense_date)}</td>
                  <td>{formatTzs(expense.amount)}</td>
                  <td>{formatTzs(expense.amount_paid)}</td>
                  <td>{formatTzs(expense.balance)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(expense.payment_status)}`}>{expense.payment_status}</span></td>
                  <td className="pr-3 text-right">
                    <button type="button" aria-label="Expense actions" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenuPos({ top: rect.bottom + 4, left: rect.right - 188 }); setOpenMenuId(openMenuId === expense.id ? null : expense.id); }}><MoreVertical size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4"><PaginationBar page={listPage.page} total={sorted.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
      </div>

      {costs.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-700">Property operating costs</h2>
          <p className="mb-3 text-xs text-slate-500">Operating result is collected rent and hall booking payments minus expenses actually paid. It is not net profit.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {costs.map((property) => (
              <div key={property.id} className="rounded-2xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">{property.name}</p>
                <p className="mt-1 text-slate-500">Recorded {formatTzs(property.recorded)} · Paid {formatTzs(property.paid)} · Outstanding {formatTzs(property.outstanding)}</p>
                <p className="text-slate-500">Collected income {formatTzs(property.income)} · Operating result {formatTzs(property.result)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSave} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">{formMode === "pay" ? "Record Payment" : formMode === "edit" ? "Edit Expense" : "Add Expense"}</h2>
            {formMode === "pay" && editing ? (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p className="sm:col-span-2">{editing.expense_number} · {editing.title}<br />Outstanding <strong>{formatTzs(editing.balance)}</strong></p>
                <label>Payment date<input type="date" required value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                <label>Amount<input required inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                <label>Payment method<select value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
                <label>Transaction reference<input value={payment.transaction_reference} onChange={(event) => setPayment({ ...payment, transaction_reference: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                <label className="sm:col-span-2">Notes<textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Expense information</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label>Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                    <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                    <label>Expense date<input type="date" required value={draft.expense_date} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                    <label>Due date<input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                    <label>Vendor<input value={draft.vendor_name} onChange={(event) => setDraft({ ...draft, vendor_name: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                    <label>Reference number<input value={draft.receipt_reference} onChange={(event) => setDraft({ ...draft, receipt_reference: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                    <label className="sm:col-span-2">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                  </div>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Property</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label>Property<select required value={draft.property_id} onChange={(event) => setDraft({ ...draft, property_id: event.target.value, unit_id: "", booking_id: "" })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2"><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                    <label>Unit<select value={draft.unit_id} disabled={!draft.property_id} onChange={(event) => setDraft({ ...draft, unit_id: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2 disabled:opacity-50"><option value="">No unit</option>{draftUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
                    <label className="sm:col-span-2">Hall booking<select value={draft.booking_id} disabled={!draft.property_id} onChange={(event) => setDraft({ ...draft, booking_id: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2 disabled:opacity-50"><option value="">No booking</option>{draftBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.booking_number} · {booking.hall_name} · {formatDate(booking.event_date)}</option>)}</select></label>
                    <p className="text-xs text-slate-500 sm:col-span-2">Expense number <strong>{formMode === "edit" ? editing?.expense_number : nextSerial(items.map((expense) => expense.expense_number), "EXP", 1)}</strong>. A property is required. Receipt files are not stored; use the reference number.</p>
                  </div>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Amount</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label>Amount<input required inputMode="decimal" value={draft.amount} disabled={formMode === "edit" && (editing?.amount_paid || 0) > 0} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2 disabled:opacity-60" /></label>
                    <p className="self-end text-slate-500">Total {formatTzs(previewAmount)} · Outstanding {formatTzs(Math.max(0, previewAmount - previewPaid))}</p>
                    {formMode === "create" ? (
                      <>
                        <label>Payment made<input inputMode="decimal" value={draft.amount_paid} onChange={(event) => setDraft({ ...draft, amount_paid: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                        <label>Payment method<select value={draft.payment_method} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
                        <label>Payment date<input type="date" value={draft.payment_date} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                        <label>Transaction reference<input value={draft.transaction_reference} onChange={(event) => setDraft({ ...draft, transaction_reference: event.target.value })} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
                      </>
                    ) : null}
                  </div>
                </section>
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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-slate-400">{selected.expense_number || "Expense"}</p><h2 className="text-xl font-bold">{selected.title}</h2></div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-400">Close</button>
            </div>
            <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(selected.payment_status)}`}>{selected.payment_status}</span>
            <dl className="mt-4 space-y-2 text-sm">
              {([
                ["Category", selected.category],
                ["Description", selected.description],
                ["Expense date", formatDate(selected.expense_date)],
                ["Due date", formatDate(selected.due_date)],
                ["Vendor", selected.vendor_name],
                ["Reference", selected.receipt_reference],
                ["Property", selected.property_name],
                ["Address", selected.property_address],
                ["Unit", selected.unit_name],
                ["Booking", selected.booking_number ? `${selected.booking_number} · ${selected.hall_name} · ${formatDate(selected.event_date)}` : ""],
                ["Amount", formatTzs(selected.amount)],
                ["Paid", formatTzs(selected.amount_paid)],
                ["Outstanding", formatTzs(selected.balance)],
                ["Recorded by", selected.recorded_by_name],
                ["Created", formatDate(selected.created_at)],
                ["Updated", formatDate(selected.updated_at)],
                ["Cancellation", selected.cancel_reason],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value || "—"}</dd></div>
              ))}
            </dl>
            <h3 className="mt-6 text-xs font-semibold uppercase tracking-widest text-slate-400">Payments</h3>
            {selected.payments.length === 0 ? <p className="mt-2 text-sm text-slate-500">No payments recorded.</p> : <ul className="mt-2 space-y-2 text-sm">{selected.payments.map((item) => <li key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{formatDate(item.payment_date)} · {formatTzs(item.amount)}</p><p className="text-slate-500">{item.payment_method}{item.transaction_reference ? ` · ${item.transaction_reference}` : ""} · {item.status}</p></li>)}</ul>}
            {selected.booking_id ? <p className="mt-4 text-xs text-slate-500">This cost stays separate from the hall booking payment. Booking collections are not reduced by this expense.</p> : null}
          </aside>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={confirmCancel} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Cancel {cancelTarget.expense_number || "expense"}</h2>
            <label className="mt-3 block text-sm">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2" /></label>
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
