"use client"
import { useState, useEffect } from "react";
import { MoreVertical, Building2, Users, Wrench, Receipt } from "lucide-react";

export default function UnitsPage() {
  const [items, setItems] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [unitType, setUnitType] = useState("Apartment");
  const [status, setStatus] = useState("Vacant");
  const [rent, setRent] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState([]);

  useEffect(() => { fetch("/api/property/units").then(r=>r.json()).then(d=>{if(d&&d.data)setItems(d.data)}).catch(()=>{}); }, []);
  useEffect(() => { fetch("/api/property/properties").then(r=>r.json()).then(d=>{if(d&&d.data)setProperties(d.data)}).catch(()=>{}); }, []);

  const active = items.filter((i:any)=>i.status==="Occupied").length;
  const vacant = items.filter((i:any)=>i.status==="Vacant").length;
  const maint = items.filter((i:any)=>i.status==="Maintenance").length;

  const handleSave = async (e: any) => { e.preventDefault(); try { const r = await fetch("/api/property/units", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, unit_type: unitType, status, monthly_rent: rent ? parseFloat(rent) : 0, property_id: propertyId }) }); if (r.ok) { setFormOpen(false); setName(""); setRent(""); setPropertyId(""); window.location.reload(); } } catch {} };

  return (
    <main className="min-h-screen p-6 md:p-10 text-slate-900"><div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-3xl font-extrabold">Units</h1><p className="text-slate-500 text-sm">Manage all rental units.</p></div><button onClick={()=>setFormOpen(true)} className="bg-[#0b2244] text-white px-4 py-2.5 rounded-xl font-medium">+ Add Unit</button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Total Units</div><div className="text-2xl font-extrabold text-slate-900">{items.length}</div></div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Occupied</div><div className="text-2xl font-extrabold text-emerald-600">{active}</div></div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Vacant</div><div className="text-2xl font-extrabold text-amber-600">{vacant}</div></div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Maintenance</div><div className="text-2xl font-extrabold text-rose-600">{maint}</div></div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-2">Unit Name</th><th>Status</th><th>Tenant</th><th>Action</th></tr></thead><tbody>
          {items.map((it:any)=>(<tr key={it.id} className="border-t"><td className="px-3 py-3 font-medium">{it.name}</td><td><span className={`text-xs px-2 py-0.5 rounded-full ${it.status==="Occupied"?"bg-emerald-50 text-emerald-700":it.status==="Vacant"?"bg-amber-50 text-amber-700":"bg-rose-50 text-rose-700"}`}>{it.status}</span></td><td className="px-3 py-3 text-slate-500">{it.tenant_name||"No Tenant Assigned"}</td><td><div className="relative"><button onClick={()=>{setOpenMenuId(openMenuId===it.id?null:it.id); setSelectedUnit(it)}} className="text-slate-600 hover:text-slate-900 p-1"><MoreVertical size={16}/></button>{openMenuId===it.id&&(<div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-slate-100 w-40 z-20"><button onClick={()=>{setDrawerOpen(true); setEditMode(false);}} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">View Details</button><button onClick={()=>{setEditMode(true); setDrawerOpen(true);}} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">Edit Unit</button><button onClick={()=>{if(confirm("Delete?"))fetch(`/api/property/units/${it.id}`,{method:"DELETE"}).then(()=>window.location.reload())}} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button></div>)}</div></td></tr>))}
        </tbody></table>
      </div>

      {drawerOpen && selectedUnit && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={e=>{if(e.target===e.currentTarget){setDrawerOpen(false);setEditMode(false);}}}>
          <div className="w-full sm:w-[480px] bg-white h-full shadow-2xl rounded-l-3xl p-8 overflow-y-auto">
            <div className="flex justify-between mb-4"><h2 className="text-xl font-bold">{editMode?"Edit":"Details"}</h2><button onClick={()=>{setDrawerOpen(false);setEditMode(false);}}>✕</button></div>
            {!editMode ? (
              <div className="space-y-3 text-sm"><div><b>Unit Name:</b> {selectedUnit.name}</div><div><b>Property:</b> {selectedUnit.property_name||"Not linked"}</div><div><b>Status:</b> <span className={`text-xs px-2 py-0.5 rounded-full ${selectedUnit.status==="Occupied"?"bg-emerald-50 text-emerald-700":selectedUnit.status==="Vacant"?"bg-amber-50 text-amber-700":"bg-rose-50 text-rose-700"}`}>{selectedUnit.status}</span></div><div><b>Tenant:</b> {selectedUnit.tenant_name||"No Tenant Assigned"}</div><div><b>Rent:</b> TZS {selectedUnit.monthly_rent||0}</div></div>
            ) : (
              <form onSubmit={handleSave} className="space-y-3"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Unit Name" className="w-full px-3 py-2 border rounded-lg"/><select value={status} onChange={e=>setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option>Vacant</option><option>Occupied</option><option>Maintenance</option></select><select value={propertyId} onChange={e=>setPropertyId(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">Select Property</option>{properties.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="number" value={rent} onChange={e=>setRent(e.target.value)} placeholder="Monthly Rent" className="w-full px-3 py-2 border rounded-lg"/><button type="submit" className="bg-[#0b2244] text-white px-4 py-2 rounded-xl">Save</button></form>
            )}
          </div>
        </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md"><h3 className="text-xl font-bold mb-4">Add Unit</h3><form onSubmit={handleSave} className="space-y-3"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Unit Name" className="w-full px-3 py-2 border rounded-lg"/><select required value={propertyId} onChange={e=>setPropertyId(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option value="">Select Property</option>{properties.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input value={unitType} onChange={e=>setUnitType(e.target.value)} placeholder="Type" className="w-full px-3 py-2 border rounded-lg"/><select value={status} onChange={e=>setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg"><option>Vacant</option><option>Occupied</option><option>Maintenance</option></select><input type="number" value={rent} onChange={e=>setRent(e.target.value)} placeholder="Monthly Rent" className="w-full px-3 py-2 border rounded-lg"/><div className="flex gap-3"><button type="submit" className="bg-[#0b2244] text-white px-4 py-2 rounded-xl">Save</button><button type="button" onClick={()=>setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button></div></form></div></div>
      )}
    </main>
  );
}