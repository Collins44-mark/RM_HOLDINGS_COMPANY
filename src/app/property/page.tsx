import { formatTzs } from "@/lib/format/currency";
import { isAppDatabaseAvailable } from "@/lib/db";

export default async function PropertyPage() {
  const dbAvail = isAppDatabaseAvailable();
  const metrics = [
    { label: "Total Properties", value: dbAvail ? "—" : "0" },
    { label: "Total Units", value: dbAvail ? "—" : "0" },
    { label: "Rent Collected", value: dbAvail ? "—" : formatTzs(0) },
    { label: "Outstanding Rent", value: dbAvail ? "—" : formatTzs(0) },
  ];
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Properties & Rentals</h1>
          <p className="text-slate-500 mt-1">Portfolio overview and rental performance</p>
        </div>

        {!dbAvail && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm mb-6">Production database unavailable in this environment. Showing empty state.</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{m.label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 lg:col-span-2">
            <h3 className="font-bold text-slate-900 mb-4">Monthly Rental Income</h3>
            <div className="h-48 flex items-end gap-3 bg-slate-50 rounded-xl px-4 py-3">
              {[40, 55, 30, 70, 45, 60].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end h-full">
                  <div className="w-full bg-slate-800 rounded-t-md" style={{ height: `${h}%` }} />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">Real data not yet available — placeholder structure shown.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-900 mb-4">Unit Occupancy</h3>
            <div className="h-48 flex items-center justify-center bg-slate-50 rounded-xl"><span className="text-slate-300 text-sm">No occupancy data</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
          <h3 className="font-bold text-slate-900 mb-3">Recent Rent Invoices</h3>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="text-left text-xs font-semibold text-slate-400 border-b"><th className="pb-2">Tenant</th><th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2">Due</th></tr></thead>
            <tbody><tr className="border-b"><td className="py-3 text-slate-400">—</td><td className="py-3">{formatTzs(0)}</td><td className="py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">none</span></td><td className="py-3 text-slate-400">—</td></tr></tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"><h3 className="font-bold mb-2">Rent Status</h3><p className="text-sm text-slate-400">Paid / Pending / Overdue — unavailable in this environment.</p></div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"><h3 className="font-bold mb-2">Quick Actions</h3><div className="flex flex-wrap gap-2 text-xs"><a href="#" className="bg-slate-900 text-white px-3 py-1.5 rounded-lg">+ Unit</a><a href="#" className="bg-slate-900 text-white px-3 py-1.5 rounded-lg">+ Contract</a><a href="#" className="bg-slate-900 text-white px-3 py-1.5 rounded-lg">Invoice</a></div></div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"><h3 className="font-bold mb-2">Module Navigation</h3><div className="flex flex-wrap gap-2 text-xs"><a href="/property" className="bg-slate-100 px-2 py-1 rounded">Dashboard</a><a href="/property/units" className="bg-slate-100 px-2 py-1 rounded">Units</a><a href="/property/tenants" className="bg-slate-100 px-2 py-1 rounded">Tenants</a><a href="/property/contracts" className="bg-slate-100 px-2 py-1 rounded">Contracts</a><a href="/property/invoices" className="bg-slate-100 px-2 py-1 rounded">Invoices</a><a href="/property/hall-bookings" className="bg-slate-100 px-2 py-1 rounded">Hall</a><a href="/property/expenses" className="bg-slate-100 px-2 py-1 rounded">Expenses</a><a href="/property/reports" className="bg-slate-100 px-2 py-1 rounded">Reports</a></div></div>
        </div>
      </div>
    </main>
  );
}
