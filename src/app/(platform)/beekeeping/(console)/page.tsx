import Link from "next/link";
import { Banknote, Droplets, Hexagon, Layers, Receipt, ShoppingBag, type LucideIcon } from "lucide-react";
import { formatTzs } from "@/lib/format/currency";
import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import { beePeriodWindow, inWindow } from "@/lib/beekeeping/period";
import { BeePeriodFilter } from "./period-filter";
import { roundKg, roundMoney } from "@/lib/beekeeping/constants";
import { cn } from "@/lib/cn";

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
  const chartYear = period.from.slice(0, 4);
  const chart = monthlyProduction(
    directory.harvests.filter((harvest) => harvest.status === "Valid"),
    chartYear,
  );
  const yearHarvested = roundKg(chart.reduce((sum, bar) => sum + bar.value, 0));
  const active = directory.hives.filter((hive) => hive.status === "Active").length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Beekeeping</h1>
          <p className="mt-1 text-sm text-slate-500">Hives, harvests, honey stock, sales, and expenses for this business.</p>
        </div>
        <BeePeriodFilter period={params.period === "week" || params.period === "year" || params.period === "custom" ? params.period : "month"} from={params.from || ""} to={params.to || ""} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/beekeeping/hives" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Beehives</p><p className="mt-2 text-2xl font-bold text-slate-900">{directory.hives.filter((hive) => hive.status !== "Archived").length}</p></Link>
        <Link href="/beekeeping/hives" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Beehives</p><p className="mt-2 text-2xl font-bold text-slate-900">{active}</p></Link>
        <Link href="/beekeeping/harvests" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Honey Harvested</p><p className="mt-2 text-2xl font-bold text-slate-900">{harvested} kg</p><p className="text-xs text-slate-400">{period.label}</p></Link>
        <Link href="/beekeeping/sales" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Income</p><p className="mt-2 text-2xl font-bold text-slate-900">{formatTzs(income)}</p><p className="text-xs text-slate-400">Collected payments</p></Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Honey production</h2>
              <p className="text-sm text-slate-500">January to December {chartYear}</p>
            </div>
            <p className="text-right text-sm font-semibold text-[#0b2244]">{yearHarvested} kg</p>
          </div>
          <ProductionChart bars={chart} />
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

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Recent activity</h2>
            <p className="text-xs text-slate-400">The five latest records</p>
          </div>
        </div>
        {directory.activities.length === 0 ? <p className="px-6 py-10 text-sm text-slate-500">No beekeeping activity yet.</p> : (
          <ul>
            {directory.activities.slice(0, 5).map((event) => {
              const kind = activityKind(event.action);
              return (
                <li key={event.id} className="flex items-center gap-3 border-b border-slate-50 px-6 py-3.5 last:border-b-0">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", kind.tone)}>
                    <kind.Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{kind.label}</p>
                    <p className="truncate text-sm text-slate-800">{event.description}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400" dateTime={event.created_at}>
                    {formatActivityTime(event.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceMax(value: number) {
  if (value <= 0) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = value / power;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * power;
}

function monthlyProduction(harvests: { harvest_date: string; quantity_kg: number }[], year: string) {
  const totals = Array.from({ length: 12 }, () => 0);
  for (const harvest of harvests) {
    const date = harvest.harvest_date.slice(0, 10);
    if (!date.startsWith(year)) continue;
    const month = Number(date.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    totals[month] = roundKg(totals[month] + harvest.quantity_kg);
  }
  return totals.map((value, index) => ({
    key: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: MONTHS[index],
    value,
  }));
}

function ProductionChart({ bars }: { bars: { key: string; label: string; value: number }[] }) {
  const peak = Math.max(0, ...bars.map((bar) => bar.value));
  const max = niceMax(peak);
  const ticks = [max, max / 2, 0];
  return (
    <div className="mt-5">
      <div className="flex h-56 gap-3">
        <div className="flex h-[calc(100%-1.25rem)] w-10 flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-slate-400">
          {ticks.map((tick) => <span key={tick}>{Math.round(tick)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
            {ticks.map((tick) => <div key={tick} className="border-t border-dashed border-slate-200" />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-1">
            {bars.map((bar) => (
              <div key={bar.key} className="group flex h-full min-w-0 flex-1 items-end" title={`${bar.key}: ${bar.value} kg`}>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[#0b2244] to-[#3d6cb5] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                  style={{ height: `${Math.max(bar.value > 0 ? 4 : 0, (bar.value / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-1">
            {bars.map((bar) => (
              <span key={bar.key} className="flex-1 text-center text-[10px] leading-none text-slate-400">{bar.label}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Kilograms harvested</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>;
}

function activityKind(action: string): { label: string; tone: string; Icon: LucideIcon } {
  if (action.startsWith("hive")) return { label: "Hive", tone: "bg-amber-50 text-amber-700", Icon: Hexagon };
  if (action.startsWith("harvest")) return { label: "Harvest", tone: "bg-emerald-50 text-emerald-700", Icon: Droplets };
  if (action.includes("payment")) return { label: "Payment", tone: "bg-sky-50 text-sky-700", Icon: Banknote };
  if (action.startsWith("sale")) return { label: "Sale", tone: "bg-[#0b2244]/8 text-[#0b2244]", Icon: ShoppingBag };
  if (action.startsWith("expense")) return { label: "Expense", tone: "bg-rose-50 text-rose-700", Icon: Receipt };
  return { label: "Stock", tone: "bg-slate-100 text-slate-600", Icon: Layers };
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
