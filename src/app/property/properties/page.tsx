"use client"
import { useState, useEffect } from "react";
import { MoreVertical } from "lucide-react";

export default function PropertiesPage() {
  const user = (globalThis as any)?.user || { businessUnitId: "test-bu" };
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propType, setPropType] = useState("");
  const [status, setStatus] = useState("Active");
  const [error, setError] = useState("");
  const [items, setItems] = useState([]); const [selectedProperty, setSelectedProperty] = useState<any>(null); const [editMode, setEditMode] = useState(false); const [saveState, setSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle"); const [saveError, setSaveError] = useState("");
  useEffect(() => { fetch("/api/property/properties").then(r => r.json()).then(d => { if (d && d.data) setItems(d.data); }).catch(() => {}); }, []);
  return (
    <main className="min-h-screen p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold">Properties</h1>
            <p className="text-slate-500 text-sm">Manage and organize all your registered properties.</p>
          </div>
          <button onClick={()=>setFormOpen(true)} className="bg-[#0b2244] hover:bg-[#091e3d] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ Add Property</button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[{label:"Total Properties",val:items.length},{label:"Active Properties",val:items.filter((i:any)=>i.status==="Active").length},{label:"Total Units",val:0},{label:"Under Maintenance",val:0}].map(({label,val}) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{val}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="text" placeholder="Search properties..." className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Property Type</option></select>
          <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Status</option></select>
          <button className="text-sm text-slate-500 hover:text-slate-800">Clear Filters</button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr className="text-left text-xs font-semibold text-slate-500"><th className="px-4 py-3">Property Name</th><th>Type</th><th>Location</th><th>Units</th><th>Occupied</th><th>Vacant</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.length === 0 ? (<tr className="border-t border-slate-100"><td className="px-4 py-3 text-slate-800 font-medium">—</td><td>—</td><td>—</td><td>0</td><td>0</td><td>0</td><td><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">No records</span></td><td><button onClick={()=>setSelectedProperty(null)} className="text-slate-600 hover:text-slate-900 p-1"><MoreVertical size={16} /></button></td></tr>) : (items.map((it: any) => (<tr key={it.id} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-800 font-medium">{it.name}</td><td>{it.property_type}</td><td>{it.street_address || it.region || it.district || 'Location not provided'}</td><td>0</td><td>0</td><td>0</td><td><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{it.status}</span></td><td><button onClick={()=>setSelectedProperty(it)} className="text-slate-600 hover:text-slate-900 p-1"><MoreVertical size={16} /></button></td></tr>)))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {items.length === 0 && (<div className="mt-8 bg-white rounded-2xl p-10 text-center border border-slate-200/60 shadow-sm">
          <h3 className="text-xl font-bold text-slate-800 mb-2">No properties registered yet.</h3>
          <p className="text-slate-500 mb-4">Start by adding your first property to manage its units and rental activities.</p>
          <button onClick={()=>setFormOpen(true)} className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-medium">+ Add Property</button>
        </div>)}
      </div>
{formOpen && (<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={async e=>{e.preventDefault();try{const r=await fetch("/api/property/properties",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,address,property_type:propType,status,business_unit_id:""})});if(r.ok){setFormOpen(false);window.location.reload();}else{try{const d=await r.json();setError(d.error||"Save failed");}catch{setError("Save failed");}}}catch{setError("Network error");}}} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md"><h3 className="text-xl font-bold mb-4">Add Property</h3><input required placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><input placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><input placeholder="Type" value={propType} onChange={e=>setPropType(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><select value={status} onChange={e=>setStatus(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"><option>Active</option><option>Inactive</option></select><div className="flex gap-3"><button type="submit" className="bg-[#0b2244] text-white px-4 py-2 rounded-xl">Save</button><button type="button" onClick={()=>setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button></div>{error&&<p className="text-red-600 text-sm mt-2">{error}</p>}</form></div>)}
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
          <button key={tab} onClick={()=>{}} className={`px-3 py-2 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${tab==='Details'?'border-[#0b2244] text-[#0b2244]':'border-transparent text-slate-400 hover:text-slate-600'}`}>{tab}</button>
        ))}
      </div>
      {/* Details content */}
      <div className="px-8 py-6 flex-1">
        {!editMode ? (
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
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Units</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Occupied</div><div className="text-2xl font-extrabold text-emerald-600">0</div></div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100"><div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vacant</div><div className="text-2xl font-extrabold text-amber-600">0</div></div>
            </div>
          </>
        ) : (
          <form onSubmit={async(e)=>{e.preventDefault(); if(saveState!=="idle") return; const original=selectedProperty; setSaveState("saving"); setSaveError(""); try{const r=await fetch(`/api/property/properties/${selectedProperty.id}`,{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:selectedProperty.name,property_type:selectedProperty.property_type,status:selectedProperty.status,street_address:selectedProperty.street_address,region:selectedProperty.region,district:selectedProperty.district,ward:selectedProperty.ward,description:selectedProperty.description,property_code:selectedProperty.property_code})}); if(r.ok){ const data=await r.json(); setSaveState("saved"); setSelectedProperty(data.data||data); setItems((prev:any)=>prev.map((p:any)=>p.id===selectedProperty.id?{...p,...(data.data||data)}:p)); setTimeout(()=>{setEditMode(false);setSaveState("idle");},900); } else{ let msg="Save failed"; try{const d=await r.json(); msg=d.error||msg;}catch{} setSaveError(msg); setSaveState("idle"); } } catch(err){ setSaveError("Network error"); setSaveState("idle"); }}}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Edit Property</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <input required value={selectedProperty.name} onChange={e=>setSelectedProperty({...selectedProperty,name:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Property Name" />
              <input value={selectedProperty.property_type||''} onChange={e=>setSelectedProperty({...selectedProperty,property_type:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Property Type" />
              <select value={selectedProperty.status||'Active'} onChange={e=>setSelectedProperty({...selectedProperty,status:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"><option>Active</option><option>Inactive</option></select>
              <input value={selectedProperty.street_address||''} onChange={e=>setSelectedProperty({...selectedProperty,street_address:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Street Address" />
              <input value={selectedProperty.region||''} onChange={e=>setSelectedProperty({...selectedProperty,region:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Region" />
              <input value={selectedProperty.district||''} onChange={e=>setSelectedProperty({...selectedProperty,district:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="District" />
              <input value={selectedProperty.ward||''} onChange={e=>setSelectedProperty({...selectedProperty,ward:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Ward" />
              <input value={selectedProperty.property_code||''} onChange={e=>setSelectedProperty({...selectedProperty,property_code:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Property Code" />
            </div>
            <textarea value={selectedProperty.description||''} onChange={e=>setSelectedProperty({...selectedProperty,description:e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-4" rows={3} placeholder="Description" />
            <div className="flex gap-3"><button type="submit" disabled={saveState!=="idle"} className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-200/40 min-w-[140px] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-90">{saveState==="saving"?<span className="flex items-center gap-2"><span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>Saving...</span>:saveState==="saved"?<span>✓ Saved</span>:"Save Changes"}</button><button type="button" onClick={()=>{setEditMode(false);setSaveState("idle");setSaveError("");}} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Cancel</button>{saveError&&<p className="text-red-600 text-sm mt-3 w-full">{saveError}</p>}</div>
          </form>
        )}
        <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100">
          <button onClick={()=>setEditMode(true)} className="flex-1 bg-white border border-slate-200 text-slate-900 px-5 py-3 rounded-2xl font-semibold hover:bg-slate-50 transition shadow-sm">Edit Property</button>
          <a href={"/unit/properties?propertyId=" + (selectedProperty ? selectedProperty.id : "")} className="flex-1 bg-[#0b2244] text-white px-5 py-3 rounded-2xl font-semibold text-center hover:bg-[#091e3d] transition shadow-lg shadow-indigo-200/40">Manage Units</a>
        </div>
      </div>
    </div>
  </div>
)}
    </main>
  );
}
