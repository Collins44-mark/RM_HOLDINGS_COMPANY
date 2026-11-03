"use client"
import { useState, useEffect } from "react";

export default function PropertiesPage() {
  const user = (globalThis as any)?.user || { businessUnitId: "test-bu" };
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [propType, setPropType] = useState("");
  const [status, setStatus] = useState("Active");
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
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
          {["Total Properties","Active Properties","Total Units","Under Maintenance"].map((label) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">0</div>
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
              <tr className="border-t border-slate-100"><td className="px-4 py-3 text-slate-800 font-medium">—</td><td>—</td><td>—</td><td>0</td><td>0</td><td>0</td><td><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">No records</span></td><td><button className="text-indigo-600 hover:text-indigo-800 text-xs">View</button></td></tr>
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        <div className="mt-8 bg-white rounded-2xl p-10 text-center border border-slate-200/60 shadow-sm">
          <h3 className="text-xl font-bold text-slate-800 mb-2">No properties registered yet.</h3>
          <p className="text-slate-500 mb-4">Start by adding your first property to manage its units and rental activities.</p>
          <button onClick={()=>setFormOpen(true)} className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-medium">+ Add Property</button>
        </div>
      </div>
{formOpen && (<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={async e=>{e.preventDefault();try{const r=await fetch("/api/property/properties",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,address,property_type:propType,status,business_unit_id:""})});if(r.ok){setFormOpen(false);window.location.reload();}else{try{const d=await r.json();setError(d.error||"Save failed");}catch{setError("Save failed");}}}catch{setError("Network error");}}} className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md"><h3 className="text-xl font-bold mb-4">Add Property</h3><input required placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><input placeholder="Address" value={address} onChange={e=>setAddress(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><input placeholder="Type" value={propType} onChange={e=>setPropType(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"/><select value={status} onChange={e=>setStatus(e.target.value)} className="w-full mb-3 px-3 py-2 border rounded-lg"><option>Active</option><option>Inactive</option></select><div className="flex gap-3"><button type="submit" className="bg-[#0b2244] text-white px-4 py-2 rounded-xl">Save</button><button type="button" onClick={()=>setFormOpen(false)} className="px-4 py-2 border rounded-xl">Cancel</button></div>{error&&<p className="text-red-600 text-sm mt-2">{error}</p>}</form></div>)}
    </main>
  );
}
