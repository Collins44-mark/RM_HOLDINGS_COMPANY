"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Download,
  Package,
  Phone,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  buildSalesReportData,
  parseReportPeriodParams,
  reportPeriodQuery,
  resolveReportPeriod,
} from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import {
  saleTotal,
  type SalesDateRange,
  type SalesPeriodPreset,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton } from "@/components/supermarket/purchasing-ui";

const glass =
  "rounded-[24px] border border-white/60 bg-white/62 shadow-[0_14px_40px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-2xl";

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  Cash: Banknote,
  "Mobile Money": Phone,
  Card: CreditCard,
  Bank: Building2,
};

function useSalesReportPeriod() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = parseReportPeriodParams({
    period: searchParams.get("period"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  const [preset, setPreset] = useState<SalesPeriodPreset>(initial.preset);
  const [range, setRange] = useState<SalesDateRange>(initial.range);
  const period = useMemo(() => resolveReportPeriod(preset, range), [preset, range]);
  const query = reportPeriodQuery(preset, range);

  function syncUrl(nextPreset: SalesPeriodPreset, nextRange: SalesDateRange) {
    router.replace(`/supermarket/reports/sales?${reportPeriodQuery(nextPreset, nextRange)}`, {
      scroll: false,
    });
  }

  function onPreset(next: SalesPeriodPreset) {
    setPreset(next);
    syncUrl(next, range);
  }

  function onRange(next: SalesDateRange) {
    setRange(next);
    setPreset("range");
    syncUrl("range", next);
  }

  return { preset, range, period, query, onPreset, onRange };
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
}) {
  return (
    <article className={cn(glass, "min-w-0 px-4 py-4 sm:px-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-[18px] font-semibold tracking-[-0.03em] text-navy sm:text-[20px]">
            {value}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/72 text-navy/70 shadow-[0_6px_14px_rgba(15,35,64,0.05)]">
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
      </div>
    </article>
  );
}

function SalesTrendChart({
  points,
}: {
  points: { label: string; amount: number; transactions: number }[];
}) {
  const max = Math.max(...points.map((point) => point.amount), 1);
  const chartHeight = 168;
  const padX = 12;
  const padTop = 12;
  const padBottom = 28;
  const width = Math.max(points.length * 56, 280);
  const plotH = chartHeight - padTop - padBottom;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padX + index * step;
    const y = padTop + plotH - (point.amount / max) * plotH;
    return { ...point, x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : "";

  return (
    <div className="min-w-0 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        className="h-[180px] w-full min-w-[280px]"
        role="img"
        aria-label="Sales trend chart"
      >
        <defs>
          <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b2244" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0b2244" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + plotH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="rgba(15,35,64,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {areaPath ? <path d={areaPath} fill="url(#salesTrendFill)" /> : null}
        {linePath ? (
          <path d={linePath} fill="none" stroke="#0b2244" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {coords.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="3.5" fill="#fff" stroke="#0b2244" strokeWidth="1.8" />
            <text
              x={point.x}
              y={chartHeight - 8}
              textAnchor="middle"
              className="fill-slate-400"
              style={{ fontSize: 10, fontWeight: 500 }}
            >
              {point.label.length > 9 ? point.label.slice(0, 3) : point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "Completed"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : value === "Refunded"
        ? "bg-[#fff2f3] text-[#c45b66]"
        : "bg-[#f3f6fa] text-slate-500";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>
      {value}
    </span>
  );
}

function SaleDetailsPanel({ sale, onClose }: { sale: SupermarketSale; onClose: () => void }) {
  const subtotal = sale.lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-[#0b2244]/35 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <aside className={cn(glass, "relative z-10 max-h-[88vh] w-full max-w-lg overflow-hidden")}>
        <div className="flex items-start justify-between gap-3 border-b border-white/60 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-slate-500">Sale Details</p>
            <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">#{sale.id}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-navy"
            aria-label="Close sale details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(88vh-4.5rem)] space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill value={sale.status} />
            <p className="text-[12.5px] text-slate-500">
              {sale.dateLabel} · {sale.timeLabel}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-[14px] border border-white/70 bg-white/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Cashier</p>
              <p className="mt-1 text-[13.5px] font-semibold text-navy">{sale.cashier}</p>
            </div>
            <div className="rounded-[14px] border border-white/70 bg-white/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Payment</p>
              <p className="mt-1 text-[13.5px] font-semibold text-navy">{sale.payment}</p>
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-navy">Items ({sale.itemsCount})</p>
            <ul className="mt-2 space-y-2">
              {sale.lines.map((item, index) => (
                <li
                  key={`${sale.id}-${item.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-white/70 bg-white/45 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-navy">{item.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {item.quantity} × {formatTzs(item.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[13px] font-semibold text-navy">
                    {formatTzs(item.quantity * item.unitPrice)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[16px] border border-white/80 bg-white/70 px-3.5 py-3">
            <div className="flex justify-between text-[13px] text-slate-500">
              <span>Subtotal</span>
              <span>{formatTzs(subtotal)}</span>
            </div>
            <div className="mt-2 flex justify-between text-[13px] text-slate-500">
              <span>Discount</span>
              <span>- {formatTzs(sale.discount)}</span>
            </div>
            <div className="mt-3 flex justify-between text-[14px] font-semibold text-navy">
              <span>Total</span>
              <span>{formatTzs(saleTotal(sale))}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function SalesReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useSalesReportPeriod();
  const data = useMemo(() => buildSalesReportData(preset, range), [preset, range]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SupermarketSale | null>(null);

  const products = showAllProducts ? data.topProducts : data.topProducts.slice(0, 5);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6 lg:space-y-7">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href={`/supermarket/reports?${query}`}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Reports
          </Link>
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
            Sales Report
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">Sales performance and revenue analysis</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={onPreset}
            onRange={onRange}
            ariaLabel="Sales report period"
          />
          <button
            type="button"
            onClick={() => downloadReportPdf("sales", preset, range)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatTzs(data.totalRevenue)} icon={TrendingUp} />
        <KpiCard
          label="Transactions"
          value={data.totalTransactions.toLocaleString("en-US")}
          icon={ShoppingBag}
        />
        <KpiCard label="Items Sold" value={data.itemsSold.toLocaleString("en-US")} icon={Package} />
        <KpiCard label="Returns" value={formatTzs(data.returnsAmount)} icon={RotateCcw} />
      </section>

      <article className={cn(glass, "min-w-0 px-4 py-5 sm:px-5 sm:py-6")}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Sales Overview</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              {data.periodLabel}
              {data.periodDates ? ` · ${data.periodDates}` : ""}
            </p>
          </div>
          <p className="text-[12.5px] font-medium text-slate-500">
            Peak {formatTzs(Math.max(...data.trend.map((point) => point.amount), 0))}
          </p>
        </div>
        <div className="mt-5">
          <SalesTrendChart points={data.trend} />
        </div>
      </article>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <article className={cn(glass, "min-w-0 px-4 py-5 sm:px-5")}>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Payment Methods</h2>
          <ul className="mt-4 space-y-3">
            {data.paymentBreakdown.map((row) => {
              const Icon = PAYMENT_ICONS[row.method] ?? Coins;
              return (
                <li key={row.method} className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/70 text-navy/65">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-navy">{row.method}</p>
                        <p className="text-[12px] text-slate-500">
                          {row.count.toLocaleString("en-US")} transactions
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13.5px] font-semibold text-navy">{formatTzs(row.amount)}</p>
                      <p className="text-[12px] text-slate-500">{row.percentage}%</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8eef5]/90">
                    <div
                      className="h-full rounded-full bg-[#0b2244]/75"
                      style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className={cn(glass, "min-w-0 px-4 py-5 sm:px-5")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Top Selling Products</h2>
            {data.topProducts.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllProducts((value) => !value)}
                className="text-[12.5px] font-semibold text-navy/70 transition hover:text-navy"
              >
                {showAllProducts ? "Show less" : "View All"}
              </button>
            ) : null}
          </div>
          <div className="mt-4 overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:grid">
              <span>Product</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Revenue</span>
            </div>
            <ul className="mt-2 space-y-2">
              {products.map((row) => (
                <li
                  key={row.name}
                  className="grid grid-cols-1 gap-1 rounded-[14px] border border-white/70 bg-white/45 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3"
                >
                  <p className="min-w-0 truncate text-[13.5px] font-medium text-navy">{row.name}</p>
                  <p className="text-[12.5px] text-slate-500 sm:text-right sm:text-[13px] sm:font-medium sm:text-navy">
                    <span className="sm:hidden">Qty </span>
                    {row.quantity.toLocaleString("en-US")}
                  </p>
                  <p className="text-[13px] font-semibold text-navy sm:text-right">{formatTzs(row.revenue)}</p>
                </li>
              ))}
              {products.length === 0 ? (
                <li className="rounded-[14px] border border-dashed border-slate-200/80 px-3 py-8 text-center text-[13px] text-slate-500">
                  No product sales in this period.
                </li>
              ) : null}
            </ul>
          </div>
        </article>
      </section>

      <article className={cn(glass, "min-w-0 overflow-hidden")}>
        <div className="px-4 py-5 sm:px-5">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Sales by Category</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">Category performance for the selected period</p>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-3 py-2.5">Items Sold</th>
                <th className="px-3 py-2.5">Revenue</th>
                <th className="px-5 py-2.5">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((row) => (
                <tr key={row.category} className="border-t border-white/55">
                  <td className="px-5 py-3 font-medium text-navy">{row.category}</td>
                  <td className="px-3 py-3 text-slate-500">{row.itemsSold.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 font-semibold text-navy">{formatTzs(row.revenue)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#e8eef5]/90">
                        <div
                          className="h-full rounded-full bg-[#0b2244]/70"
                          style={{ width: `${Math.min(100, row.percentage)}%` }}
                        />
                      </div>
                      <span className="text-slate-500">{row.percentage}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {data.categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    No category sales in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ul className="space-y-2 px-4 pb-5 md:hidden">
          {data.categories.map((row) => (
            <li key={row.category} className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold text-navy">{row.category}</p>
                <p className="shrink-0 text-[13px] font-semibold text-navy">{formatTzs(row.revenue)}</p>
              </div>
              <p className="mt-1 text-[12.5px] text-slate-500">
                {row.itemsSold.toLocaleString("en-US")} items · {row.percentage}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8eef5]/90">
                <div
                  className="h-full rounded-full bg-[#0b2244]/70"
                  style={{ width: `${Math.min(100, row.percentage)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className={cn(glass, "min-w-0 overflow-hidden")}>
        <div className="px-4 py-5 sm:px-5">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">Sales Transactions</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {data.sales.length.toLocaleString("en-US")} transactions in this period
          </p>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-2.5">Invoice</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Cashier</th>
                <th className="px-3 py-2.5">Items</th>
                <th className="px-3 py-2.5">Payment</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.sales.slice(0, 40).map((sale) => (
                <tr key={sale.id} className="border-t border-white/55">
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedSale(sale)}
                      className="font-semibold text-navy transition hover:underline"
                    >
                      #{sale.id}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {sale.dateLabel} {sale.timeLabel}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{sale.cashier}</td>
                  <td className="px-3 py-3 text-slate-500">{sale.itemsCount}</td>
                  <td className="px-3 py-3 text-slate-500">{sale.payment}</td>
                  <td className="px-3 py-3 font-semibold text-navy">{formatTzs(sale.amount)}</td>
                  <td className="px-5 py-3">
                    <StatusPill value={sale.status} />
                  </td>
                </tr>
              ))}
              {data.sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    No sales transactions in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2.5 px-4 pb-5 lg:hidden">
          {data.sales.slice(0, 40).map((sale) => (
            <li key={sale.id}>
              <button
                type="button"
                onClick={() => setSelectedSale(sale)}
                className="w-full rounded-[16px] border border-white/70 bg-white/50 px-3.5 py-3 text-left transition hover:bg-white/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">#{sale.id}</p>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {sale.dateLabel} · {sale.timeLabel}
                    </p>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {sale.cashier} · {sale.itemsCount} items · {sale.payment}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13.5px] font-semibold text-navy">{formatTzs(sale.amount)}</p>
                    <div className="mt-1.5 flex justify-end">
                      <StatusPill value={sale.status} />
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {data.sales.length === 0 ? (
            <li className="rounded-[14px] border border-dashed border-slate-200/80 px-3 py-8 text-center text-[13px] text-slate-500">
              No sales transactions in this period.
            </li>
          ) : null}
        </ul>
      </article>

      {selectedSale ? <SaleDetailsPanel sale={selectedSale} onClose={() => setSelectedSale(null)} /> : null}
    </div>
  );
}
