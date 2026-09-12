import Link from "next/link";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type {
  SupermarketPurchaseRow,
  SupermarketSaleRow,
  SupermarketSampleDashboard,
  SupermarketStockAlert,
} from "@/lib/data/sample-supermarket";

const QUICK_ACTIONS = [
  { href: "/supermarket/sales", label: "New Sale", icon: ShoppingBag },
  { href: "/supermarket/products", label: "Add Product", icon: PackagePlus },
  { href: "/supermarket/purchases", label: "Record Purchase", icon: Wallet },
  { href: "/supermarket/stock", label: "Stock Adjustment", icon: SlidersHorizontal },
] as const;

export function SupermarketDashboard({ data }: { data: SupermarketSampleDashboard }) {
  const peakSold = Math.max(...data.topProducts.map((item) => item.sold), 1);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <PageHeader
        title="Supermarket"
        description="Monitor sales, inventory, purchasing and daily performance."
        action={
          <Link
            href="/supermarket/sales"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New Sale
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={formatTzs(data.kpis.todaySales)}
          delta={data.kpis.todaySalesDelta}
          comparisonLabel="vs yesterday"
          icon={ShoppingBag}
        />
        <KpiCard
          label="Today's Orders"
          value={String(data.kpis.todayOrders)}
          delta={data.kpis.todayOrdersDelta}
          comparisonLabel="vs yesterday"
          icon={ShoppingCart}
        />
        <KpiCard
          label="Gross Profit"
          value={formatTzs(data.kpis.grossProfit)}
          delta={data.kpis.grossProfitDelta}
          comparisonLabel="vs yesterday"
          icon={Wallet}
        />
        <KpiCard
          label="Inventory Value"
          value={formatTzs(data.kpis.inventoryValue)}
          hint="Current stock value"
          icon={Package}
        />
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <SalesOverviewCard data={data} />
        <StockAlertsCard alerts={data.stockAlerts} />
      </section>

      <RecentSalesCard sales={data.recentSales} />

      <section className="grid min-w-0 grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-2">
        <article className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
          <CardTitle title="Top Selling Products" href="/supermarket/products" />
          <ol className="mt-4 space-y-3">
            {data.topProducts.map((product, index) => (
              <li key={product.name} className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f5f8] text-[11px] font-semibold text-slate-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13.5px] font-semibold text-navy sm:text-[14px]">
                        {product.name}
                      </p>
                      <p className="shrink-0 text-[12px] text-slate-500">{product.sold} sold</p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f3f5f8]">
                      <div
                        className="h-full rounded-full bg-[#5b7fa6]/70"
                        style={{ width: `${Math.max(12, (product.sold / peakSold) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <article className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
          <CardTitle title="Recent Purchases" href="/supermarket/purchases" />
          <ul className="mt-4 divide-y divide-black/4">
            {data.recentPurchases.map((purchase) => (
              <PurchaseRow key={purchase.reference} purchase={purchase} />
            ))}
          </ul>
        </article>
      </section>

      <section className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
        <h2 className="text-[16px] font-bold tracking-[-0.03em] text-navy sm:text-[18px]">
          Quick Actions
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className="flex min-w-0 items-center gap-2.5 rounded-[14px] border border-black/[0.04] bg-[#f8fafc] px-3 py-3 transition hover:bg-white hover:shadow-card sm:px-3.5"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-navy shadow-[0_1px_0_rgba(16,24,40,0.04)] sm:h-9 sm:w-9">
                <action.icon className="h-4 w-4" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 break-words text-[12.5px] font-semibold leading-4 text-navy sm:text-[13px]">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
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
}: {
  label: string;
  value: string;
  delta?: number;
  comparisonLabel?: string;
  hint?: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <article className="flex min-h-0 min-w-0 items-center gap-2.5 rounded-[18px] border border-white/90 bg-white px-3 py-3 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:min-h-[108px] sm:gap-3.5 sm:px-4 sm:py-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy sm:h-12 sm:w-12 sm:rounded-[16px]">
        <Icon className="h-4 w-4 sm:h-[22px] sm:w-[22px]" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 sm:text-[13px]">{label}</p>
        <p className="mt-0.5 break-words text-[15px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">
          {value}
        </p>
        {delta != null && comparisonLabel ? (
          <ComparisonIndicator value={delta} label={comparisonLabel} unsigned plainArrow />
        ) : hint ? (
          <p className="mt-1.5 text-[11px] font-normal text-slate-400 sm:text-[12px]">{hint}</p>
        ) : null}
      </div>
    </article>
  );
}

function SalesOverviewCard({ data }: { data: SupermarketSampleDashboard }) {
  const peak = Math.max(...data.salesOverview.trend.map((item) => item.amount), 1);

  return (
    <article className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
      <h2 className="text-[16px] font-bold tracking-[-0.03em] text-navy sm:text-[18px]">
        Sales Overview
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">This week compared with daily store trading.</p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        <PeriodStat label="Today" value={formatTzs(data.salesOverview.today)} />
        <PeriodStat label="This week" value={formatTzs(data.salesOverview.week)} />
        <PeriodStat label="This month" value={formatTzs(data.salesOverview.month)} />
      </div>

      <div className="mt-5 flex h-[132px] items-end gap-1.5 sm:h-[156px] sm:gap-2.5" aria-hidden>
        {data.salesOverview.trend.map((day, index) => {
          const height = Math.max(12, (day.amount / peak) * 100);
          const latest = index === data.salesOverview.trend.length - 1;
          return (
            <div key={day.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[108px] w-full items-end justify-center sm:h-[128px]">
                <div
                  className={cn(
                    "w-full max-w-[28px] rounded-[8px] sm:max-w-[34px]",
                    latest ? "bg-[#0f2340]" : "bg-[#5b7fa6]/28",
                  )}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-slate-400 sm:text-[11px]">{day.label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function PeriodStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-[#f8fafc] px-2.5 py-2.5 sm:px-3">
      <p className="text-[10.5px] font-medium text-slate-500 sm:text-[12px]">{label}</p>
      <p className="mt-1 break-words text-[12px] font-bold tracking-[-0.03em] text-navy sm:text-[15px]">
        {value}
      </p>
    </div>
  );
}

function StockAlertsCard({ alerts }: { alerts: SupermarketStockAlert[] }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
      <h2 className="text-[16px] font-bold tracking-[-0.03em] text-navy sm:text-[18px]">
        Stock Alerts
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">Items that need attention on the shop floor.</p>
      <div className="mt-4 space-y-2.5">
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className="flex min-w-0 items-center gap-3 rounded-[14px] border border-black/[0.03] bg-[#f8fafc] px-3 py-3 transition hover:bg-white hover:shadow-card"
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
              <span className="block text-[16px] font-bold tracking-[-0.03em] text-navy">
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
    <article className="min-w-0 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:px-5 sm:py-5">
      <CardTitle title="Recent Sales" href="/supermarket/sales" actionLabel="View All" />

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-[13px]">
          <thead className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            <tr>
              <th className="pb-3 pr-4 font-medium">Invoice</th>
              <th className="pb-3 pr-4 font-medium">Time</th>
              <th className="pb-3 pr-4 font-medium">Items</th>
              <th className="pb-3 pr-4 font-medium">Cashier</th>
              <th className="pb-3 pr-4 font-medium">Payment</th>
              <th className="pb-3 pr-4 font-medium">Amount</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.invoice} className="border-t border-black/4">
                <td className="py-3 pr-4 font-semibold text-navy">#{sale.invoice}</td>
                <td className="py-3 pr-4 text-slate-500">{sale.time}</td>
                <td className="py-3 pr-4 text-slate-600">{sale.items} items</td>
                <td className="py-3 pr-4 text-slate-600">{sale.cashier}</td>
                <td className="py-3 pr-4 text-slate-600">{sale.payment}</td>
                <td className="py-3 pr-4 font-semibold text-navy">{formatTzs(sale.amount)}</td>
                <td className="py-3">
                  <SaleStatus status={sale.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 space-y-2.5 md:hidden">
        {sales.map((sale) => (
          <li
            key={sale.invoice}
            className="rounded-[14px] border border-black/[0.04] bg-[#f8fafc] px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-navy">#{sale.invoice}</p>
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
      <h2 className="text-[16px] font-bold tracking-[-0.03em] text-navy sm:text-[18px]">{title}</h2>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-medium text-slate-500 transition hover:text-navy"
      >
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
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
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
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "Received" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "Pending" && "bg-[#f8efd8] text-[#b0892e]",
      )}
    >
      {status}
    </span>
  );
}
