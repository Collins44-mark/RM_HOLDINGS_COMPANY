import Link from "next/link";
import { formatTzs } from "@/lib/format/currency";
import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import { beePeriodWindow, inWindow } from "@/lib/beekeeping/period";
import { roundKg, roundMoney } from "@/lib/beekeeping/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beekeeping" };

export default async function BeekeepingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = beePeriodWindow(params.period || "month", params.from, params.to);
  const directory = await listBeekeepingDirectory();
  const harvests = directory.harvests.filter((harvest) => harvest.status === "Valid" && inWindow(harvest.harvest_date, period.from, period.to));
  const harvested = roundKg(harvests.reduce((sum, harvest) => sum + harvest.quantity_kg, 0));
  const income = roundMoney(directory.sales.flatMap((sale) => sale.payments).filter((payment) => payment.status === "Completed" && inWindow(payment.payment_date, period.from, period.to)).reduce((sum, payment) => sum + payment.amount, 0));
  const expensesPaid = roundMoney(directory.expenses.flatMap((expense) => expense.payments).filter((payment) => payment.status === "Completed" && inWindow(payment.payment_date, period.from, period.to)).reduce((sum, payment) => sum + payment.amount, 0));
  const salesOutstanding = roundMoney(directory.sales.filter((sale) => sale.status !== "Cancelled").reduce((sum, sale) => sum + sale.balance, 0));
  const expensesOutstanding = roundMoney(directory.expenses.filter((expense) => expense.status !== "Cancelled").reduce((sum, expense) => sum + expense.balance, 0));
  const months = new Map<string, number>();
  for (const harvest of harvests) {
    const key = harvest.harvest_date.slice(0, 7);
    months.set(key, roundKg((months.get(key) || 0) + harvest.quantity_kg));
  }
  const chart = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...chart.map(([, value]) => value));
  const active = directory.hives.filter((hive) => hive.status === "Active").length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Beekeeping</h1>
          <p className="mt-1 text-sm text-slate-500">Hives, harvests, honey stock, sales, and expenses for this business.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/beekeeping">
          <select name="period" defaultValue={params.period || "month"} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="month">This Month</option>
            <option value="last">Last Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom range</option>
          </select>
          <input name="from" type="date" defaultValue={params.from || ""} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="From" />
          <input name="to" type="date" defaultValue={params.to || ""} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="To" />
          <button className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Apply</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/beekeeping/hives" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Beehives</p><p className="mt-2 text-2xl font-bold text-slate-900">{directory.hives.filter((hive) => hive.status !== "Archived").length}</p></Link>
        <Link href="/beekeeping/hives" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Beehives</p><p className="mt-2 text-2xl font-bold text-slate-900">{active}</p></Link>
        <Link href="/beekeeping/harvests" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Honey Harvested</p><p className="mt-2 text-2xl font-bold text-slate-900">{harvested} kg</p><p className="text-xs text-slate-400">{period.label}</p></Link>
        <Link href="/beekeeping/sales" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Income</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatTzs(income)}</p><p className="text-xs text-slate-400">Collected payments</p></Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-800">Honey production</h2>
          <p className="text-sm text-slate-500">{period.label}: {harvested} kg</p>
          {chart.length === 0 ? <p className="py-10 text-sm text-slate-500">No harvests in this period.</p> : (
            <div className="mt-4 flex h-48 items-end gap-2">
              {chart.map(([month, value]) => (
                <div key={month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${month}: ${value} kg`}>
                  <div className="w-full rounded-t-md bg-[#0b2244]" style={{ height: `${Math.max(6, Math.round((value / max) * 100))}%` }} />
                  <span className="text-[10px] text-slate-400">{month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">Honey stock</h2>
          <Link href="/beekeeping/sales" className="mt-4 block space-y-3 text-sm">
            <p className="flex justify-between"><span className="text-slate-500">Harvested</span><span>{directory.stock.harvested} kg</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Sold</span><span>{directory.stock.sold} kg</span></p>
            <p className="flex justify-between font-semibold"><span>Available</span><span>{directory.stock.available} kg</span></p>
          </Link>
        </section>
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:grid-cols-5">
        <Stat label="Income received" value={formatTzs(income)} />
        <Stat label="Expenses paid" value={formatTzs(expensesPaid)} />
        <Stat label="Sales outstanding" value={formatTzs(salesOutstanding)} />
        <Stat label="Expenses outstanding" value={formatTzs(expensesOutstanding)} />
        <Stat label="Operating result" value={formatTzs(roundMoney(income - expensesPaid))} />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Recent activity</h2>
        {directory.activities.length === 0 ? <p className="mt-3 text-sm text-slate-500">No beekeeping activity yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {directory.activities.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-slate-700">{event.description}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(event.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>;
}
