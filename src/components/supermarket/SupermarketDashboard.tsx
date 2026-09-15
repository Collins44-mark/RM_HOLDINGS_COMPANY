"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Package,
  PackagePlus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";
import { ComparisonIndicator } from "@/components/finance/ComparisonIndicator";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type {
  SupermarketPurchaseRow,
  SupermarketSaleRow,
  SupermarketSampleDashboard,
  SupermarketStockAlert,
} from "@/lib/data/sample-supermarket";

const QUICK_ACTIONS = [
  { href: "/supermarket/pos", label: "New Sale", icon: ShoppingBag },
  { href: "/supermarket/products", label: "Add Product", icon: PackagePlus },
  { href: "/supermarket/purchases", label: "Record Purchase", icon: Wallet },
  { href: "/supermarket/stock-adjustments", label: "Stock Adjustment", icon: SlidersHorizontal },
] as const;

const glass =
  "rounded-[24px] border border-white/65 bg-white/76 shadow-[0_10px_28px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl";
const tableWrap =
  "mt-3 overflow-hidden rounded-[14px] border border-white/60 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";
const tableHead =
  "bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400";
const viewAllClass =
  "inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full border border-white/70 bg-white/75 px-2.5 text-[12px] font-medium text-slate-500 shadow-[0_3px_10px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition hover:bg-white hover:text-navy";
const periodClass =
  "h-7 shrink-0 rounded-full border border-white/75 bg-white/85 px-2.5 text-[12px] font-medium text-slate-500 shadow-[0_3px_10px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-md";

type KpiTone = "blue" | "violet" | "green" | "amber";

const KPI_TONES: Record<KpiTone, { card: string; icon: string; bar: string }> = {
  blue: {
    card: "border-sky-200/35 bg-[#eef5ff]/78",
    icon: "bg-sky-100/80 text-sky-700",
    bar: "bg-sky-400/65",
  },
  violet: {
    card: "border-violet-200/40 bg-[#f4f1ff]/82",
    icon: "bg-violet-100/80 text-violet-600",
    bar: "bg-violet-400/65",
  },
  green: {
    card: "border-emerald-200/35 bg-[#eefaf2]/78",
    icon: "bg-emerald-100/80 text-emerald-700",
    bar: "bg-emerald-400/65",
  },
  amber: {
    card: "border-amber-200/40 bg-[#fff8eb]/82",
    icon: "bg-amber-100/80 text-amber-600",
    bar: "bg-amber-400/70",
  },
};

