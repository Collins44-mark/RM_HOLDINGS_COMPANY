"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { useListPage } from "@/lib/property/use-list-page";
import { PAYMENT_METHODS, businessToday, summarizeInvoices, type InvoiceContractOption, type InvoiceRecord } from "@/lib/property/invoices";
import { nextSerial } from "@/lib/property/serial";

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function statusClass(status: string) {
  if (status === "Paid") return "bg-emerald-50 text-emerald-700";
  if (status === "Partially Paid") return "bg-sky-50 text-sky-700";
  if (status === "Overdue") return "bg-rose-50 text-rose-700";
  if (status === "Cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`px-4 py-2 rounded-xl font-semibold min-w-[140px] flex items-center justify-center gap-2 ${state === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
      {state === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : state === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : label}
    </button>
  );
}

type Draft = {
  contract_id: string;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  rent_amount: string;
  additional_charges: string;
  discount: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  contract_id: "",
  billing_period_start: "",
  billing_period_end: "",
  issue_date: businessToday(),
  due_date: "",
  rent_amount: "",
  additional_charges: "0",
  discount: "0",
  notes: "",
});

function draftFrom(invoice: InvoiceRecord): Draft {
  return {
    contract_id: invoice.contract_id,
    billing_period_start: invoice.billing_period_start,
    billing_period_end: invoice.billing_period_end,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    rent_amount: String(invoice.rent_amount),
    additional_charges: String(invoice.additional_charges),
    discount: String(invoice.discount),
    notes: invoice.notes || "",
  };
}

