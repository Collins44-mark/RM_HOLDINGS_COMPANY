"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { useListPage } from "@/lib/property/use-list-page";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, businessToday, roundMoney } from "@/lib/beekeeping/constants";
import type { BeeDirectory, BeeExpense, BeeSale } from "@/lib/beekeeping/directory";
import { SaveButton, fieldClass, formatDate, overlayClass, saveJson, statusClass } from "../bee-ui";

export default function SalesView({ initial, initialTab }: { initial: BeeDirectory; initialTab: "sales" | "expenses" }) {
  const [directory, setDirectory] = useState(initial);
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"sale" | "expense" | "pay-sale" | "pay-expense" | "edit-sale" | "edit-expense" | null>(null);
  const [sale, setSale] = useState<BeeSale | null>(null);
  const [expense, setExpense] = useState<BeeExpense | null>(null);
  const [selectedSale, setSelectedSale] = useState<BeeSale | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<BeeExpense | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [requestKey, setRequestKey] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const sales = useMemo(() => directory.sales.filter((item) => `${item.sale_code} ${item.customer_name}`.toLowerCase().includes(query.toLowerCase())), [directory.sales, query]);
  const expenses = useMemo(() => directory.expenses.filter((item) => `${item.expense_code} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [directory.expenses, query]);
  const salePage = useListPage(sales, query);
  const expensePage = useListPage(expenses, query);
  const received = roundMoney(directory.sales.reduce((sum, item) => sum + item.amount_received, 0));
  const soldKg = directory.sales.filter((item) => item.status !== "Cancelled").reduce((sum, item) => sum + item.quantity_kg, 0);

  function open(next: NonNullable<typeof mode>, seed: Record<string, string> = {}) {
    setMode(next);
    setDraft(seed);
    setRequestKey(crypto.randomUUID());
    setSaveState("idle");
    setError("");
    setMenu(null);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle" || !mode) return;
    setSaveState("saving");
    setError("");
    try {
      const data = mode === "sale"
        ? await saveJson("/api/beekeeping/sales", "POST", { ...draft, quantity_kg: Number(draft.quantity_kg), price_per_kg: Number(draft.price_per_kg) })
        : mode === "edit-sale" && sale
          ? await saveJson(`/api/beekeeping/sales/${sale.id}`, "PATCH", draft)
          : mode === "pay-sale" && sale
            ? await saveJson(`/api/beekeeping/sales/${sale.id}/payments`, "POST", { ...draft, amount: Number(draft.amount), request_key: requestKey })
            : mode === "expense"
              ? await saveJson("/api/beekeeping/expenses", "POST", { ...draft, amount: Number(draft.amount) })
              : mode === "edit-expense" && expense
                ? await saveJson(`/api/beekeeping/expenses/${expense.id}`, "PATCH", { ...draft, amount: Number(draft.amount) })
                : await saveJson(`/api/beekeeping/expenses/${expense?.id}/payments`, "POST", { ...draft, amount: Number(draft.amount), request_key: requestKey });
      setDirectory(data.directory);
      setSaveState("saved");
      setTimeout(() => { setMode(null); setSelectedSale(null); setSelectedExpense(null); }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaveState("idle");
    }
  }

  async function cancel(kind: "sale" | "expense", id: string) {
    setMenu(null);
    try {
      const data = await saveJson(kind === "sale" ? `/api/beekeeping/sales/${id}` : `/api/beekeeping/expenses/${id}`, "PATCH", { cancel: true });
      setDirectory(data.directory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  const preview = roundMoney(Number(draft.quantity_kg || 0) * Number(draft.price_per_kg || 0));

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Sales & Expenses</h1><p className="text-sm text-slate-500">Honey stock, sales, payments, and beekeeping expenses.</p></div>
        <button type="button" onClick={() => tab === "sales" ? open("sale", { sale_date: businessToday(), quantity_kg: "", price_per_kg: "", customer_name: "", phone: "", notes: "" }) : open("expense", { expense_date: businessToday(), category: EXPENSE_CATEGORIES[0], description: "", amount: "", location: "", hive_id: "", vendor_name: "", due_date: "", notes: "" })} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">{tab === "sales" ? "+ Add Sale" : "+ Add Expense"}</button>
      </div>
      <div id="stock" className="grid grid-cols-3 gap-3">
        <Card label="Harvested" value={`${directory.stock.harvested} kg`} /><Card label="Sold" value={`${directory.stock.sold} kg`} /><Card label="Available" value={`${directory.stock.available} kg`} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("sales")} className={`rounded-xl px-4 py-2 text-sm ${tab === "sales" ? "bg-[#0b2244] text-white" : "bg-white"}`}>Sales</button>
        <button type="button" onClick={() => setTab("expenses")} className={`rounded-xl px-4 py-2 text-sm ${tab === "expenses" ? "bg-[#0b2244] text-white" : "bg-white"}`}>Expenses</button>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      {error && !mode && <p className="text-sm text-red-600">{error}</p>}
      {tab === "sales" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Sales value" value={formatTzs(directory.sales.filter((item) => item.status !== "Cancelled").reduce((sum, item) => sum + item.total_amount, 0))} />
            <Card label="Received" value={formatTzs(received)} />
            <Card label="Outstanding" value={formatTzs(directory.sales.reduce((sum, item) => sum + item.balance, 0))} />
            <Card label="Quantity sold" value={`${soldKg} kg`} />
          </div>
          <Table headers={["Sale", "Date", "Customer", "Qty", "Price/kg", "Total", "Received", "Balance", "Status", ""]}>
            {sales.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No sales yet.</td></tr> : salePage.rows.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium">{item.sale_code}</td><td className="px-3 py-3">{formatDate(item.sale_date)}</td><td className="px-3 py-3">{item.customer_name || "—"}</td><td className="px-3 py-3">{item.quantity_kg} kg</td><td className="px-3 py-3">{formatTzs(item.price_per_kg)}</td><td className="px-3 py-3">{formatTzs(item.total_amount)}</td><td className="px-3 py-3">{formatTzs(item.amount_received)}</td><td className="px-3 py-3">{formatTzs(item.balance)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                <td className="relative px-3 py-3"><button type="button" aria-label="Sale actions" onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreVertical size={16} /></button>{menu === item.id && <div className="absolute right-2 z-20 w-40 rounded-2xl border bg-white py-1 shadow-xl"><RowButton label="View Details" onClick={() => { setSelectedSale(item); setMenu(null); }} /><RowButton label="Edit Sale" onClick={() => { setSale(item); open("edit-sale", { customer_name: item.customer_name, phone: item.phone, price_per_kg: String(item.price_per_kg), notes: item.notes }); }} /><RowButton label="Record Payment" onClick={() => { setSale(item); open("pay-sale", { amount: String(item.balance), payment_date: businessToday(), payment_method: "Cash", transaction_reference: "", notes: "" }); }} /><RowButton label="Cancel Sale" onClick={() => cancel("sale", item.id)} /></div>}</td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={salePage.page} total={sales.length} pageSize={salePage.pageSize} onPage={salePage.setPage} onPageSize={salePage.setPageSize} />
        </>
      ) : (
        <>
          <Table headers={["Expense", "Description", "Category", "Date", "Hive", "Amount", "Paid", "Balance", "Status", ""]}>
            {expenses.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No expenses yet.</td></tr> : expensePage.rows.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium">{item.expense_code}</td><td className="px-3 py-3">{item.description}</td><td className="px-3 py-3">{item.category}</td><td className="px-3 py-3">{formatDate(item.expense_date)}</td><td className="px-3 py-3">{item.hive_code || item.location || "—"}</td><td className="px-3 py-3">{formatTzs(item.amount)}</td><td className="px-3 py-3">{formatTzs(item.amount_paid)}</td><td className="px-3 py-3">{formatTzs(item.balance)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                <td className="relative px-3 py-3"><button type="button" aria-label="Expense actions" onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreVertical size={16} /></button>{menu === item.id && <div className="absolute right-2 z-20 w-44 rounded-2xl border bg-white py-1 shadow-xl"><RowButton label="View Details" onClick={() => { setSelectedExpense(item); setMenu(null); }} /><RowButton label="Edit Expense" onClick={() => { setExpense(item); open("edit-expense", { category: item.category, description: item.description, amount: String(item.amount), expense_date: item.expense_date, due_date: item.due_date, location: item.location, hive_id: item.hive_id, vendor_name: item.vendor_name, notes: item.notes }); }} /><RowButton label="Record Payment" onClick={() => { setExpense(item); open("pay-expense", { amount: String(item.balance), payment_date: businessToday(), payment_method: "Cash", transaction_reference: "", notes: "" }); }} /><RowButton label="Cancel Expense" onClick={() => cancel("expense", item.id)} /></div>}</td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={expensePage.page} total={expenses.length} pageSize={expensePage.pageSize} onPage={expensePage.setPage} onPageSize={expensePage.setPageSize} />
        </>
      )}

      {mode && (
        <div className={overlayClass}>
          <form onSubmit={handleSave} className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-bold">{mode.includes("pay") ? "Record Payment" : mode.includes("edit") ? "Edit" : mode === "sale" ? "Add Sale" : "Add Expense"}</h3>
            {mode === "sale" && <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Date<input required type="date" value={draft.sale_date || ""} onChange={(event) => setDraft({ ...draft, sale_date: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Quantity (kg)<input required type="number" min="0.001" step="0.001" value={draft.quantity_kg || ""} onChange={(event) => setDraft({ ...draft, quantity_kg: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Price per kg<input required type="number" min="0" step="1" value={draft.price_per_kg || ""} onChange={(event) => setDraft({ ...draft, price_per_kg: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Customer<input value={draft.customer_name || ""} onChange={(event) => setDraft({ ...draft, customer_name: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm col-span-2">Phone<input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={fieldClass} /></label>
              </div>
              <p className="mt-3 text-sm">Total {formatTzs(preview)}. Available stock {directory.stock.available} kg.</p>
            </>}
            {mode === "edit-sale" && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Customer<input value={draft.customer_name || ""} onChange={(event) => setDraft({ ...draft, customer_name: event.target.value })} className={fieldClass} /></label><label className="text-sm">Phone<input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={fieldClass} /></label><label className="text-sm col-span-2">Price per kg<input required type="number" min="0" value={draft.price_per_kg || ""} onChange={(event) => setDraft({ ...draft, price_per_kg: event.target.value })} className={fieldClass} /></label></div>}
            {(mode === "expense" || mode === "edit-expense") && <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Date<input required type="date" value={draft.expense_date || ""} onChange={(event) => setDraft({ ...draft, expense_date: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Category<select value={draft.category || ""} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className={fieldClass}>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm col-span-2">Description<input required value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Amount<input required type="number" min="1" step="1" value={draft.amount || ""} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Due date<input type="date" value={draft.due_date || ""} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Location<input value={draft.location || ""} onChange={(event) => setDraft({ ...draft, location: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Related hive<select value={draft.hive_id || ""} onChange={(event) => setDraft({ ...draft, hive_id: event.target.value })} className={fieldClass}><option value="">None</option>{directory.hives.map((hive) => <option key={hive.id} value={hive.id}>{hive.hive_code}</option>)}</select></label>
              <label className="text-sm col-span-2">Vendor<input value={draft.vendor_name || ""} onChange={(event) => setDraft({ ...draft, vendor_name: event.target.value })} className={fieldClass} /></label>
            </div>}
            {mode.includes("pay") && <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Amount<input required type="number" min="1" step="1" value={draft.amount || ""} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Date<input required type="date" value={draft.payment_date || ""} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Method<select value={draft.payment_method || "Cash"} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} className={fieldClass}>{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm">Reference<input value={draft.transaction_reference || ""} onChange={(event) => setDraft({ ...draft, transaction_reference: event.target.value })} className={fieldClass} /></label>
            </div>}
            <label className="mt-3 block text-sm">Notes<textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} className={fieldClass} /></label>
            <div className="mt-4 flex gap-3"><SaveButton state={saveState} label="Save" /><button type="button" onClick={() => setMode(null)} className="rounded-xl border px-4 py-2">Cancel</button></div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}

      {selectedSale && <Drawer title={selectedSale.sale_code} onClose={() => setSelectedSale(null)}>
        <p>{selectedSale.customer_name || "No customer"} · {selectedSale.phone || "No phone"}</p>
        <p>{selectedSale.quantity_kg} kg at {formatTzs(selectedSale.price_per_kg)} = {formatTzs(selectedSale.total_amount)}</p>
        <p>Received {formatTzs(selectedSale.amount_received)} · Balance {formatTzs(selectedSale.balance)} · {selectedSale.status}</p>
        <h3 className="mt-4 text-xs font-bold uppercase text-slate-400">Stock allocations</h3>
        {selectedSale.allocations.map((allocation) => <p key={allocation.id}>{allocation.harvest_code}: {allocation.quantity_kg} kg · {allocation.status}</p>)}
        <h3 className="mt-4 text-xs font-bold uppercase text-slate-400">Payments</h3>
        {selectedSale.payments.map((payment) => <p key={payment.id}>{formatDate(payment.payment_date)} · {formatTzs(payment.amount)} · {payment.payment_method} · {payment.status}</p>)}
      </Drawer>}
      {selectedExpense && <Drawer title={selectedExpense.expense_code} onClose={() => setSelectedExpense(null)}>
        <p>{selectedExpense.category} · {selectedExpense.description}</p>
        <p>{formatTzs(selectedExpense.amount)} · Paid {formatTzs(selectedExpense.amount_paid)} · Balance {formatTzs(selectedExpense.balance)}</p>
        <p>{selectedExpense.hive_code || "No hive"} · {selectedExpense.location || "No location"} · {selectedExpense.vendor_name || "No vendor"}</p>
        {selectedExpense.payments.map((payment) => <p key={payment.id}>{formatDate(payment.payment_date)} · {formatTzs(payment.amount)} · {payment.status}</p>)}
      </Drawer>}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl bg-white shadow-sm"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={onClick}>{label}</button>;
}
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="mt-[72px] mr-4 mb-4 h-[calc(100vh-72px)] w-full space-y-2 overflow-y-auto rounded-3xl bg-white p-8 text-sm shadow-2xl sm:w-[480px]"><div className="flex justify-between"><h2 className="text-2xl font-extrabold">{title}</h2><button type="button" onClick={onClose} aria-label="Close">✕</button></div>{children}</aside></div>;
}
