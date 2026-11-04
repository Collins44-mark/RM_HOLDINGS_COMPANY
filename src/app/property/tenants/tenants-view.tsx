"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import type { TenantOption, TenantRecord } from "@/lib/property/tenants";

function statusClass(status: string) {
  return status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
}

function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`px-4 py-2 rounded-xl font-semibold min-w-[120px] flex items-center justify-center gap-2 ${state === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
      {state === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : state === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : label}
    </button>
  );
}

export default function TenantsView({ initialItems, properties, units }: { initialItems: TenantRecord[]; properties: TenantOption[]; units: TenantOption[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState("Active");
  const [addState, setAddState] = useState("idle");
  const [addError, setAddError] = useState("");
  const [selected, setSelected] = useState<TenantRecord | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<TenantRecord | null>(null);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const propertyUnits = units.filter((unit) => unit.property_id === propertyId);
  const draftUnits = units.filter((unit) => unit.property_id === draft?.property_id);
  const visible = items.filter((tenant) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [tenant.full_name, tenant.phone_number, tenant.property_name, tenant.unit_name].some((value) => value.toLowerCase().includes(text));
    return matchesText && (!propertyFilter || tenant.property_id === propertyFilter) && (!statusFilter || tenant.status === statusFilter);
  });
  const listPage = useListPage(visible, `${query}|${propertyFilter}|${statusFilter}`);
  const active = items.filter((tenant) => tenant.status === "Active").length;
  const assigned = items.filter((tenant) => tenant.unit_id).length;

  function resetForm() {
    setName("");
    setPhone("");
    setEmail("");
    setPropertyId("");
    setUnitId("");
    setStatus("Active");
    setAddState("idle");
    setAddError("");
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (addState !== "idle") return;
    setAddState("saving");
    setAddError("");
    try {
      const response = await fetch("/api/property/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name, phone_number: phone, email, property_id: propertyId, unit_id: unitId, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAddError(data.error || "Save failed");
        setAddState("idle");
        return;
      }
      setItems((prev) => [data.data, ...prev]);
      setAddState("saved");
      setTimeout(() => {
        setFormOpen(false);
        resetForm();
      }, 700);
    } catch {
      setAddError("Network error");
      setAddState("idle");
    }
  }

  function openView(tenant: TenantRecord) {
    setSelected(tenant);
    setDraft(tenant);
    setEditMode(false);
    setSaveState("idle");
    setSaveError("");
    setOpenMenuId(null);
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !selected || saveState !== "idle") return;
    setSaveState("saving");
    setSaveError("");
    try {
      const response = await fetch(`/api/property/tenants/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: draft.full_name,
          phone_number: draft.phone_number,
          email: draft.email,
          status: draft.status,
          property_id: draft.property_id,
          unit_id: draft.unit_id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(data.error || "Update failed");
        setSaveState("idle");
        return;
      }
      setSelected(data.data);
      setDraft(data.data);
      setItems((prev) => prev.map((item) => item.id === data.data.id ? data.data : item));
      setSaveState("saved");
      setTimeout(() => {
        setEditMode(false);
        setSaveState("idle");
      }, 700);
    } catch {
      setSaveError("Network error");
      setSaveState("idle");
    }
  }

  return (
    <main className="pb-10 text-slate-900">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold">Tenants</h1>
            <p className="text-slate-500 text-sm">Add tenants and assign them to a property or unit.</p>
          </div>
          <button onClick={() => { resetForm(); setFormOpen(true); }} className="bg-[#0b2244] hover:bg-[#091e3d] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ Add Tenant</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[{ label: "Total Tenants", value: items.length }, { label: "Active", value: active }, { label: "Assigned to a Unit", value: assigned }, { label: "Property Only", value: items.length - assigned }].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{card.label}</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tenants..." className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">{items.length === 0 ? "No tenants registered yet." : "No tenants match these filters."}</td></tr>
              ) : listPage.rows.map((tenant) => (
                <tr key={tenant.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{tenant.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{tenant.phone_number || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{tenant.property_name || "Not linked"}</td>
                  <td className="px-4 py-3 text-slate-600">{tenant.unit_name || "Property only"}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(tenant.status)}`}>{tenant.status}</span></td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-label="Tenant actions"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const top = rect.bottom + 44 > window.innerHeight ? Math.max(8, rect.top - 52) : rect.bottom + 8;
                        setMenuPos({ top, left: Math.max(8, rect.right - 148) });
                        setOpenMenuId(openMenuId === tenant.id ? null : tenant.id);
                      }}
                      className="text-slate-600 hover:text-slate-900 p-1"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4"><PaginationBar page={listPage.page} total={visible.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
        </div>
      </div>

      {openMenuId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)}>
          <div className="absolute bg-white rounded-2xl shadow-xl border border-slate-100 w-36 py-1" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => openView(items.find((item) => item.id === openMenuId)!)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-xl">View</button>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget && addState === "idle") setFormOpen(false); }}>
          <form onSubmit={handleAdd} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add Tenant</h3>
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <select required value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setUnitId(""); }} className="w-full mb-3 px-3 py-2 border rounded-lg">
              <option value="">Select property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg" disabled={!propertyId}>
              <option value="">Property only</option>
              {propertyUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"><option>Active</option><option>Inactive</option></select>
            <div className="flex gap-3 items-center">
              <SaveButton state={addState} label="Save" />
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button>
            </div>
            {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
          </form>
        </div>
      )}

      {selected && draft && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end" onClick={(event) => { if (event.target === event.currentTarget) { setSelected(null); setEditMode(false); } }}>
          <div className="w-full sm:w-[480px] lg:w-[520px] bg-white/95 backdrop-blur-md h-[calc(100vh-72px)] mt-[72px] mr-4 mb-4 rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-100 overflow-y-auto flex flex-col">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 px-8 pt-8 pb-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">{selected.full_name}</h2>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusClass(selected.status)}`}>{selected.status}</span>
                </div>
                <p className="text-sm text-slate-500">{selected.property_name || "Property not linked"}{selected.unit_name ? ` · ${selected.unit_name}` : ""}</p>
              </div>
              <button type="button" onClick={() => { setSelected(null); setEditMode(false); }} className="text-slate-400 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="px-8 py-6 flex-1">
              {!editMode ? (
                <>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Tenant Information</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-8">
                    <div><div className="text-slate-400 text-xs">Name</div><div className="font-semibold text-slate-900">{selected.full_name}</div></div>
                    <div><div className="text-slate-400 text-xs">Phone</div><div className="font-semibold text-slate-900">{selected.phone_number || "—"}</div></div>
                    <div><div className="text-slate-400 text-xs">Email</div><div className="font-semibold text-slate-900">{selected.email || "—"}</div></div>
                    <div><div className="text-slate-400 text-xs">Status</div><div className="font-semibold text-slate-900">{selected.status}</div></div>
                    <div><div className="text-slate-400 text-xs">Property</div><div className="font-semibold text-slate-900">{selected.property_name || "Not linked"}</div></div>
                    <div><div className="text-slate-400 text-xs">Unit</div><div className="font-semibold text-slate-900">{selected.unit_name || "Property only"}</div></div>
                  </div>
                  <div className="pt-6 border-t border-slate-100">
                    <button type="button" onClick={() => { setDraft(selected); setEditMode(true); setSaveState("idle"); setSaveError(""); }} className="w-full bg-white border border-slate-200 text-slate-900 px-5 py-3 rounded-2xl font-semibold hover:bg-slate-50">Edit Tenant</button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleUpdate}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Edit Tenant</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="Full name" />
                    <input value={draft.phone_number} onChange={(event) => setDraft({ ...draft, phone_number: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="Phone" />
                    <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" placeholder="Email" />
                    <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"><option>Active</option><option>Inactive</option></select>
                    <select required value={draft.property_id} onChange={(event) => setDraft({ ...draft, property_id: event.target.value, unit_id: "" })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
                      <option value="">Select property</option>
                      {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                    </select>
                    <select value={draft.unit_id} onChange={(event) => setDraft({ ...draft, unit_id: event.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
                      <option value="">Property only</option>
                      {draftUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <SaveButton state={saveState} label="Save Changes" />
                    <button type="button" onClick={() => { setEditMode(false); setSaveState("idle"); setSaveError(""); }} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Cancel</button>
                  </div>
                  {saveError && <p className="text-red-600 text-sm mt-3">{saveError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
