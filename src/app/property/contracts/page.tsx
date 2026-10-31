export default function Page() {
  return (
    <main className="min-h-screen p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-3xl font-extrabold">contracts</h1><p className="text-slate-500 text-sm">Manage contracts.</p></div>
          <button className="bg-[#0b2244] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-200/40">+ Add contracts</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Total</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Active</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Pending</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60"><div className="text-xs font-semibold text-slate-400 uppercase">Completed</div><div className="text-2xl font-extrabold text-slate-900">0</div></div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
          <div className="flex gap-3 mb-4"><input placeholder="Search..." className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm flex-1" /><select className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Filter</option></select><button className="text-sm text-slate-500">Clear</button></div>
          <table className="w-full text-sm"><thead className="bg-slate-50"><tr className="text-left text-xs font-semibold text-slate-500"><th className="px-3 py-2">Ref</th><th>Name</th><th>Status</th><th>Action</th></tr></thead><tbody><tr className="border-t"><td className="px-3 py-3 text-slate-400">—</td><td>—</td><td><span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">No records</span></td><td><button className="text-indigo-600 text-xs">View</button></td></tr></tbody></table>
        </div>
        <div className="mt-8 bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm"><h3 className="text-xl font-bold text-slate-800 mb-2">No contracts found.</h3><p className="text-slate-500 mb-4">Add your first record to get started.</p><button className="bg-[#0b2244] text-white px-6 py-2.5 rounded-xl font-medium">+ Add contracts</button></div>
      </div>
    </main>
  );
}
