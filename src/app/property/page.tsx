import { getPropertyDashboardData } from "@/actions/property/dashboard";
import { formatTzs } from "@/lib/format/currency";
import { Landmark, Building2, User, Receipt, Eye, Plus, CalendarDays } from "lucide-react";

export default async function PropertyDashboardPage() {
  const data = await getPropertyDashboardData();
  const s = data.stats as { properties: number; totalUnits: number; occupied: number; vacant: number; occupancyPct: number; rentCollected: number; paid: number; unpaid: number; overdue: number; totalInv: number; paidAmount: number; unpaidAmount: number; overdueAmount: number; };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Properties & Rentals</h1>
          <p className="text-sm text-slate-500 mt-1">Manage properties, units, tenants, rentals and hall bookings.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200" defaultValue="This Month">
            <option>Today</option><option>This Week</option><option>This Month</option><option>This Year</option><option>Custom Range</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={Building2} label="Total Properties" value={String(s.properties)} />
        <Card icon={User} label="Total Units" value={String(s.totalUnits)} />
        <Card icon={Receipt} label="Rent Collected" value={formatTzs(s.rentCollected)} />
        <Card icon={Landmark} label="Outstanding Rent" value={formatTzs(s.unpaidAmount + s.overdueAmount)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6">
          <h3 className="text-base font-semibold text-slate-800">Monthly Rental Income</h3>
          <div className="flex items-end gap-2 h-48 mt-4">
            {(data.monthlyIncome.length ? data.monthlyIncome : [{month:"Jan",amount:0},{month:"Feb",amount:1200000},{month:"Mar",amount:1800000}] as {month:string;amount:number}[]).map((m: {month:string;amount:number}) => (
              <div key={m.month} className="flex-1 flex flex-col justify-end gap-1" title={`${m.month}: ${formatTzs(m.amount)}`}>
                <div className="w-full rounded-t-md bg-blue-500/90 hover:bg-blue-600 transition" style={{ height: `${Math.max(12, Math.min(100, (Number(m.amount) / 3000000) * 100))}%` }} />
                <span className="text-[10px] text-slate-400 text-center">{m.month}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6">
          <h3 className="text-base font-semibold text-slate-800">Unit Occupancy</h3>
          <div className="flex items-center gap-6 mt-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg]">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray={`${s.occupancyPct}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-slate-800">{s.totalUnits}</span>
              </div>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> <span>Occupied <b>{s.occupied}</b></span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-300" /> <span>Vacant <b>{s.vacant}</b></span></div>
              <div className="text-xs text-slate-500">{s.occupancyPct}% occupied</div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Recent Rent Invoices</h3>
            <a href="/property/rent-invoices" className="text-sm text-blue-600 hover:underline">View All</a>
          </div>
          <table className="w-full text-sm mt-4">
            <thead><tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100"><th className="text-left py-2">Invoice</th><th className="text-left">Tenant</th><th>Property / Unit</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.recentInvoices.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-400 py-6">No invoices found</td></tr>
              ) : data.recentInvoices.map((inv: { id: string; amount: number | string; dueDate?: string | Date; status: string; contract?: { tenant?: { name?: string }; unit?: { property?: { name?: string }; name?: string } } }) => (
                <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="py-2.5 font-medium text-slate-800">{inv.id.slice(0, 8).toUpperCase()}</td>
                  <td className="py-2.5 text-slate-600">{inv.contract?.tenant?.name ?? "—"}</td>
                  <td className="py-2.5 text-slate-600">{inv.contract?.unit?.property?.name ?? "—"} / {inv.contract?.unit?.name ?? "—"}</td>
                  <td className="py-2.5 font-medium">{formatTzs(Number(inv.amount))}</td>
                  <td className="py-2.5 text-slate-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-TZ") : "—"}</td>
                  <td className="py-2.5"><StatusBadge status={inv.status} /></td>
                  <td className="py-2.5"><a href="/property/rent-invoices" className="text-blue-600 hover:underline"><Eye className="w-4 h-4 inline" /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6">
          <h3 className="text-base font-semibold text-slate-800">Rent Status Overview</h3>
          <div className="mt-4 space-y-3">
            <Row label="Paid Invoices" count={s.paid} amount={s.paidAmount} />
            <Row label="Unpaid Invoices" count={s.unpaid} amount={s.unpaidAmount} />
            <Row label="Overdue Invoices" count={s.overdue} amount={s.overdueAmount} />
            <Row label="Total Invoices" count={s.totalInv} amount={s.paidAmount + s.unpaidAmount + s.overdueAmount} bold />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <QuickCard icon={Building2} label="Add Property" href="/property/properties" />
        <QuickCard icon={User} label="Add Unit" href="/property/units" />
        <QuickCard icon={User} label="Add Tenant" href="/property/tenants" />
        <QuickCard icon={Receipt} label="Create Invoice" href="/property/rent-invoices" />
        <QuickCard icon={CalendarDays} label="Hall Booking" href="/property/hall-bookings" />
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-5 hover:shadow-lg transition">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-inner"><Icon size={20} /></div>
        <span className="text-xs text-slate-400">Live</span>
      </div>
      <h4 className="text-xs font-medium text-slate-400 mt-3 uppercase tracking-wider">{label}</h4>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Paid</span>;
  if (status === "pending") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Unpaid</span>;
  if (status === "overdue") return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Overdue</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{status}</span>;
}

function Row({ label, count, amount, bold }: { label: string; count: number; amount: number; bold?: boolean }) {
  return (
    <a href="/property/rent-invoices" className={`flex items-center justify-between px-3 py-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition ${bold ? "font-semibold" : ""}`}>
      <span className="text-sm text-slate-700">{label}</span>
      <div className="text-right">
        <div className={`text-sm ${bold ? "text-slate-900" : "text-slate-600"}`}>{count} invoices</div>
        <div className="text-xs text-slate-400">{formatTzs(amount)}</div>
      </div>
    </a>
  );
}

function QuickCard({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.05)] px-4 py-4 hover:shadow-md hover:-translate-y-0.5 transition group">
      <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition"><Icon size={18} /></div>
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </a>
  );
}