export default function InvoicesView({ initialItems, contracts }: { initialItems: InvoiceRecord[]; contracts: InvoiceContractOption[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | "pay" | null>(null);
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [contractQuery, setContractQuery] = useState("");
  const [payment, setPayment] = useState({ payment_date: businessToday(), amount: "", payment_method: "Cash", transaction_reference: "", notes: "" });
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<InvoiceRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRecord | null>(null);
  const [cancelState, setCancelState] = useState("idle");
  const [cancelError, setCancelError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const invoice of items) if (invoice.property_id) map.set(invoice.property_id, invoice.property_name);
    return [...map.entries()];
  }, [items]);
  const tenants = useMemo(() => {
    const map = new Map<string, string>();
    for (const invoice of items) if (invoice.tenant_id) map.set(invoice.tenant_id, invoice.tenant_name);
    return [...map.entries()];
  }, [items]);
  const visible = items.filter((invoice) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [invoice.invoice_number, invoice.tenant_name, invoice.property_name, invoice.unit_name, invoice.contract_number].some((value) => value.toLowerCase().includes(text));
    const matchesStatus = !statusFilter || invoice.effective_status === statusFilter;
    const matchesProperty = !propertyFilter || invoice.property_id === propertyFilter;
    const matchesTenant = !tenantFilter || invoice.tenant_id === tenantFilter;
    const matchesPeriod = !periodFilter || invoice.billing_period_start.startsWith(periodFilter);
    return matchesText && matchesStatus && matchesProperty && matchesTenant && matchesPeriod;
  });
  const listPage = useListPage(visible, `${query}|${statusFilter}|${propertyFilter}|${tenantFilter}|${periodFilter}`);
  const summary = useMemo(() => summarizeInvoices(items), [items]);
  const selectedContract = contracts.find((contract) => contract.id === draft.contract_id);
  const locked = formMode === "edit" && !!editing && editing.amount_paid > 0;
  const previewTotal = Math.max(0, Number(draft.rent_amount || 0) + Number(draft.additional_charges || 0) - Number(draft.discount || 0));
  const contractChoices = contracts.filter((contract) => {
    const text = contractQuery.trim().toLowerCase();
    return !text || [contract.contract_number, contract.tenant_name, contract.property_name, contract.unit_name].some((value) => value.toLowerCase().includes(text));
  });

  function replaceInvoice(invoice: InvoiceRecord) {
    setItems((current) => {
      const exists = current.some((item) => item.id === invoice.id);
      return exists ? current.map((item) => (item.id === invoice.id ? invoice : item)) : [invoice, ...current];
    });
    setSelected((current) => (current?.id === invoice.id ? invoice : current));
  }

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFormMode("create");
    setSaveState("idle");
    setSaveError("");
    setNotice("");
    setContractQuery("");
  }

  function openEdit(invoice: InvoiceRecord) {
    setEditing(invoice);
    setDraft(draftFrom(invoice));
    setFormMode("edit");
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
    setNotice("");
  }

  function openPay(invoice: InvoiceRecord) {
    setEditing(invoice);
    setPayment({ payment_date: businessToday(), amount: String(invoice.balance || ""), payment_method: "Cash", transaction_reference: "", notes: "" });
    setFormMode("pay");
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
  }

  function chooseContract(contractId: string) {
    const contract = contracts.find((item) => item.id === contractId);
    setDraft((current) => ({
      ...current,
      contract_id: contractId,
      rent_amount: contract ? String(contract.rent_amount) : current.rent_amount,
      billing_period_start: current.billing_period_start || contract?.start_date || "",
      due_date: current.due_date || (contract ? `${(current.billing_period_start || contract.start_date).slice(0, 8)}${String(contract.payment_due_day).padStart(2, "0")}` : ""),
    }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setSaveError("");
    const payload = formMode === "pay"
      ? { ...payment, amount: Number(payment.amount) }
      : {
          ...draft,
          rent_amount: Number(draft.rent_amount),
          additional_charges: Number(draft.additional_charges || 0),
          discount: Number(draft.discount || 0),
        };
    const url = formMode === "edit" && editing ? `/api/property/invoices/${editing.id}` : formMode === "pay" && editing ? `/api/property/invoices/${editing.id}/payments` : "/api/property/invoices";
    try {
      const response = await fetch(url, {
        method: formMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        setSaveError(data.error || "Save failed");
        setSaveState("idle");
        return;
      }
      replaceInvoice(data.data);
      setNotice(data.notice || "");
      setSaveState("saved");
      window.setTimeout(() => {
        setFormMode(null);
        setSaveState("idle");
      }, 700);
    } catch {
      setSaveError("Save failed");
      setSaveState("idle");
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || cancelState !== "idle") return;
    setCancelState("saving");
    setCancelError("");
    try {
      const response = await fetch(`/api/property/invoices/${cancelTarget.id}/cancel`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        setCancelError(data.error || "Cancel failed");
        setCancelState("idle");
        return;
      }
      replaceInvoice(data.data);
      setCancelTarget(null);
      setCancelState("idle");
    } catch {
      setCancelError("Cancel failed");
      setCancelState("idle");
    }
  }

  return (
    <div className="pb-10 text-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rent Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">Manage rental invoices, payments, and outstanding balances.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">+ Create Invoice</button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total Invoices", summary.total],
          ["Paid", summary.paid],
          ["Unpaid", summary.unpaid],
          ["Overdue", summary.overdue],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Total Invoiced", summary.invoiced],
          ["Total Collected", summary.collected],
          ["Outstanding Balance", summary.outstanding],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-lg font-semibold">{formatTzs(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoices" className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {["Paid", "Unpaid", "Partially Paid", "Overdue", "Cancelled"].map((status) => <option key={status}>{status}</option>)}
        </select>
        <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">All properties</option>
          {properties.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">All tenants</option>
          {tenants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input type="month" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
      </div>

      <div className="mt-4 rounded-2xl bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Invoice No.</th>
              <th>Tenant</th>
              <th>Property / Unit</th>
              <th>Billing Period</th>
              <th>Due Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No invoices yet.</td></tr>
            ) : listPage.rows.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                <td>{invoice.tenant_name || "—"}</td>
                <td>{invoice.property_name || "—"} / {invoice.unit_name || "—"}</td>
                <td>{formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}</td>
                <td>{formatDate(invoice.due_date)}</td>
                <td>{formatTzs(invoice.total_amount)}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(invoice.effective_status)}`}>{invoice.effective_status}</span></td>
                <td className="pr-3 text-right">
                  <button type="button" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, left: rect.right - 180 });
                    setOpenMenuId(openMenuId === invoice.id ? null : invoice.id);
                  }}><MoreVertical size={16} /></button>
                  {openMenuId === invoice.id ? (
                    <div className="fixed z-40 w-44 rounded-xl border border-slate-200 bg-white py-1 text-left shadow-lg" style={{ top: menuPos.top, left: menuPos.left }}>
                      <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setSelected(invoice); setOpenMenuId(null); }}>View Invoice</button>
                      <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => openEdit(invoice)}>Edit Invoice</button>
                      {invoice.effective_status !== "Paid" && invoice.effective_status !== "Cancelled" ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => openPay(invoice)}>Record Payment</button> : null}
                      <a className="block px-3 py-2 hover:bg-slate-50" href={`/property/invoices/${invoice.id}/print`} target="_blank" rel="noreferrer" onClick={() => setOpenMenuId(null)}>Download / Print</a>
                      {invoice.effective_status !== "Cancelled" ? <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-slate-50" onClick={() => { setCancelTarget(invoice); setCancelError(""); setCancelState("idle"); setOpenMenuId(null); }}>Cancel Invoice</button> : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="px-4"><PaginationBar page={listPage.page} total={visible.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
      </div>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSave} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">{formMode === "pay" ? "Record Payment" : formMode === "edit" ? "Edit Invoice" : "Create Invoice"}</h2>
            {formMode === "pay" && editing ? (
              <div className="mt-4 space-y-3 text-sm">
                <p>Invoice <strong>{editing.invoice_number}</strong></p>
                <p>Tenant <strong>{editing.tenant_name}</strong></p>
                <p>Outstanding <strong>{formatTzs(editing.balance)}</strong></p>
                <label className="block">Payment date<input type="date" required value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
                <label className="block">Amount received<input type="number" min="1" step="0.01" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
                <label className="block">Payment method<select value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
                <label className="block">Transaction reference<input value={payment.transaction_reference} onChange={(event) => setPayment({ ...payment, transaction_reference: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
                <label className="block">Notes<textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {formMode === "create" ? (
                  <label className="sm:col-span-2 block">Select Contract
                    <input value={contractQuery} onChange={(event) => setContractQuery(event.target.value)} placeholder="Search contracts" className="mt-1 w-full rounded-xl border px-3 py-2" />
                    <select required value={draft.contract_id} onChange={(event) => chooseContract(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2">
                      <option value="">Select a contract</option>
                      {contractChoices.map((contract) => <option key={contract.id} value={contract.id}>{contract.contract_number} · {contract.tenant_name} · {contract.property_name} / {contract.unit_name}</option>)}
                    </select>
                  </label>
                ) : null}
                <p>Invoice number<br /><strong>{formMode === "edit" ? editing?.invoice_number : nextSerial(items.map((invoice) => invoice.invoice_number), "INV", 1)}</strong></p>
                <p>Tenant<br /><strong>{formMode === "edit" ? editing?.tenant_name : selectedContract?.tenant_name || "—"}</strong></p>
                <p>Property<br /><strong>{formMode === "edit" ? editing?.property_name : selectedContract?.property_name || "—"}</strong></p>
                <p>Unit<br /><strong>{formMode === "edit" ? editing?.unit_name : selectedContract?.unit_name || "—"}</strong></p>
                <p>Billing frequency<br /><strong>{selectedContract?.billing_frequency || "—"}</strong></p>
                <label>Billing period start<input type="date" required disabled={locked} value={draft.billing_period_start} onChange={(event) => setDraft({ ...draft, billing_period_start: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Billing period end<input type="date" required disabled={locked} value={draft.billing_period_end} onChange={(event) => setDraft({ ...draft, billing_period_end: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Invoice date<input type="date" required disabled={locked} value={draft.issue_date} onChange={(event) => setDraft({ ...draft, issue_date: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Due date<input type="date" required disabled={locked} value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Rent amount<input type="number" min="0" step="0.01" required disabled={locked} value={draft.rent_amount} onChange={(event) => setDraft({ ...draft, rent_amount: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Additional charges<input type="number" min="0" step="0.01" disabled={locked} value={draft.additional_charges} onChange={(event) => setDraft({ ...draft, additional_charges: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <label>Discount<input type="number" min="0" step="0.01" disabled={locked} value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50" /></label>
                <p>Total amount<br /><strong>{formatTzs(previewTotal)}</strong></p>
                <label className="sm:col-span-2">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
                {locked ? <p className="sm:col-span-2 text-amber-700">Payments are already recorded. Only notes can be changed.</p> : null}
              </div>
            )}
            {saveError ? <p className="mt-3 text-sm text-rose-700">{saveError}</p> : null}
            {notice ? <p className="mt-3 text-sm text-slate-600">{notice}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => saveState === "idle" && setFormMode(null)} className="rounded-xl px-4 py-2 text-sm">Close</button>
              <SaveButton state={saveState} label={formMode === "pay" ? "Record Payment" : "Save"} />
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold">{selected.invoice_number}</h2>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-slate-500">Close</button>
            </div>
            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(selected.effective_status)}`}>{selected.effective_status}</span>
            <Section title="Invoice information" rows={[
              ["Invoice date", formatDate(selected.issue_date)],
              ["Billing period", `${formatDate(selected.billing_period_start)} – ${formatDate(selected.billing_period_end)}`],
              ["Due date", formatDate(selected.due_date)],
              ["Rent", formatTzs(selected.rent_amount)],
              ["Additional charges", formatTzs(selected.additional_charges)],
              ["Discount", formatTzs(selected.discount)],
              ["Total", formatTzs(selected.total_amount)],
              ["Amount paid", formatTzs(selected.amount_paid)],
              ["Outstanding", formatTzs(selected.balance)],
            ]} />
            <Section title="Tenant" rows={[["Name", selected.tenant_name], ["Phone", selected.tenant_phone || "—"], ["Email", selected.tenant_email || "—"]]} />
            <Section title="Property" rows={[["Name", selected.property_name], ["Address", selected.property_address || "—"]]} />
            <Section title="Unit" rows={[["Unit", selected.unit_name], ["Type", selected.unit_type || "—"]]} />
            <Section title="Contract" rows={[["Number", selected.contract_number], ["Start", formatDate(selected.contract_start)], ["End", formatDate(selected.contract_end)], ["Agreed rent", formatTzs(selected.agreed_rent)]]} />
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">Payment history</h3>
            {selected.payments.length === 0 ? <p className="mt-2 text-sm text-slate-500">No payments recorded.</p> : (
              <ul className="mt-2 space-y-2 text-sm">
                {selected.payments.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-100 p-3">
                    <p className="font-medium">{formatDate(item.payment_date)} · {formatTzs(item.amount)}</p>
                    <p className="text-slate-500">{item.payment_method}{item.transaction_reference ? ` · ${item.transaction_reference}` : ""} · {item.status}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => openEdit(selected)}>Edit</button>
              {selected.effective_status !== "Paid" && selected.effective_status !== "Cancelled" ? <button type="button" className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm text-white" onClick={() => openPay(selected)}>Record Payment</button> : null}
              <a className="rounded-xl border px-3 py-2 text-sm" href={`/property/invoices/${selected.id}/print`} target="_blank" rel="noreferrer">Print</a>
            </div>
          </aside>
        </div>
      ) : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-bold">Cancel {cancelTarget.invoice_number}</h2>
            <p className="mt-2 text-sm text-slate-600">The invoice stays in the records. Invoices that already have payments cannot be cancelled.</p>
            {cancelError ? <p className="mt-3 text-sm text-rose-700">{cancelError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm" onClick={() => setCancelTarget(null)}>Keep invoice</button>
              <button type="button" disabled={cancelState !== "idle"} onClick={confirmCancel} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">{cancelState === "saving" ? "…" : "Cancel invoice"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <dl className="mt-2 space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value || "—"}</dd></div>
        ))}
      </dl>
    </section>
  );
}
