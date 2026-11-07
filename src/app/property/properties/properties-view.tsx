"use client"
import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { saveModuleJson } from "@/lib/offline/module-save";

const PROPERTY_TYPES = ["House", "Apartment", "Commercial", "Hall", "Plot", "Office"];

export default function PropertiesView({ initialItems }: { initialItems: any[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propType, setPropType] = useState("House");
  const [status, setStatus] = useState("Active");
  const [error, setError] = useState("");
  const [addState, setAddState] = useState<"idle" | "saving" | "saved">("idle");
  const [items, setItems] = useState<any[]>(initialItems);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [saveError, setSaveError] = useState("");
  const [drawerTab, setDrawerTab] = useState("Details");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const totalUnits = items.reduce((sum, property) => sum + (property.unit_count || 0), 0);
  const maintenanceUnits = items.reduce((sum, property) => sum + (property.maintenance_count || 0), 0);
  const needle = query.trim().toLowerCase();
  const visibleItems = items.filter((property) => {
    if (typeFilter && property.property_type !== typeFilter) return false;
    if (statusFilter && property.status !== statusFilter) return false;
    if (!needle) return true;
    const haystack = `${property.name || ""} ${property.street_address || ""} ${property.region || ""} ${property.district || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
  const listPage = useListPage(visibleItems, `${query}|${typeFilter}|${statusFilter}`);

  async function handleAddProperty(e: React.FormEvent) {
    e.preventDefault();
    if (addState !== "idle") return;
    setAddState("saving");
    setError("");
    try {
      const result = await saveModuleJson("/api/property/properties", "POST", { name, address, property_type: propType, status, business_unit_id: "" });
      if (!result.ok) {
        setError(result.error);
        setAddState("idle");
        return;
      }
      if (result.queued) {
        setAddState("saved");
        setTimeout(() => {
          setFormOpen(false);
          setAddState("idle");
          setName("");
          setAddress("");
          setPropType("House");
          setStatus("Active");
        }, 700);
        return;
      }
      const created = (result.data.data as Record<string, unknown>) || {};
      setItems((prev) => [{ ...created, units: [], rentals: [], tenants: [], unit_count: 0, occupied_count: 0, vacant_count: 0, maintenance_count: 0 }, ...prev]);
      setAddState("saved");
      setTimeout(() => {
        setFormOpen(false);
        setAddState("idle");
        setName("");
        setAddress("");
        setPropType("House");
        setStatus("Active");
      }, 700);
    } catch {
      setError("Network error");
      setAddState("idle");
    }
  }
  return (
    <main className="pb-10 text-slate-900">
      <div>
        <div className="mb-6 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold md:text-3xl">Properties</h1>
            <p className="text-slate-500 text-sm">Manage and organize all your registered properties.</p>
          </div>
          <button onClick={()=>setFormOpen(true)} className="whitespace-nowrap rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-200/40 hover:bg-[#091e3d] md:px-4 md:py-2.5">+ Add Property</button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{[{label:"Total Properties",val:items.length},{label:"Active Properties",val:items.filter((i:any)=>i.status==="Active").length},{label:"Total Units",val:totalUnits},{label:"Under Maintenance",val:maintenanceUnits}].map(({label,val}) => (<div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{val}</div></div>))}</div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search properties..." className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Property Type</option>
            {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white shadow-sm md:overflow-hidden">
          <table className="w-full min-w-[760px] border-collapse text-sm md:min-w-0">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Property Name</th>
                <th className="px-4 py-3 md:p-0">Type</th>
                <th className="px-4 py-3 md:p-0">Location</th>
                <th className="px-4 py-3 md:p-0">Units</th>
                <th className="px-4 py-3 md:p-0">Occupied</th>
                <th className="px-4 py-3 md:p-0">Vacant</th>
                <th className="px-4 py-3 md:p-0">Status</th>
                <th className="px-4 py-3 md:p-0">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center"><span className="text-sm text-slate-500">{items.length === 0 ? "No properties registered yet." : "No properties match these filters."}</span></td></tr>
              ) : listPage.rows.map((it: any) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 md:whitespace-normal">{it.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:whitespace-normal md:p-0">{it.property_type}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:whitespace-normal md:p-0">{it.street_address || it.region || it.district || "Location not provided"}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:p-0">{it.unit_count || 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:p-0">{it.occupied_count || 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:p-0">{it.vacant_count || 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 md:p-0"><span className={`text-xs px-2 py-0.5 rounded-full ${it.status==='Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{it.status}</span></td>
                  <td className="px-4 py-3 md:p-0"><button onClick={()=>{setSelectedProperty(it);setDrawerTab("Details");}} className="text-slate-600 hover:text-slate-900 p-1"><MoreVertical size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4"><PaginationBar page={listPage.page} total={visibleItems.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
        </div>

        {/* Empty state */}
        {items.length === 0 && (<div className="mt-8 bg-white rounded-2xl p-10 text-center border border-slate-200/60 shadow-sm">
          <h3 className="text-xl font-bold text-slate-800 mb-2">No properties registered yet.</h3>
          <p className="text-slate-500 mb-4">Start by adding your first property to manage its units and rental activities.</p>
          <button onClick={()=>setFormOpen(true)} className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-medium">+ Add Property</button>
        </div>)}
      </div>
{formOpen && (
  <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]" onClick={(e) => { if (e.target === e.currentTarget && addState === "idle") setFormOpen(false); }}>
    <form onSubmit={handleAddProperty} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
      <h3 className="text-xl font-bold mb-4">Add Property</h3>
      <input required placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
      <input placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
      <select value={propType} onChange={e=>setPropType(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
        {PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}
      </select>
      <select value={status} onChange={e=>setStatus(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300"><option>Active</option><option>Inactive</option></select>
      <div className="flex gap-3 items-center">
        <button type="submit" disabled={addState !== "idle"} className={`px-4 py-2 rounded-xl font-semibold min-w-[120px] flex items-center justify-center gap-2 ${addState === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
          {addState === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : addState === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : "Save"}
        </button>
        <button type="button" onClick={()=>setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button>
      </div>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </form>
  </div>
)}
    {selectedProperty && (
  <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end" onClick={(e)=>{if(e.target===e.currentTarget){setSelectedProperty(null);setEditMode(false);}}}>
    <div className="w-full sm:w-[480px] lg:w-[520px] bg-white/95 backdrop-blur-md h-[calc(100vh-72px)] mt-[72px] mr-4 mb-4 rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-100 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 px-8 pt-8 pb-4 border-b border-slate-100 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">{selectedProperty.name}</h2>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${selectedProperty.status==='Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{selectedProperty.status}</span>
          </div>
          <p className="text-sm text-slate-500">{selectedProperty.property_type || 'Property'} · {selectedProperty.street_address || selectedProperty.region || 'Location not provided'}</p>
        </div>
        <button onClick={()=>{setSelectedProperty(null);setEditMode(false);}} className="text-slate-400 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      {/* Tabs */}
      <div className="flex gap-1 px-8 pt-4 border-b border-slate-100">
        {['Details','Units','Tenants','Rentals'].map((tab)=>(
          <button key={tab} onClick={()=>setDrawerTab(tab)} className={`px-3 py-2 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${drawerTab===tab?'border-[#0b2244] text-[#0b2244]':'border-transparent text-slate-400 hover:text-slate-600'}`}>{tab}</button>
        ))}
      </div>
      {/* Details content */}
      <div className="px-8 py-6 flex-1">
        {drawerTab === "Units" ? (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Units</h3>
            {(selectedProperty.units || []).length === 0 ? <p className="text-sm text-slate-500">No units linked to this property yet.</p> : (
              <div className="space-y-2">
                {selectedProperty.units.map((unit: any) => (
                  <div key={unit.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-900">{unit.name}</div>
                      <div className="text-xs text-slate-400">{unit.unit_type}{unit.tenant_name ? ` · ${unit.tenant_name}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${unit.status==='Occupied'?'bg-emerald-50 text-emerald-700':unit.status==='Vacant'?'bg-amber-50 text-amber-700':'bg-rose-50 text-rose-700'}`}>{unit.status}</div>
                      <div className="text-xs text-slate-500 mt-1">TZS {unit.monthly_rent || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : drawerTab === "Tenants" ? (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Tenants</h3>
            {(selectedProperty.tenants || []).length === 0 ? <p className="text-sm text-slate-500">No tenants are assigned to this property yet.</p> : (
              <div className="space-y-2">
                {selectedProperty.tenants.map((tenant: any) => (
                  <div key={tenant.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-900">{tenant.name}</div>
                      <div className="text-xs text-slate-400">{tenant.unit_name || "Property"}{tenant.phone ? ` · ${tenant.phone}` : ""}</div>
                    </div>
                    <div className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${tenant.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{tenant.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : drawerTab === "Rentals" ? (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Rentals</h3>
            {(selectedProperty.rentals || []).length === 0 ? <p className="text-sm text-slate-500">No rental contracts for this property yet.</p> : (
              <div className="space-y-2">
                {selectedProperty.rentals.map((rental: any) => (
                  <div key={rental.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                    <div>
                      <div className="font-semibold text-slate-900">{rental.contract_number}</div>
                      <div className="text-xs text-slate-400">{rental.tenant_name ? `${rental.tenant_name} · ` : ""}{rental.start_date} – {rental.end_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-700">{rental.status}</div>
                      <div className="text-xs text-slate-500 mt-1">TZS {rental.rent_amount || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !editMode ? (
          <>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Property Information</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-8">
              <div><div className="text-slate-400 text-xs">Property Name</div><div className="font-semibold text-slate-900">{selectedProperty.name}</div></div>
              <div><div className="text-slate-400 text-xs">Property Type</div><div className="font-semibold text-slate-900">{selectedProperty.property_type || 'Not provided'}</div></div>
              <div><div className="text-slate-400 text-xs">Status</div><div className="font-semibold text-slate-900">{selectedProperty.status}</div></div>
              <div><div className="text-slate-400 text-xs">Street Address</div><div className="font-semibold text-slate-900">{selectedProperty.street_address || 'Not provided'}</div></div>
              <div><div className="text-slate-400 text-xs">Region</div><div className="font-semibold text-slate-900">{selectedProperty.region || 'Not provided'}</div></div>
              <div><div className="text-slate-400 text-xs">District</div><div className="font-semibold text-slate-900">{selectedProperty.district || 'Not provided'}</div></div>
              <div><div className="text-slate-400 text-xs">Ward</div><div className="font-semibold text-slate-900">{selectedProperty.ward || 'Not provided'}</div></div>
              <div><div className="text-slate-400 text-xs">Property Code</div><div className="font-semibold text-slate-900">{selectedProperty.property_code || 'Not provided'}</div></div>
              <div className="col-span-2"><div className="text-slate-400 text-xs">Description</div><div className="font-semibold text-slate-900">{selectedProperty.description || 'Not provided'}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Units</div><div className="text-2xl font-extrabold text-slate-900">{selectedProperty.unit_count || 0}</div></div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Occupied</div><div className="text-2xl font-extrabold text-emerald-600">{selectedProperty.occupied_count || 0}</div></div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vacant</div><div className="text-2xl font-extrabold text-amber-600">{selectedProperty.vacant_count || 0}</div></div>
            </div>
          </>
        ) : (
          <form onSubmit={async(e)=>{e.preventDefault(); if(saveState!=="idle") return; const original=selectedProperty; setSaveState("saving"); setSaveError(""); try{const result=await saveModuleJson(`/api/property/properties/${selectedProperty.id}`,"PATCH",{name:selectedProperty.name,property_type:selectedProperty.property_type,status:selectedProperty.status,street_address:selectedProperty.street_address,region:selectedProperty.region,district:selectedProperty.district,ward:selectedProperty.ward,description:selectedProperty.description,property_code:selectedProperty.property_code}); if(result.ok){ if(result.queued){ setSaveState("saved"); setTimeout(()=>{setEditMode(false);setSaveState("idle");},900); return;} const saved=result.data.data||result.data; const linked={units:selectedProperty.units,rentals:selectedProperty.rentals,tenants:selectedProperty.tenants,unit_count:selectedProperty.unit_count,occupied_count:selectedProperty.occupied_count,vacant_count:selectedProperty.vacant_count,maintenance_count:selectedProperty.maintenance_count}; setSaveState("saved"); setSelectedProperty({...saved,...linked}); setItems((prev:any)=>prev.map((p:any)=>p.id===selectedProperty.id?{...p,...saved,...linked}:p)); setTimeout(()=>{setEditMode(false);setSaveState("idle");},900); } else{ setSaveError(result.error||"Save failed"); setSaveState("idle"); } } catch(err){ setSaveError("Network error"); setSaveState("idle"); }}}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Edit Property</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <input required value={selectedProperty.name} onChange={e=>setSelectedProperty({...selectedProperty,name:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Property Name" />
              <select value={PROPERTY_TYPES.includes(selectedProperty.property_type) ? selectedProperty.property_type : "House"} onChange={e=>setSelectedProperty({...selectedProperty,property_type:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
              <select value={selectedProperty.status||'Active'} onChange={e=>setSelectedProperty({...selectedProperty,status:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300"><option>Active</option><option>Inactive</option></select>
              <input value={selectedProperty.street_address||''} onChange={e=>setSelectedProperty({...selectedProperty,street_address:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Street Address" />
              <input value={selectedProperty.region||''} onChange={e=>setSelectedProperty({...selectedProperty,region:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Region" />
              <input value={selectedProperty.district||''} onChange={e=>setSelectedProperty({...selectedProperty,district:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="District" />
              <input value={selectedProperty.ward||''} onChange={e=>setSelectedProperty({...selectedProperty,ward:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Ward" />
              <input value={selectedProperty.property_code||''} onChange={e=>setSelectedProperty({...selectedProperty,property_code:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" placeholder="Property Code" />
            </div>
            <textarea value={selectedProperty.description||''} onChange={e=>setSelectedProperty({...selectedProperty,description:e.target.value})} className="w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300 mb-4" rows={3} placeholder="Description" />
            <div className="flex gap-3"><button type="submit" disabled={saveState!=="idle"} className={`px-6 py-2.5 rounded-xl font-semibold shadow-lg min-w-[140px] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-90 ${saveState==="saved" ? "bg-emerald-600 text-white shadow-emerald-200/40" : "bg-[#0b2244] text-white shadow-indigo-200/40"}`}>{saveState==="saving"?<span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>:saveState==="saved"?<span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</span>:"Save Changes"}</button><button type="button" onClick={()=>{setEditMode(false);setSaveState("idle");setSaveError("");}} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Cancel</button>{saveError&&<p className="text-red-600 text-sm mt-3 w-full">{saveError}</p>}</div>
          </form>
        )}
        <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
          <button onClick={()=>setEditMode(true)} className="flex-1 bg-white border border-slate-200 text-slate-900 px-5 py-3 rounded-2xl font-semibold hover:bg-slate-50 transition shadow-sm">Edit Property</button>
          <a href={"/property/units?property=" + (selectedProperty ? selectedProperty.id : "")} className="flex-1 bg-[#0b2244] text-white px-5 py-3 rounded-2xl font-semibold text-center hover:bg-[#091e3d] transition shadow-lg shadow-indigo-200/40">Manage Units</a>
        </div>
      </div>
    </div>
  </div>
)}
    </main>
  );
}
