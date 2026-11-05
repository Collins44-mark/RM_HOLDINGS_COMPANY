"use client"
import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";

type UnitRow = {
  id: string;
  name: string;
  status: string;
  monthly_rent: number;
  property_id: string;
  unit_type: string;
  tenant_name: string | null;
  property: { name: string } | null;
};

type PropertyOption = { id: string; name: string };

function statusClass(status: string) {
  if (status === "Occupied") return "bg-emerald-50 text-emerald-700";
  if (status === "Vacant") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export default function UnitsView({
  initialItems,
  properties: initialProperties,
  propertyFromLink = "",
}: {
  initialItems: UnitRow[];
  properties: PropertyOption[];
  propertyFromLink?: string;
}) {
  const [items, setItems] = useState<UnitRow[]>(initialItems);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [unitType, setUnitType] = useState("Apartment");
  const [status, setStatus] = useState("Vacant");
  const [rent, setRent] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties] = useState<PropertyOption[]>(initialProperties);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftStatus, setDraftStatus] = useState("Vacant");
  const [draftRent, setDraftRent] = useState("");
  const [draftPropertyId, setDraftPropertyId] = useState("");
  const [updateState, setUpdateState] = useState("idle");
  const [updateError, setUpdateError] = useState("");
  const [query, setQuery] = useState("");
  const [filterProperty, setFilterProperty] = useState(propertyFromLink);
  const [filterStatus, setFilterStatus] = useState("");

  const active = items.filter((i) => i.status === "Occupied").length;
  const vacant = items.filter((i: any) => i.status === "Vacant").length;
  const maint = items.filter((i: any) => i.status === "Maintenance").length;
  const filtered = items.filter((unit) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [unit.name, unit.property?.name, unit.tenant_name, unit.status].some((value) => String(value || "").toLowerCase().includes(text));
    const matchesProperty = !filterProperty || unit.property_id === filterProperty;
    const matchesStatus = !filterStatus || unit.status === filterStatus;
    return matchesText && matchesProperty && matchesStatus;
  });
  const listPage = useListPage(filtered, `${query}|${filterProperty}|${filterStatus}`);

  function openView(unit: any) {
    setSelectedUnit(unit);
    setDraftName(unit.name || "");
    setDraftStatus(unit.status || "Vacant");
    setDraftRent(String(unit.monthly_rent ?? ""));
    setDraftPropertyId(unit.property_id || "");
    setEditMode(false);
    setUpdateState("idle");
    setUpdateError("");
    setDrawerOpen(true);
    setOpenMenuId(null);
  }

  const handleSave = async (e: any) => {
    e.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setSaveError("");
    try {
      const res = await fetch("/api/property/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, unit_type: unitType, status, monthly_rent: rent ? parseFloat(rent) : 0, property_id: propertyId }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaveState("saved");
        setItems((prev: any[]) => [...prev, data.data || data]);
        setTimeout(() => { setFormOpen(false); setSaveState("idle"); setName(""); setRent(""); setPropertyId(""); }, 800);
      } else {
        setSaveError(data.error || "Save failed");
        setSaveState("idle");
      }
    } catch (err: any) {
      setSaveError(err?.message || "Network error");
      setSaveState("idle");
    }
  };

  const handleUpdate = async (e: any) => {
    e.preventDefault();
    if (!selectedUnit || updateState !== "idle") return;
    setUpdateState("saving");
    setUpdateError("");
    try {
      const res = await fetch(`/api/property/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          status: draftStatus,
          monthly_rent: draftRent ? parseFloat(draftRent) : 0,
          property_id: draftPropertyId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpdateError(data.error || "Update failed");
        setUpdateState("idle");
        return;
      }
      const updated = data.data || { ...selectedUnit, name: draftName, status: draftStatus, monthly_rent: draftRent ? parseFloat(draftRent) : 0, property_id: draftPropertyId };
      setSelectedUnit(updated);
      setItems((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setUpdateState("saved");
      setTimeout(() => {
        setEditMode(false);
        setUpdateState("idle");
      }, 700);
    } catch (err: any) {
      setUpdateError(err?.message || "Network error");
      setUpdateState("idle");
    }
  };

  return (
    <main className="pb-10 text-slate-900">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold">Units</h1>
            <p className="text-slate-500 text-sm">Manage all rental units.</p>
          </div>
          <button onClick={() => setFormOpen(true)} className="bg-[#0b2244] hover:bg-[#091e3d] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ Add Unit</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[{ label: "Total Units", value: items.length, tone: "text-slate-900" }, { label: "Occupied", value: active, tone: "text-emerald-600" }, { label: "Vacant", value: vacant, tone: "text-amber-600" }, { label: "Maintenance", value: maint, tone: "text-rose-600" }].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{card.label}</div>
              <div className={`text-2xl font-extrabold mt-1 ${card.tone}`}>{card.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search units..." className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Status</option>
            <option>Vacant</option>
            <option>Occupied</option>
            <option>Maintenance</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 font-semibold">Unit Name</th>
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Tenant</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">{items.length === 0 ? "No units registered yet." : "No units match these filters."}</td></tr>
              ) : listPage.rows.map((it: any) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800 font-medium">{it.name}</td>
                  <td className="px-4 py-3 text-slate-600">{it.property?.name || "Not linked"}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(it.status)}`}>{it.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{it.tenant_name || "No Tenant Assigned"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-label="Unit actions"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const menuHeight = 52;
                        const below = rect.bottom + 8;
                        const top = below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 8) : below;
                        setMenuPos({ top, left: Math.max(8, rect.right - 148) });
                        setSelectedUnit(it);
                        setOpenMenuId(openMenuId === it.id ? null : it.id);
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
          <div className="px-4"><PaginationBar page={listPage.page} total={filtered.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
        </div>

        {openMenuId && (
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)}>
            <div
              className="absolute bg-white rounded-2xl shadow-xl border border-slate-100 w-36 py-1"
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => openView(items.find((item) => item.id === openMenuId) || selectedUnit)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-xl"
              >
                View
              </button>
            </div>
          </div>
        )}

        {drawerOpen && selectedUnit && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) { setDrawerOpen(false); setEditMode(false); } }}>
            <div className="w-full sm:w-[480px] lg:w-[520px] bg-white/95 backdrop-blur-md h-[calc(100vh-72px)] mt-[72px] mr-4 mb-4 rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-100 overflow-y-auto flex flex-col">
              <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 px-8 pt-8 pb-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">{selectedUnit.name}</h2>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusClass(selectedUnit.status)}`}>{selectedUnit.status}</span>
                  </div>
                  <p className="text-sm text-slate-500">{selectedUnit.property?.name || "Property not linked"} · TZS {selectedUnit.monthly_rent || 0}</p>
                </div>
                <button type="button" onClick={() => { setDrawerOpen(false); setEditMode(false); }} className="text-slate-400 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <div className="flex gap-1 px-8 pt-4 border-b border-slate-100">
                <button type="button" className="px-3 py-2 text-sm font-medium rounded-t-xl border-b-2 border-[#0b2244] text-[#0b2244]">Details</button>
              </div>
              <div className="px-8 py-6 flex-1">
                {!editMode ? (
                  <>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Unit Information</h3>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-8">
                      <div><div className="text-slate-400 text-xs">Unit Name</div><div className="font-semibold text-slate-900">{selectedUnit.name}</div></div>
                      <div><div className="text-slate-400 text-xs">Property</div><div className="font-semibold text-slate-900">{selectedUnit.property?.name || "Not linked"}</div></div>
                      <div><div className="text-slate-400 text-xs">Status</div><div className="font-semibold text-slate-900">{selectedUnit.status}</div></div>
                      <div><div className="text-slate-400 text-xs">Monthly Rent</div><div className="font-semibold text-slate-900">TZS {selectedUnit.monthly_rent || 0}</div></div>
                      <div><div className="text-slate-400 text-xs">Unit Type</div><div className="font-semibold text-slate-900">{selectedUnit.unit_type || "Apartment"}</div></div>
                      <div><div className="text-slate-400 text-xs">Tenant</div><div className="font-semibold text-slate-900">{selectedUnit.tenant_name || "No Tenant Assigned"}</div></div>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleUpdate}>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Edit Unit</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <input required value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Unit Name" />
                      <select required value={draftPropertyId} onChange={(e) => setDraftPropertyId(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                        <option value="">Select Property</option>
                        {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                        <option>Vacant</option>
                        <option>Occupied</option>
                        <option>Maintenance</option>
                      </select>
                      <input type="number" value={draftRent} onChange={(e) => setDraftRent(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Monthly Rent" />
                    </div>
                    <div className="flex gap-3">
                      <button type="submit" disabled={updateState !== "idle"} className={`px-6 py-2.5 rounded-xl font-semibold shadow-lg min-w-[140px] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-90 ${updateState === "saved" ? "bg-emerald-600 text-white shadow-emerald-200/40" : "bg-[#0b2244] text-white shadow-indigo-200/40"}`}>
                        {updateState === "saving" ? <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : updateState === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => { setEditMode(false); setUpdateState("idle"); setUpdateError(""); }} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Cancel</button>
                    </div>
                    {updateError && <p className="text-red-600 text-sm mt-3">{updateError}</p>}
                  </form>
                )}
                {!editMode && (
                  <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
                    <button type="button" onClick={() => { setEditMode(true); setUpdateError(""); setUpdateState("idle"); }} className="flex-1 bg-white border border-slate-200 text-slate-900 px-5 py-3 rounded-2xl font-semibold hover:bg-slate-50 transition shadow-sm">Edit Unit</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {formOpen && (
          <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]" onClick={e => { if (e.target === e.currentTarget) setFormOpen(false); }}>
            <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Add Unit</h3>
              <form onSubmit={handleSave} className="space-y-3">
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="Unit Name" className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                <select required value={propertyId} onChange={e => setPropertyId(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300"><option value="">Select Property</option>{properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300"><option>Vacant</option><option>Occupied</option><option>Maintenance</option></select>
                <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="Monthly Rent" className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                <div className="flex gap-3">
                  <button type="submit" disabled={saveState !== "idle"} className={`bg-[#0b2244] text-white px-4 py-2 rounded-xl ${saveState === "saving" ? "opacity-70" : ""}`}><span className="flex items-center justify-center gap-2">{saveState === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : saveState === "saved" ? "✓ Saved" : "Save"}</span></button>
                  {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
                  <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
