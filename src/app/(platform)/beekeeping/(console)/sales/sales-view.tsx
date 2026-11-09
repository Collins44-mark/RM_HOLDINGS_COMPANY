"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { useListPage } from "@/lib/property/use-list-page";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, businessToday, roundMoney } from "@/lib/beekeeping/constants";
import { beePeriodWindow, inWindow } from "@/lib/beekeeping/period";
import type { BeeDirectory, BeeExpense, BeeSale } from "@/lib/beekeeping/directory";
import { useAuth } from "@/components/auth/AuthProvider";
import { ActionMenu, ActionMenuItem, SaveButton, fieldClass, formatDate, overlayClass, placeActionMenu, saveJson, statusClass } from "../bee-ui";

export default function SalesView({ initial, initialTab }: { initial: BeeDirectory; initialTab: "sales" | "expenses" }) {
  const { hasAnyPermission } = useAuth();
  const canSales = hasAnyPermission(["beekeeping.sales.view", "beekeeping.sales.create", "beekeeping.sales.edit", "beekeeping.sales.pay", "beekeeping.sales.cancel"]);
  const canExpenses = hasAnyPermission(["beekeeping.expenses.view", "beekeeping.expenses.create", "beekeeping.expenses.edit", "beekeeping.expenses.pay", "beekeeping.expenses.cancel"]);
  const canAddSale = hasAnyPermission(["beekeeping.sales.create"]);
  const canAddExpense = hasAnyPermission(["beekeeping.expenses.create"]);
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
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const range = beePeriodWindow(period === "custom" && fromDate && toDate && fromDate <= toDate ? "custom" : period === "custom" ? "month" : period, fromDate, toDate);
  const sales = useMemo(() => directory.sales.filter((item) => `${item.sale_code} ${item.customer_name}`.toLowerCase().includes(query.toLowerCase()) && inWindow(item.sale_date, range.from, range.to)), [directory.sales, query, range.from, range.to]);
  const expenses = useMemo(() => directory.expenses.filter((item) => `${item.expense_code} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase()) && inWindow(item.expense_date, range.from, range.to)), [directory.expenses, query, range.from, range.to]);
  const salePage = useListPage(sales, `${query}|${range.from}|${range.to}`);
  const expensePage = useListPage(expenses, `${query}|${range.from}|${range.to}`);
  const menuSale = directory.sales.find((item) => item.id === menu) || null;
  const menuExpense = directory.expenses.find((item) => item.id === menu) || null;
  const openSales = sales.filter((item) => item.status !== "Cancelled");
  const received = roundMoney(openSales.reduce((sum, item) => sum + item.amount_received, 0));
  const soldKg = openSales.reduce((sum, item) => sum + item.quantity_kg, 0);

  function openMenu(event: React.MouseEvent<HTMLButtonElement>, id: string, itemCount: number) {
    if (menu === id) {
      setMenu(null);
      return;
    }
    setMenuPos(placeActionMenu(event.currentTarget.getBoundingClientRect(), itemCount));
    setMenu(id);
  }

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
        ? await saveJson("/api/beekeeping/sales", "POST", { ...draft, quantity_kg: Number(draft.quantity_kg), price_per_kg: Number(draft.price_per_kg), amount_paid: draft.amount_paid ? Number(draft.amount_paid) : 0, request_key: requestKey })
        : mode === "edit-sale" && sale
          ? await saveJson(`/api/beekeeping/sales/${sale.id}`, "PATCH", draft)
          : mode === "pay-sale" && sale
            ? await saveJson(`/api/beekeeping/sales/${sale.id}/payments`, "POST", { ...draft, amount: Number(draft.amount), request_key: requestKey })
            : mode === "expense"
              ? await saveJson("/api/beekeeping/expenses", "POST", { ...draft, amount: Number(draft.amount) })
              : mode === "edit-expense" && expense
                ? await saveJson(`/api/beekeeping/expenses/${expense.id}`, "PATCH", { ...draft, amount: Number(draft.amount) })
                : await saveJson(`/api/beekeeping/expenses/${expense?.id}/payments`, "POST", { ...draft, amount: Number(draft.amount), request_key: requestKey });
      if (data.queued) {
        setSaveState("saved");
        setTimeout(() => { setMode(null); setSelectedSale(null); setSelectedExpense(null); }, 500);
        return;
      }
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
      if (!data.queued) setDirectory(data.directory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  const preview = roundMoney(Number(draft.quantity_kg || 0) * Number(draft.price_per_kg || 0));
  const activeTab = canSales && (tab === "sales" || !canExpenses) ? "sales" : "expenses";
  const canAdd = activeTab === "sales" ? canAddSale : canAddExpense;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Sales & Expenses</h1><p className="text-sm text-slate-500">Honey stock, sales, payments, and beekeeping expenses.</p></div>
        {canAdd ? <button type="button" onClick={() => activeTab === "sales" ? open("sale", { sale_date: businessToday(), quantity_kg: "", price_per_kg: "", customer_name: "", phone: "", notes: "", amount_paid: "", payment_method: "Cash", payment_date: businessToday(), transaction_reference: "" }) : open("expense", { expense_date: businessToday(), category: EXPENSE_CATEGORIES[0], description: "", amount: "", location: "", hive_id: "", vendor_name: "", due_date: "", notes: "" })} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">{activeTab === "sales" ? "+ Add Sale" : "+ Add Expense"}</button> : null}
      </div>
      <div id="stock" className="grid grid-cols-3 gap-3">
        <Card label="Harvested" value={`${directory.stock.harvested} kg`} /><Card label="Sold" value={`${directory.stock.sold} kg`} /><Card label="Available" value={`${directory.stock.available} kg`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canSales ? <button type="button" onClick={() => setTab("sales")} className={`rounded-xl px-4 py-2 text-sm ${activeTab === "sales" ? "bg-[#0b2244] text-white" : "bg-white"}`}>Sales</button> : null}
        {canExpenses ? <button type="button" onClick={() => setTab("expenses")} className={`rounded-xl px-4 py-2 text-sm ${activeTab === "expenses" ? "bg-[#0b2244] text-white" : "bg-white"}`}>Expenses</button> : null}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Period" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="week">This Week</option>
          <option value="today">Today</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom range</option>
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          </>
        )}
      </div>
      {error && !mode && <p className="text-sm text-red-600">{error}</p>}
      {activeTab === "sales" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Sales value" value={formatTzs(openSales.reduce((sum, item) => sum + item.total_amount, 0))} />
            <Card label="Received" value={formatTzs(received)} />
            <Card label="Outstanding" value={formatTzs(openSales.reduce((sum, item) => sum + item.balance, 0))} />
            <Card label="Quantity sold" value={`${soldKg} kg`} />
          </div>
          <Table headers={["Sale", "Customer", "Qty", "Price/kg", "Total", "Received", "Balance", "Status", ""]}>
            {sales.length === 0 ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No sales in this period.</td></tr> : salePage.rows.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium">{item.sale_code}</td><td className="px-3 py-3">{item.customer_name || "—"}</td><td className="px-3 py-3">{item.quantity_kg} kg</td><td className="px-3 py-3">{formatTzs(item.price_per_kg)}</td><td className="px-3 py-3">{formatTzs(item.total_amount)}</td><td className="px-3 py-3">{formatTzs(item.amount_received)}</td><td className="px-3 py-3">{formatTzs(item.balance)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                <td className="px-3 py-3 text-right"><button type="button" aria-label="Sale actions" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => openMenu(event, item.id, 4)}><MoreVertical size={16} /></button></td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={salePage.page} total={sales.length} pageSize={salePage.pageSize} onPage={salePage.setPage} onPageSize={salePage.setPageSize} />
        </>
      ) : (
        <>
          <Table headers={["Expense", "Description", "Category", "Hive", "Amount", "Paid", "Balance", "Status", ""]}>
            {expenses.length === 0 ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No expenses in this period.</td></tr> : expensePage.rows.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3 font-medium">{item.expense_code}</td><td className="px-3 py-3">{item.description}</td><td className="px-3 py-3">{item.category}</td><td className="px-3 py-3">{item.hive_code || item.location || "—"}</td><td className="px-3 py-3">{formatTzs(item.amount)}</td><td className="px-3 py-3">{formatTzs(item.amount_paid)}</td><td className="px-3 py-3">{formatTzs(item.balance)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                <td className="px-3 py-3 text-right"><button type="button" aria-label="Expense actions" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => openMenu(event, item.id, 4)}><MoreVertical size={16} /></button></td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={expensePage.page} total={expenses.length} pageSize={expensePage.pageSize} onPage={expensePage.setPage} onPageSize={expensePage.setPageSize} />
        </>
      )}

      {menuSale ? (
        <ActionMenu top={menuPos.top} left={menuPos.left} onClose={() => setMenu(null)}>
          <ActionMenuItem label="View Details" onClick={() => { setSelectedSale(menuSale); setMenu(null); }} />
          <ActionMenuItem label="Edit Sale" onClick={() => { setSale(menuSale); open("edit-sale", { customer_name: menuSale.customer_name, phone: menuSale.phone, price_per_kg: String(menuSale.price_per_kg), notes: menuSale.notes }); }} />
          <ActionMenuItem label="Record Payment" onClick={() => { setSale(menuSale); open("pay-sale", { amount: String(menuSale.balance), payment_date: businessToday(), payment_method: "Cash", transaction_reference: "", notes: "" }); }} />
          <ActionMenuItem label="Cancel Sale" onClick={() => cancel("sale", menuSale.id)} />
        </ActionMenu>
      ) : null}
      {menuExpense ? (
        <ActionMenu top={menuPos.top} left={menuPos.left} onClose={() => setMenu(null)}>
          <ActionMenuItem label="View Details" onClick={() => { setSelectedExpense(menuExpense); setMenu(null); }} />
          <ActionMenuItem label="Edit Expense" onClick={() => { setExpense(menuExpense); open("edit-expense", { category: menuExpense.category, description: menuExpense.description, amount: String(menuExpense.amount), expense_date: menuExpense.expense_date, due_date: menuExpense.due_date, location: menuExpense.location, hive_id: menuExpense.hive_id, vendor_name: menuExpense.vendor_name, notes: menuExpense.notes }); }} />
          <ActionMenuItem label="Record Payment" onClick={() => { setExpense(menuExpense); open("pay-expense", { amount: String(menuExpense.balance), payment_date: businessToday(), payment_method: "Cash", transaction_reference: "", notes: "" }); }} />
          <ActionMenuItem label="Cancel Expense" onClick={() => cancel("expense", menuExpense.id)} />
        </ActionMenu>
      ) : null}

      {mode && (
        <div className={overlayClass}>
          <form onSubmit={handleSave} className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-bold">{mode.includes("pay") ? "Record Payment" : mode.includes("edit") ? "Edit" : mode === "sale" ? "Add Sale" : "Add Expense"}</h3>
            {mode === "sale" && <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Date<input required type="date" value={draft.sale_date || ""} onChange={(event) => setDraft({ ...draft, sale_date: event.target.value, payment_date: draft.payment_date === draft.sale_date ? event.target.value : draft.payment_date })} className={fieldClass} /></label>
                <label className="text-sm">Quantity (kg)<input required type="number" min="0.001" step="0.001" value={draft.quantity_kg || ""} onChange={(event) => setDraft({ ...draft, quantity_kg: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Price per kg<input required type="number" min="0" step="1" value={draft.price_per_kg || ""} onChange={(event) => setDraft({ ...draft, price_per_kg: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Customer<input value={draft.customer_name || ""} onChange={(event) => setDraft({ ...draft, customer_name: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm col-span-2">Phone<input value={draft.phone || ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={fieldClass} /></label>
              </div>
              <p className="mt-3 text-sm">Total {formatTzs(preview)}. Available stock {directory.stock.available} kg.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm">Amount paid<input type="number" min="0" step="1" value={draft.amount_paid || ""} onChange={(event) => setDraft({ ...draft, amount_paid: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Payment date<input type="date" value={draft.payment_date || ""} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Method<select value={draft.payment_method || "Cash"} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} className={fieldClass}>{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="text-sm">Reference<input value={draft.transaction_reference || ""} onChange={(event) => setDraft({ ...draft, transaction_reference: event.target.value })} className={fieldClass} /></label>
              </div>
              <p className="mt-2 text-sm text-slate-500">Balance {formatTzs(Math.max(0, roundMoney(preview - Number(draft.amount_paid || 0))))}. Leave amount paid empty if nothing was received.</p>
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

      {selectedSale && <Drawer title={selectedSale.sale_code} subtitle={formatDate(selectedSale.sale_date)} status={selectedSale.status} onClose={() => setSelectedSale(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer" value={selectedSale.customer_name || "—"} />
          <Field label="Phone" value={selectedSale.phone || "—"} />
          <Field label="Quantity" value={`${selectedSale.quantity_kg} kg`} />
          <Field label="Price per kg" value={formatTzs(selectedSale.price_per_kg)} />
          <Field label="Total" value={formatTzs(selectedSale.total_amount)} />
          <Field label="Received" value={formatTzs(selectedSale.amount_received)} />
          <Field label="Balance" value={formatTzs(selectedSale.balance)} />
          <Field label="Status" value={selectedSale.status} />
        </div>
        {selectedSale.notes ? <p className="mt-4 text-sm text-slate-600">{selectedSale.notes}</p> : null}
        <Section title="Honey taken from">
          {selectedSale.allocations.length === 0 ? <EmptyLine text="No harvest was allocated." /> : selectedSale.allocations.map((allocation) => (
            <Row key={allocation.id} title={allocation.harvest_code} detail={`${allocation.quantity_kg} kg`} extra={allocation.status} />
          ))}
        </Section>
        <Section title="Payments">
          {selectedSale.payments.length === 0 ? <EmptyLine text="No payment recorded." /> : selectedSale.payments.map((payment) => (
            <Row key={payment.id} title={formatTzs(payment.amount)} detail={`${formatDate(payment.payment_date)} · ${payment.payment_method}${payment.transaction_reference ? ` · ${payment.transaction_reference}` : ""}`} extra={payment.status} />
          ))}
        </Section>
      </Drawer>}
      {selectedExpense && <Drawer title={selectedExpense.expense_code} subtitle={formatDate(selectedExpense.expense_date)} status={selectedExpense.status} onClose={() => setSelectedExpense(null)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" value={selectedExpense.category} />
          <Field label="Description" value={selectedExpense.description} />
          <Field label="Amount" value={formatTzs(selectedExpense.amount)} />
          <Field label="Paid" value={formatTzs(selectedExpense.amount_paid)} />
          <Field label="Balance" value={formatTzs(selectedExpense.balance)} />
          <Field label="Due date" value={formatDate(selectedExpense.due_date)} />
          <Field label="Hive" value={selectedExpense.hive_code || "—"} />
          <Field label="Location" value={selectedExpense.location || "—"} />
          <Field label="Vendor" value={selectedExpense.vendor_name || "—"} />
          <Field label="Status" value={selectedExpense.status} />
        </div>
        {selectedExpense.notes ? <p className="mt-4 text-sm text-slate-600">{selectedExpense.notes}</p> : null}
        <Section title="Payments">
          {selectedExpense.payments.length === 0 ? <EmptyLine text="No payment recorded." /> : selectedExpense.payments.map((payment) => (
            <Row key={payment.id} title={formatTzs(payment.amount)} detail={`${formatDate(payment.payment_date)} · ${payment.payment_method}${payment.transaction_reference ? ` · ${payment.transaction_reference}` : ""}`} extra={payment.status} />
          ))}
        </Section>
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
function Drawer({ title, subtitle, status, onClose, children }: { title: string; subtitle: string; status: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="mt-[72px] mr-4 mb-4 h-[calc(100vh-72px)] w-full overflow-y-auto rounded-3xl border border-slate-100 bg-white p-8 shadow-2xl sm:w-[480px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(status)}`}>{status}</span>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </aside>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value}</p></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6"><h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3><div className="mt-2 divide-y divide-slate-100">{children}</div></section>;
}
function Row({ title, detail, extra }: { title: string; detail: string; extra: string }) {
  return <div className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-900">{title}</p><p className="text-xs text-slate-500">{detail}</p></div><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(extra)}`}>{extra}</span></div>;
}
function EmptyLine({ text }: { text: string }) {
  return <p className="py-3 text-sm text-slate-500">{text}</p>;
}
