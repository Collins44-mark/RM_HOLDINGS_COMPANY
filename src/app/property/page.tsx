import { isAppDatabaseAvailable } from "@/lib/db";

export default async function PropertyPage() {
  const dbAvail = isAppDatabaseAvailable();
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">Properties & Rentals</h1>
        <p className="text-slate-500 mb-8">Summary dashboard</p>

        {!dbAvail && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-amber-700 text-sm">
            Database unavailable in this environment (SQLite not accessible on Vercel). Showing empty state.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Properties", value: dbAvail ? "—" : "0" },
            { label: "Total Units", value: dbAvail ? "—" : "0" },
            { label: "Rent Collected", value: dbAvail ? "—" : "£0" },
            { label: "Outstanding Rent", value: dbAvail ? "—" : "£0" },
          ].map((c) => (
            <div key={c.label} className="bg-white/70 backdrop-blur-xl rounded-3xl p-5 shadow-xl shadow-slate-200/40 border border-white/40">
              <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">{c.label}</div>
              <div className="text-3xl font-extrabold text-slate-800">{c.value}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Monthly Rental Income</h3>
            <div className="h-40 flex items-end gap-2 bg-slate-50 rounded-xl p-3">
              {[40, 60, 35, 75, 50, 65].map((h, i) => <div key={i} className="flex-1 bg-indigo-500/70 rounded-t" style={{ height: `${h}%` }} />)}
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Unit Occupancy</h3>
            <div className="h-40 flex items-center justify-center"><span className="text-2xl text-slate-400">No data</span></div>
          </div>
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 shadow-xl text-white">
            <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2 text-sm"><a href="#" className="bg-white/10 rounded-lg p-2">+ Add Unit</a><a href="#" className="bg-white/10 rounded-lg p-2">+ Contract</a><a href="#" className="bg-white/10 rounded-lg p-2">Invoice</a><a href="#" className="bg-white/10 rounded-lg p-2">Expense</a></div>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40 mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Recent Rent Invoices</h3>
          {dbAvail ? (
            <div className="text-sm text-slate-500">No invoice records available.</div>
          ) : (
            <table className="w-full text-sm border-collapse"><thead><tr className="text-left text-xs font-semibold text-slate-500 border-b"><th className="pb-2">Tenant</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Due</th></tr></thead><tbody><tr className="border-b"><td className="py-3">—</td><td className="py-3">£0.00</td><td className="py-3"><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">none</span></td><td className="py-3">—</td></tr></tbody></table>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40"><h3 className="font-semibold mb-2">Rent Status</h3><div className="text-sm text-slate-500">Paid / Pending / Overdue — unavailable in this environment.</div></div>
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40"><h3 className="font-semibold mb-2">Module Navigation</h3><div className="flex flex-wrap gap-2 text-xs"><a href="/property" className="bg-slate-100 px-2 py-1 rounded">Dashboard</a><a href="/property/units" className="bg-slate-100 px-2 py-1 rounded">Units</a><a href="/property/tenants" className="bg-slate-100 px-2 py-1 rounded">Tenants</a><a href="/property/contracts" className="bg-slate-100 px-2 py-1 rounded">Contracts</a><a href="/property/invoices" className="bg-slate-100 px-2 py-1 rounded">Invoices</a><a href="/property/hall-bookings" className="bg-slate-100 px-2 py-1 rounded">Hall</a><a href="/property/expenses" className="bg-slate-100 px-2 py-1 rounded">Expenses</a><a href="/property/reports" className="bg-slate-100 px-2 py-1 rounded">Reports</a></div></div>
        </div>
      </div>
    </main>
  );
}
