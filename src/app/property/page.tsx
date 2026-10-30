import { getPropertyDashboardData } from "@/actions/property/dashboard";
import PropertyKPIs from "@/components/property/PropertyKPIs";
import PropertyIncomeChart from "@/components/property/PropertyIncomeChart";
import PropertyOccupancyChart from "@/components/property/PropertyOccupancyChart";
import PropertyInvoices from "@/components/property/PropertyInvoices";
import PropertyStatusOverview from "@/components/property/PropertyStatusOverview";
import PropertyQuickActions from "@/components/property/PropertyQuickActions";

export default async function PropertyPage() {
  const data = await getPropertyDashboardData();
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Properties & Rentals</h1>
          <p className="text-slate-500 mt-2">Real-time property portfolio and rental performance</p>
        </header>

        <PropertyKPIs stats={data.stats} />

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2"><PropertyIncomeChart data={data.monthlyIncome} /></div>
          <div><PropertyOccupancyChart occupied={data.stats.occupied} vacant={data.stats.vacant} total={data.stats.totalUnits} /></div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2"><PropertyInvoices invoices={data.recentInvoices} /></div>
          <div><PropertyStatusOverview stats={data.stats} /></div>
        </div>

        <div className="mb-6"><PropertyQuickActions /></div>

        <section className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Contracts</h3>
            <div className="text-3xl font-extrabold text-indigo-600">{data.contracts}</div>
            <div className="text-sm text-slate-500">Active rental contracts</div>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Hall Bookings</h3>
            <div className="text-3xl font-extrabold text-violet-600">{data.hallBookings}</div>
            <div className="text-sm text-slate-500">Booked events</div>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-white/40">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Expenses</h3>
            <div className="text-3xl font-extrabold text-rose-600">£{Number(data.expenses ?? 0).toLocaleString()}</div>
            <div className="text-sm text-slate-500">Property expenses</div>
          </div>
        </section>
      </div>
    </main>
  );
}
