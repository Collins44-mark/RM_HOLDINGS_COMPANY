"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { useListPage } from "@/lib/property/use-list-page";
import { CONTRACT_FREQUENCIES, type ContractOption, type ContractRecord } from "@/lib/property/contracts";
import { nextSerial } from "@/lib/property/serial";
import { saveModuleJson } from "@/lib/offline/module-save";

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function statusClass(status: string) {
  if (status === "Active") return "bg-emerald-50 text-emerald-700";
  if (status === "Pending") return "bg-amber-50 text-amber-700";
  if (status === "Terminated") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`px-4 py-2 rounded-xl font-semibold min-w-[140px] flex items-center justify-center gap-2 ${state === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
      {state === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : state === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : label}
    </button>
  );
}

type Draft = {
  tenant_id: string;
  property_id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  rent_amount: string;
  deposit_amount: string;
  billing_frequency: string;
  payment_due_day: string;
  contract_terms: string;
  status: string;
};

const emptyDraft: Draft = {
  tenant_id: "",
  property_id: "",
  unit_id: "",
  start_date: "",
  end_date: "",
  rent_amount: "",
  deposit_amount: "0",
  billing_frequency: "Monthly",
  payment_due_day: "1",
  contract_terms: "",
  status: "Active",
};

function draftFrom(contract: ContractRecord): Draft {
  return {
    tenant_id: contract.tenant_id,
    property_id: contract.property_id,
    unit_id: contract.unit_id,
    start_date: contract.start_date,
    end_date: contract.end_date,
    rent_amount: String(contract.rent_amount),
    deposit_amount: String(contract.deposit_amount),
    billing_frequency: contract.billing_frequency || "Monthly",
    payment_due_day: String(contract.payment_due_day || 1),
    contract_terms: contract.contract_terms || "",
    status: "Active",
  };
}

export default function ContractsView({
  initialItems,
  tenants,
  properties,
  units,
}: {
  initialItems: ContractRecord[];
  tenants: ContractOption[];
  properties: ContractOption[];
  units: ContractOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | "renew" | null>(null);
  const [editing, setEditing] = useState<ContractRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [selected, setSelected] = useState<ContractRecord | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractRecord | null>(null);
  const [reason, setReason] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [terminateState, setTerminateState] = useState("idle");
  const [terminateError, setTerminateError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [tenantQuery, setTenantQuery] = useState("");
  const [propertyQuery, setPropertyQuery] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [monthsPaid, setMonthsPaid] = useState("1");

  const propertyUnits = units.filter((unit) => unit.property_id === draft.property_id);
  const visible = items.filter((contract) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [contract.contract_number, contract.tenant_name, contract.property_name, contract.unit_name].some((value) => value.toLowerCase().includes(text));
    const matchesStatus = !statusFilter || contract.effective_status === statusFilter;
    const matchesProperty = !propertyFilter || contract.property_id === propertyFilter;
    const matchesDate = !fromDate || contract.start_date >= fromDate;
    return matchesText && matchesStatus && matchesProperty && matchesDate;
  });
  const listPage = useListPage(visible, `${query}|${propertyFilter}|${statusFilter}|${fromDate}`);
  const counts = useMemo(() => ({
    total: items.length,
    active: items.filter((contract) => contract.effective_status === "Active").length,
    pending: items.filter((contract) => contract.effective_status === "Pending").length,
    completed: items.filter((contract) => contract.effective_status === "Completed").length,
  }), [items]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setFormMode("create");
    setSaveState("idle");
    setSaveError("");
    setTenantQuery("");
    setPropertyQuery("");
    setUnitQuery("");
    setMonthsPaid("1");
  }

  function openEdit(contract: ContractRecord) {
    setEditing(contract);
    setDraft(draftFrom(contract));
    setFormMode("edit");
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
  }

  function openRenew(contract: ContractRecord) {
    setEditing(contract);
    setDraft({ ...draftFrom(contract), start_date: "", end_date: "", status: "Active", contract_terms: "" });
    setMonthsPaid("1");
    setFormMode("renew");
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
  }

  function chooseUnit(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    setDraft((current) => ({ ...current, unit_id: unitId, rent_amount: unit ? String(unit.monthly_rent ?? 0) : current.rent_amount }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setSaveError("");
    const payload = {
      ...draft,
      status: formMode === "edit" ? draft.status : "Active",
      rent_amount: Number(draft.rent_amount),
      deposit_amount: Number(draft.deposit_amount || 0),
      payment_due_day: Number(draft.payment_due_day),
      months_paid: formMode === "edit" ? undefined : Number(monthsPaid),
    };
    try {
      const path = formMode === "edit" && editing ? `/api/property/contracts/${editing.id}` : formMode === "renew" && editing ? `/api/property/contracts/${editing.id}/renew` : "/api/property/contracts";
      const result = await saveModuleJson(path, formMode === "edit" ? "PATCH" : "POST", payload);
      if (!result.ok) {
        setSaveError(result.error);
        setSaveState("idle");
        return;
      }
      if (result.queued) {
        setSaveState("saved");
        setTimeout(() => {
          setFormMode(null);
          setSaveState("idle");
        }, 700);
        return;
      }
      const data = result.data as { data: (typeof items)[number]; previous?: (typeof items)[number] };
      const previous = data.previous;
      setItems((prev) => {
        const next = formMode === "edit" ? prev.map((item) => item.id === data.data.id ? data.data : item) : [data.data, ...prev];
        if (formMode === "renew" && previous) return next.map((item) => item.id === previous.id ? previous : item);
        return next;
      });
      setSaveState("saved");
      setTimeout(() => {
        setFormMode(null);
        setSaveState("idle");
      }, 700);
    } catch {
      setSaveError("Network error");
      setSaveState("idle");
    }
  }

  async function handleTerminate(event: React.FormEvent) {
    event.preventDefault();
    if (!terminateTarget || terminateState !== "idle") return;
    setTerminateState("saving");
    setTerminateError("");
    try {
      const response = await fetch(`/api/property/contracts/${terminateTarget.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, termination_date: terminationDate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTerminateError(data.error || "Termination failed");
        setTerminateState("idle");
        return;
      }
      setItems((prev) => prev.map((item) => item.id === data.data.id ? data.data : item));
      setSelected((current) => current?.id === data.data.id ? data.data : current);
      setTerminateState("saved");
      setTimeout(() => {
        setTerminateTarget(null);
        setTerminateState("idle");
        setReason("");
      }, 700);
    } catch {
      setTerminateError("Network error");
      setTerminateState("idle");
    }
  }

  const lockedParties = formMode === "renew";
  const tenantChoices = tenants.filter((tenant) => tenant.name.toLowerCase().includes(tenantQuery.trim().toLowerCase()));
  const propertyChoices = properties.filter((property) => property.name.toLowerCase().includes(propertyQuery.trim().toLowerCase()));
  const unitChoices = propertyUnits.filter((unit) => unit.name.toLowerCase().includes(unitQuery.trim().toLowerCase()));

  return (
    <main className="pb-10 text-slate-900">
      <div>
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Contracts</h1>
            <p className="text-slate-500 text-sm">Manage rental agreements and tenancy periods.</p>
          </div>
          <button onClick={openCreate} className="bg-[#0b2244] hover:bg-[#091e3d] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ Create Contract</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[{ label: "Total Contracts", value: counts.total }, { label: "Active", value: counts.active }, { label: "Pending", value: counts.pending }, { label: "Completed", value: counts.completed }].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{card.label}</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts..." className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Status</option>
            <option>Pending</option>
            <option>Active</option>
            <option>Completed</option>
            <option>Terminated</option>
          </select>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Starts from" className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Contract No.</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Property / Unit</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">End Date</th>
                <th className="px-4 py-3">Monthly Rent</th>
                <th className="px-4 py-3">Amount Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">{items.length === 0 ? "No rental contracts yet." : "No contracts match these filters."}</td></tr>
              ) : listPage.rows.map((contract) => (
                <tr key={contract.id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{contract.contract_number}</td>
                  <td className="px-4 py-3 text-slate-700">{contract.tenant_name || "Tenant missing"}</td>
                  <td className="px-4 py-3 text-slate-600">{contract.property_name || "Property missing"}{contract.unit_name ? ` / ${contract.unit_name}` : ""}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(contract.start_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(contract.end_date)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatTzs(contract.rent_amount)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatTzs(contract.amount_paid)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(contract.effective_status)}`}>{contract.effective_status}</span></td>
                  <td className="px-4 py-3">
                    <button type="button" aria-label="Contract actions" onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const top = rect.bottom + 180 > window.innerHeight ? Math.max(8, rect.top - 188) : rect.bottom + 8;
                      setMenuPos({ top, left: Math.max(8, rect.right - 176) });
                      setOpenMenuId(openMenuId === contract.id ? null : contract.id);
                    }} className="text-slate-600 hover:text-slate-900 p-1"><MoreVertical size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="px-4"><PaginationBar page={listPage.page} total={visible.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
        </div>
      </div>

      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)}>
          <div className="absolute bg-white rounded-2xl shadow-xl border border-slate-100 w-44 py-1" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
            {["View Details", "Edit Contract", "Renew Contract", "Terminate Contract"].map((action) => (
              <button key={action} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => {
                const contract = items.find((item) => item.id === openMenuId);
                if (!contract) return;
                if (action === "View Details") { setSelected(contract); setOpenMenuId(null); }
                if (action === "Edit Contract") openEdit(contract);
                if (action === "Renew Contract") openRenew(contract);
                if (action === "Terminate Contract") {
                  setTerminateTarget(contract);
                  setReason("");
                  setTerminationDate(new Date().toISOString().slice(0, 10));
                  setTerminateState("idle");
                  setTerminateError("");
                  setOpenMenuId(null);
                }
              }}>{action}</button>
            ))}
          </div>
        </div>
      )}

      {formMode && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]" onClick={(event) => { if (event.target === event.currentTarget && saveState === "idle") setFormMode(null); }}>
          <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-2xl max-h-full min-h-0 overflow-y-auto">
            <h3 className="text-xl font-bold mb-1">{formMode === "renew" ? "Renew Contract" : formMode === "edit" ? "Edit Contract" : "Create Contract"}</h3>
            <p className="text-sm text-slate-500 mb-5">{formMode === "renew" ? `A new agreement will be created from ${editing?.contract_number}. The current agreement stays in the history.` : "The agreement is saved against the selected tenant, property, and unit."}</p>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tenant & Property</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <label className="text-sm">
                <span className="text-xs font-semibold text-slate-500">Search tenant</span>
                <input value={tenantQuery} onChange={(event) => setTenantQuery(event.target.value)} disabled={lockedParties} placeholder="Search tenant" className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                <select required value={draft.tenant_id} disabled={lockedParties} onChange={(event) => setDraft({ ...draft, tenant_id: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                  <option value="">Select tenant</option>
                  {tenantChoices.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold text-slate-500">Search property</span>
                <input value={propertyQuery} onChange={(event) => setPropertyQuery(event.target.value)} disabled={lockedParties} placeholder="Search property" className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                <select required value={draft.property_id} disabled={lockedParties} onChange={(event) => setDraft({ ...draft, property_id: event.target.value, unit_id: "" })} className="mt-2 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                  <option value="">Select property</option>
                  {propertyChoices.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-xs font-semibold text-slate-500">Search unit</span>
                <input value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} disabled={lockedParties || !draft.property_id} placeholder="Search unit" className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                <select required value={draft.unit_id} disabled={lockedParties || !draft.property_id} onChange={(event) => chooseUnit(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                  <option value="">{draft.property_id ? "Select unit" : "Select a property first"}</option>
                  {unitChoices.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            </div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contract Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Contract number</span><input readOnly value={formMode === "edit" ? editing?.contract_number || "" : nextSerial(items.map((contract) => contract.contract_number), "CON", 0)} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-slate-50/70 px-3 py-2 text-sm text-slate-500 outline-none" /></label>
              {formMode === "edit" ? (
                <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Status</span><input readOnly value="Active" className="mt-1 w-full rounded-xl border border-slate-200/50 bg-slate-50/70 px-3 py-2 text-sm text-slate-500 outline-none" /></label>
              ) : (
                <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Months paid</span><input required type="number" min="1" max="24" value={monthsPaid} onChange={(event) => setMonthsPaid(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              )}
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Start date</span><input required type="date" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">End date</span><input required type="date" value={draft.end_date} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Monthly rent</span><input required type="number" min="0" step="1" value={draft.rent_amount} onChange={(event) => setDraft({ ...draft, rent_amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Security deposit</span><input required type="number" min="0" step="1" value={draft.deposit_amount} onChange={(event) => setDraft({ ...draft, deposit_amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Payment frequency</span><select value={draft.billing_frequency} onChange={(event) => setDraft({ ...draft, billing_frequency: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{CONTRACT_FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
              <label className="text-sm"><span className="text-xs font-semibold text-slate-500">Rent due day</span><input required type="number" min="1" max="28" value={draft.payment_due_day} onChange={(event) => setDraft({ ...draft, payment_due_day: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
            </div>
            {formMode !== "edit" && <p className="mb-4 text-sm text-slate-600">Amount paid {formatTzs(Math.round(Number(draft.rent_amount || 0) * Math.max(1, Number(monthsPaid) || 1)))}. Saving creates the invoice and records this payment.</p>}
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Agreement</h4>
            <textarea value={draft.contract_terms} onChange={(event) => setDraft({ ...draft, contract_terms: event.target.value })} rows={4} placeholder="Special terms" className="mb-4 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
            <div className="flex gap-3 items-center">
              <SaveButton state={saveState} label={formMode === "renew" ? "Renew" : "Save"} />
              <button type="button" onClick={() => setFormMode(null)} className="px-4 py-2 border rounded-xl">Cancel</button>
            </div>
            {saveError && <p className="text-red-600 text-sm mt-2">{saveError}</p>}
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div className="w-full sm:w-[480px] lg:w-[520px] bg-white/95 backdrop-blur-md h-[calc(100vh-72px)] mt-[72px] mr-4 mb-4 rounded-3xl shadow-2xl border border-slate-100 overflow-y-auto">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 px-8 pt-8 pb-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-extrabold text-slate-900">{selected.contract_number}</h2>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusClass(selected.effective_status)}`}>{selected.effective_status}</span>
                </div>
                <p className="text-sm text-slate-500">{selected.tenant_name} · {selected.property_name} / {selected.unit_name}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-800 p-2" aria-label="Close">✕</button>
            </div>
            <div className="px-8 py-6 space-y-6 text-sm">
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contract Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Start" value={formatDate(selected.start_date)} />
                  <Info label="End" value={formatDate(selected.end_date)} />
                  <Info label="Monthly rent" value={formatTzs(selected.rent_amount)} />
                  <Info label="Amount paid" value={formatTzs(selected.amount_paid)} />
                  <Info label="Security deposit" value={formatTzs(selected.deposit_amount)} />
                  <Info label="Payment frequency" value={selected.billing_frequency} />
                  <Info label="Rent due day" value={String(selected.payment_due_day)} />
                </div>
                <p className="mt-3 text-slate-600 whitespace-pre-wrap">{selected.contract_terms || "No special terms."}</p>
              </section>
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tenant</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Name" value={selected.tenant_name || "—"} />
                  <Info label="Phone" value={selected.tenant_phone || "—"} />
                  <Info label="Email" value={selected.tenant_email || "—"} />
                </div>
              </section>
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Property</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Name" value={selected.property_name || "—"} />
                  <Info label="Address" value={selected.property_address || "—"} />
                </div>
              </section>
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Unit</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Name" value={selected.unit_name || "—"} />
                  <Info label="Type" value={selected.unit_type || "—"} />
                  <Info label="Floor" value={selected.floor == null ? "—" : String(selected.floor)} />
                  <Info label="Unit rent" value={formatTzs(selected.unit_rent)} />
                </div>
              </section>
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">History</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Created" value={selected.created_at ? formatDate(selected.created_at) : "—"} />
                  <Info label="Updated" value={selected.updated_at ? formatDate(selected.updated_at) : "—"} />
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {terminateTarget && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]">
          <form onSubmit={handleTerminate} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-2">Terminate {terminateTarget.contract_number}</h3>
            <p className="text-sm text-slate-500 mb-4">The agreement stays on record. It will no longer count as the current tenancy.</p>
            <input type="date" required value={terminationDate} onChange={(event) => setTerminationDate(event.target.value)} className="mb-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
            <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" rows={3} className="mb-4 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
            <div className="flex gap-3">
              <SaveButton state={terminateState} label="Terminate" />
              <button type="button" onClick={() => setTerminateTarget(null)} className="px-4 py-2 border rounded-xl">Cancel</button>
            </div>
            {terminateError && <p className="text-red-600 text-sm mt-2">{terminateError}</p>}
          </form>
        </div>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-slate-400 text-xs">{label}</div><div className="font-semibold text-slate-900">{value}</div></div>;
}