export function SupermarketDashboard({ data }: { data: SupermarketSampleDashboard }) {
  const peakSold = Math.max(...data.topProducts.map((item) => item.sold), 1);

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
            Supermarket
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
            Monitor sales, inventory, purchasing and daily performance.
          </p>
        </div>
        <Link
          href="/supermarket/pos"
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)] transition hover:bg-[#102a52] sm:w-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          New Sale
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={formatTzs(data.kpis.todaySales)}
          delta={data.kpis.todaySalesDelta}
          comparisonLabel="vs yesterday"
          icon={ShoppingBag}
          tone="blue"
        />
        <KpiCard
          label="Today's Orders"
          value={String(data.kpis.todayOrders)}
          delta={data.kpis.todayOrdersDelta}
          comparisonLabel="vs yesterday"
          icon={ShoppingCart}
          tone="violet"
        />
        <KpiCard
          label="Gross Profit"
          value={formatTzs(data.kpis.grossProfit)}
          delta={data.kpis.grossProfitDelta}
          comparisonLabel="vs yesterday"
          icon={Wallet}
          tone="green"
        />
        <KpiCard
          label="Inventory Value"
          value={formatTzs(data.kpis.inventoryValue)}
          hint="Current stock value"
          icon={Package}
          tone="amber"
        />
      </section>

      <section className="grid min-w-0 grid-cols-1 items-stretch gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.12fr)]">
        <SalesOverviewCard data={data} />
        <RecentSalesCard sales={data.recentSales} />
      </section>

      <section className="grid min-w-0 grid-cols-1 items-stretch gap-2.5 sm:gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.45fr)_minmax(200px,0.55fr)]">
        <article className={cn(glass, "flex h-full min-w-0 flex-col px-4 py-3.5 sm:px-5 sm:py-4")}>
          <CardTitle title="Top Selling Products" href="/supermarket/products" />
          <ol className="mt-3 space-y-2">
            {data.topProducts.map((product, index) => (
              <li key={product.name} className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2f6] text-[11px] font-semibold text-slate-500">
                    {index + 1}
                  </span>
                  <p className="min-w-[96px] shrink-0 truncate text-[13px] font-medium text-navy sm:min-w-[110px] sm:text-[13.5px]">
                    {product.name}
                  </p>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eef2f6]">
                    <div
                      className="h-full rounded-full bg-[#5b8fd4]"
                      style={{ width: `${Math.max(12, (product.sold / peakSold) * 100)}%` }}
                    />
                  </div>
                  <p className="w-[62px] shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                    {product.sold} sold
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <article className={cn(glass, "flex h-full min-w-0 flex-col px-4 py-3.5 sm:px-5 sm:py-4")}>
          <CardTitle title="Recent Purchases" href="/supermarket/purchases" />
          <div className={cn(tableWrap, "hidden md:block")}>
            <table className="w-full table-fixed text-left text-[12.5px]">
              <thead className={tableHead}>
                <tr>
                  <th className="w-[28%] px-2.5 py-2 font-medium">Supplier</th>
                  <th className="w-[18%] px-2 py-2 font-medium">PO Number</th>
                  <th className="w-[18%] px-2 py-2 font-medium">Date</th>
                  <th className="w-[20%] px-2 py-2 font-medium">Amount</th>
                  <th className="w-[16%] px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPurchases.map((purchase) => (
                  <tr key={purchase.reference} className="border-t border-[#d5dee8]/55">
                    <td className="truncate px-2.5 py-2 font-medium text-navy">{purchase.supplier}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">{purchase.reference}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">{purchase.date}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-semibold text-navy">{formatTzs(purchase.amount)}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <PurchaseStatus status={purchase.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 divide-y divide-black/[0.04] md:hidden">
            {data.recentPurchases.map((purchase) => (
              <PurchaseRow key={purchase.reference} purchase={purchase} />
            ))}
          </ul>
        </article>

        <article className={cn(glass, "flex h-full min-w-0 flex-col px-4 py-3.5 sm:px-5 sm:py-4")}>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">
            Quick Actions
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-1 xl:gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href + action.label}
                href={action.href}
                className="flex min-w-0 items-center gap-2.5 rounded-[14px] border border-white/80 bg-white/75 px-3 py-2 shadow-[0_4px_12px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition hover:bg-white sm:px-3"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#f4f7fb] text-navy">
                  <action.icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 truncate text-[12.5px] font-semibold leading-4 text-navy sm:text-[13px]">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <StockAlertsCard alerts={data.stockAlerts} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  comparisonLabel,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  delta?: number;
  comparisonLabel?: string;
  hint?: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: KpiTone;
}) {
  const accent = KPI_TONES[tone];
  return (
    <article
      className={cn(
        "flex min-h-0 min-w-0 items-center gap-2.5 rounded-[22px] border px-3 py-3 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl sm:min-h-[108px] sm:gap-3 sm:px-4 sm:py-3.5",
        accent.card,
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10",
          accent.icon,
        )}
      >
        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-500 sm:text-[12px]">{label}</p>
        <p className="mt-0.5 break-words text-[16px] font-semibold tracking-[-0.04em] text-navy sm:text-[20px]">
          {value}
        </p>
        {delta != null && comparisonLabel ? (
          <ComparisonIndicator value={delta} label={comparisonLabel} unsigned plainArrow />
        ) : hint ? (
          <p className="mt-1.5 text-[11px] font-normal text-slate-400 sm:text-[12px]">{hint}</p>
        ) : null}
      </div>
      <div className="ml-1 hidden h-9 items-end gap-[3px] sm:flex" aria-hidden>
        {[38, 58, 46, 72, 92].map((height, index) => (
          <span
            key={index}
            className={cn("w-[3.5px] rounded-full", accent.bar, index < 4 && "opacity-55")}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </article>
  );
}

function SalesOverviewCard({ data }: { data: SupermarketSampleDashboard }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const peak = Math.max(...data.salesOverview.trend.map((item) => item.amount), 1);
  const axisMax = Math.max(2_000_000, Math.ceil(peak / 2_000_000) * 2_000_000);
  const ticks = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];
  const amount =
    period === "today"
      ? data.salesOverview.today
      : period === "month"
        ? data.salesOverview.month
        : data.salesOverview.week;
  const delta = period === "today" ? data.kpis.todaySalesDelta : null;

  return (
    <article className={cn(glass, "flex h-full min-w-0 flex-col px-4 py-3 sm:px-5 sm:py-3.5")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">
          Sales Overview
        </h2>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as "today" | "week" | "month")}
          className={periodClass}
          aria-label="Sales overview period"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="min-w-0 text-[13px] text-slate-500">This week compared with daily store trading.</p>
        <div className="shrink-0 text-right">
          <p className="text-[16px] font-semibold tracking-[-0.04em] text-navy sm:text-[18px]">
            {formatTzs(amount)}
          </p>
          {delta != null ? (
            <div className="-mt-1 flex justify-end">
              <ComparisonIndicator value={delta} label="" unsigned plainArrow />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex min-h-0 items-end gap-1.5">
        <div className="hidden h-[96px] w-6 shrink-0 flex-col justify-between pb-4 text-right sm:flex" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="text-[10px] font-medium text-slate-400">
              {tick === 0 ? "0" : `${tick / 1_000_000}M`}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[78px]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(15,35,64,0.07) 0, rgba(15,35,64,0.07) 1px, transparent 1px, transparent 25%)",
            }}
          />
          <div className="relative flex h-[96px] items-end gap-[3px] sm:gap-1" aria-hidden>
            {data.salesOverview.trend.map((day, index) => {
              const height = Math.max(22, (day.amount / peak) * 100);
              const latest = index === data.salesOverview.trend.length - 1;
              return (
                <div key={day.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-[78px] w-full items-end justify-center">
                    <div
                      className="w-full rounded-t-[6px]"
                      style={{
                        height: `${height}%`,
                        backgroundImage: latest
                          ? "linear-gradient(to bottom, #3f7bd6 0%, #c9def8 100%)"
                          : "linear-gradient(to bottom, #6ea4e8 0%, #d7e7fb 100%)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function StockAlertsCard({ alerts }: { alerts: SupermarketStockAlert[] }) {
  return (
    <article className={cn(glass, "min-w-0 px-4 py-4 sm:px-5 sm:py-5")}>
      <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">
        Stock Alerts
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">Items that need attention on the shop floor.</p>
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className="flex min-w-0 items-center gap-3 rounded-[16px] border border-white/80 bg-white/65 px-3 py-3 shadow-[0_1px_2px_rgba(15,35,64,0.04)] transition hover:bg-white"
          >
            <span
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]",
                alert.tone === "critical" && "bg-[#f8eaea] text-[#b42318]",
                alert.tone === "watch" && "bg-[#f8efd8] text-[#b0892e]",
                alert.tone === "soon" && "bg-[#e8eef6] text-[#4d6480]",
              )}
            >
              {alert.tone === "soon" ? (
                <Clock3 className="h-4 w-4" strokeWidth={1.7} />
              ) : (
                <AlertTriangle className="h-4 w-4" strokeWidth={1.7} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-navy">{alert.label}</span>
              <span className="mt-0.5 block text-[12px] text-slate-500">{alert.hint}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[16px] font-semibold tracking-[-0.03em] text-navy">
                {alert.count}
              </span>
              <span className="text-[11px] text-slate-400">products</span>
            </span>
          </Link>
        ))}
      </div>
    </article>
  );
}

function RecentSalesCard({ sales }: { sales: SupermarketSaleRow[] }) {
  return (
    <article className={cn(glass, "flex h-full min-w-0 flex-col px-4 py-3.5 sm:px-5 sm:py-4")}>
      <CardTitle title="Recent Sales" href="/supermarket/sales" actionLabel="View All" />

      <div className={cn(tableWrap, "hidden md:block")}>
        <table className="w-full table-fixed text-left text-[12.5px]">
          <thead className={tableHead}>
            <tr>
              <th className="w-[17%] px-2 py-2 font-medium">Invoice</th>
              <th className="w-[13%] px-1.5 py-2 font-medium">Time</th>
              <th className="w-[12%] px-1.5 py-2 font-medium">Items</th>
              <th className="w-[12%] px-1.5 py-2 font-medium">Cashier</th>
              <th className="w-[16%] px-1.5 py-2 font-medium">Payment</th>
              <th className="w-[16%] px-1.5 py-2 font-medium">Amount</th>
              <th className="w-[14%] px-1.5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.invoice} className="border-t border-[#d5dee8]/55">
                <td className="whitespace-nowrap px-2 py-2 font-semibold text-navy">#{sale.invoice}</td>
                <td className="whitespace-nowrap px-1.5 py-2 text-slate-500">{sale.time}</td>
                <td className="whitespace-nowrap px-1.5 py-2 text-slate-500">{sale.items} items</td>
                <td className="whitespace-nowrap px-1.5 py-2 text-slate-500">{sale.cashier}</td>
                <td className="whitespace-nowrap px-1.5 py-2 text-slate-500">{sale.payment}</td>
                <td className="whitespace-nowrap px-1.5 py-2 font-semibold text-navy">{formatTzs(sale.amount)}</td>
                <td className="whitespace-nowrap px-1.5 py-2">
                  <SaleStatus status={sale.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-2 md:hidden">
        {sales.map((sale) => (
          <li
            key={sale.invoice}
            className="rounded-[14px] border border-white/80 bg-white/60 px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="whitespace-nowrap font-semibold text-navy">#{sale.invoice}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {sale.time} · {sale.items} items · {sale.cashier}
                </p>
              </div>
              <SaleStatus status={sale.status} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[12px] text-slate-500">{sale.payment}</p>
              <p className="text-[13.5px] font-semibold text-navy">{formatTzs(sale.amount)}</p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PurchaseRow({ purchase }: { purchase: SupermarketPurchaseRow }) {
  return (
    <li className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-navy">{purchase.supplier}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {purchase.reference} · {purchase.date}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-semibold text-navy">{formatTzs(purchase.amount)}</p>
        <p className="mt-1">
          <PurchaseStatus status={purchase.status} />
        </p>
      </div>
    </li>
  );
}

function CardTitle({
  title,
  href,
  actionLabel = "View All",
}: {
  title: string;
  href: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">{title}</h2>
      <Link href={href} className={viewAllClass}>
        {actionLabel}
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

function SaleStatus({ status }: { status: SupermarketSaleRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "Completed" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "Pending" && "bg-[#f8efd8] text-[#b0892e]",
        status === "Refunded" && "bg-[#e8eef6] text-[#4d6480]",
      )}
    >
      {status}
    </span>
  );
}

function PurchaseStatus({ status }: { status: SupermarketPurchaseRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "Received" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "Pending" && "bg-[#f8efd8] text-[#b0892e]",
      )}
    >
      {status}
    </span>
  );
}
