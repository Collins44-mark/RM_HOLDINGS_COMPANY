export default function PropertiesPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-3xl font-extrabold">Properties</h1><p className="text-slate-400 text-sm">Manage registered properties.</p></div>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-slate-900 px-4 py-2 rounded-xl font-medium">+ Add Property</button>
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <input type="text" placeholder="Search properties..." className="w-full bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 mb-4" />
          <table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-400 border-b border-white/10"><th className="pb-2">Name</th><th>Type</th><th>Location</th><th>Units</th><th>Status</th></tr></thead><tbody><tr className="border-b border-white/5"><td className="py-3">—</td><td>—</td><td>—</td><td>0</td><td><span className="text-xs bg-amber-900/40 text-amber-200 px-2 py-0.5 rounded">No records</span></td></tr></tbody></table>
        </div>
      </div>
    </main>
  );
}
