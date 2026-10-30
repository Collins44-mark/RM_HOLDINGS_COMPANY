import { formatTzs } from "@/lib/format/currency";
import { isAppDatabaseAvailable } from "@/lib/db";

export default async function PropertyPage() {
  const dbAvail = isAppDatabaseAvailable();
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#0b1221] to-[#1e293b] text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Properties & Rentals</h1>
          <p className="text-slate-400 mt-1">Portfolio overview and rental performance</p>
        </header>

        {!dbAvail && (
          <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl px-4 py-3 text-amber-200 text-sm mb-6">Production database unavailable in this environment. Showing empty state.</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Properties", value: dbAvail ? "—" : "0", sub: "Holdings" },
            { label: "Total Units", value: dbAvail ? "—" : "0", sub: "Across properties" },
            { label: "Rent Collected", value: dbAvail ? "—" : formatTzs(0), sub: "Paid invoices" },
            { label: "Outstanding Rent", value: dbAvail ? "—" : formatTzs(0), sub: "Pending + overdue" },
          ].map((m) => (
            <div key={m.label} className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-xl shadow-black/20">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-widest">{m.label}</div>
              <div className="text-2xl font-extrabold text-white mt-1">{m.value}</div>
              <div className="text-xs text-slate-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/20">
            <h3 className="font-bold text-white mb-4">Monthly Rental Income</h3>
            <div className="h-48 flex items-end gap-3 bg-black/20 rounded-xl px-4 py-3">
              {[40, 55, 30, 70, 45, 60].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end h-full"><div className="w-full bg-indigo-400/90 rounded-t-md" style={{ height: `${h}%` }} /></div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">Real data not yet available — placeholder structure shown.</p>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/20">
            <h3 className="font-bold text-white mb-4">Unit Occupancy</h3>
            <div className="h-48 flex items-center justify-center"><span className="text-slate-400 text-sm">No occupancy data</span></div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/20 mb-8">
          <h3 className="font-bold text-white mb-3">Recent Rent Invoices</h3>
          <table className="w-full text-sm border-collapse text-slate-200">
            <thead><tr className="text-left text-xs font-semibold text-slate-400 border-b border-white/10"><th className="pb-2">Tenant</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Due</th></tr></thead>
            <tbody><tr className="border-b border-white/5"><td className="py-3 text-slate-400">—</td><td className="py-3">{formatTzs(0)}</td><td className="py-3"><span className="text-xs bg-white/10 px-2 py-0.5 rounded">none</span></td><td className="py-3 text-slate-400">—</td></tr></tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/20"><h3 className="font-bold text-white mb-2">Rent Status Overview</h3><p className="text-sm text-slate-400">Paid / Pending / Overdue — unavailable in this environment.</p></div>
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 shadow-xl shadow-indigo-900/40 text-white"><h3 className="font-bold mb-3">Quick Actions</h3><div className="grid grid-cols-2 gap-2 text-xs"><a href="#" className="bg-white/10 rounded-lg p-2">+ Unit</a><a href="#" className="bg-white/10 rounded-lg p-2">+ Contract</a><a href="#" className="bg-white/10 rounded-lg p-2">Invoice</a><a href="#" className="bg-white/10 rounded-lg p-2">Expense</a></div></div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl shadow-black/20"><h3 className="font-bold text-white mb-2">Module Navigation</h3><div className="flex flex-wrap gap-2 text-xs"><a href="/property" className="bg-white/10 px-2 py-1 rounded">Dashboard</a><a href="/property/units" className="bg-white/10 px-2 py-1 rounded">Units</a><a href="/property/tenants" className="bg-white/10 px-2 py-1 rounded">Tenants</a><a href="/property/contracts" className="bg-white/10 px-2 py-1 rounded">Contracts</a><a href="/property/invoices" className="bg-white/10 px-2 py-1 rounded">Invoices</a><a href="/property/hall-bookings" className="bg-white/10 px-2 py-1 rounded">Hall</a><a href="/property/expenses" className="bg-white/10 px-2 py-1 rounded">Expenses</a><a href="/property/reports" className="bg-white/10 px-2 py-1 rounded">Reports</a></div></div>
        </div>
      </div>
    </main>
  );
}
