"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Check,
  Download,
  FileText,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  REPORT_KIND_META,
  buildInventoryReportData,
  buildProfitLossReportData,
  buildPurchaseReportData,
  buildSalesReportData,
  parseReportPeriodParams,
  reportPeriodQuery,
  resolveReportPeriod,
  type ReportKind,
} from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton } from "@/components/supermarket/purchasing-ui";

const glass =
  "rounded-[24px] border border-white/55 bg-white/58 shadow-[0_14px_40px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

const CARDS: {
  kind: ReportKind;
  icon: typeof TrendingUp;
  iconTone: string;
  selectedTone: string;
}[] = [
  {
    kind: "sales",
    icon: TrendingUp,
    iconTone: "border-emerald-200/50 bg-white/70 text-emerald-600",
    selectedTone: "border-emerald-300/70 bg-emerald-50/55 ring-2 ring-emerald-400/35",
  },
  {
    kind: "inventory",
    icon: Boxes,
    iconTone: "border-sky-200/50 bg-white/70 text-sky-600",
    selectedTone: "border-sky-300/70 bg-sky-50/55 ring-2 ring-sky-400/35",
  },
  {
    kind: "purchases",
    icon: ShoppingBag,
    iconTone: "border-amber-200/50 bg-white/70 text-amber-600",
    selectedTone: "border-amber-300/70 bg-amber-50/55 ring-2 ring-amber-400/35",
  },
  {
    kind: "profit-loss",
    icon: BarChart3,
    iconTone: "border-violet-200/50 bg-white/70 text-violet-600",
    selectedTone: "border-violet-300/70 bg-violet-50/55 ring-2 ring-violet-400/35",
  },
];

function useReportsPeriod(basePath: string) {
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
    const nextQuery = reportPeriodQuery(nextPreset, nextRange);
    router.replace(`${basePath}?${nextQuery}`, { scroll: false });
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(glass, "min-w-0 px-4 py-4")}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 truncate text-[18px] font-semibold tracking-[-0.03em] text-navy sm:text-[20px]">{value}</p>
    </div>
  );
}

function BackToReports({ query }: { query: string }) {
  return (
    <Link
      href={`/supermarket/reports?${query}`}
      className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Reports
    </Link>
  );
}

export function ReportsCenter() {
  const { preset, range, period, query, onPreset, onRange } = useReportsPeriod("/supermarket/reports");
  const [selected, setSelected] = useState<ReportKind | null>(null);
  const [exportHint, setExportHint] = useState(false);

  function handleExport() {
    if (!selected) {
      setExportHint(true);
      return;
    }
    setExportHint(false);
    downloadReportPdf(selected, preset, range);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Reports</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">View and download detailed supermarket reports.</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={onPreset}
            onRange={onRange}
            ariaLabel="Reports period"
          />
          <button
            type="button"
            onClick={handleExport}
            aria-disabled={!selected}
            className={cn(
              primaryButton,
              "w-full shrink-0 sm:w-auto",
              !selected && "cursor-not-allowed bg-[#0b2244]/45 opacity-55 shadow-none hover:bg-[#0b2244]/45",
            )}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      {exportHint && !selected ? (
        <p className="text-[13px] font-medium text-amber-700/90" role="status">
          Select a report to export.
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const meta = REPORT_KIND_META[card.kind];
          const Icon = card.icon;
          const isSelected = selected === card.kind;
          return (
            <article
              key={card.kind}
              className={cn(
                glass,
                "flex min-w-0 flex-col px-3.5 py-3.5 transition duration-200 sm:px-4 sm:py-4",
                isSelected ? card.selectedTone : "hover:border-white/80 hover:bg-white/68",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setSelected(card.kind);
                  setExportHint(false);
                }}
                aria-pressed={isSelected}
                className="flex w-full min-w-0 items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)]",
                    card.iconTone,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.02em] text-navy">
                  {meta.title}
                </span>
                {isSelected ? (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0b2244] text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                ) : null}
              </button>
              <Link
                href={`${meta.href}?${query}`}
                onClick={() => setSelected(card.kind)}
                className={cn(primaryButton, "mt-3.5 w-full")}
              >
                View Report
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ReportBody({
  kind,
  preset,
  range,
}: {
  kind: ReportKind;
  preset: SalesPeriodPreset;
  range: SalesDateRange;
}) {
  if (kind === "sales") {
    const data = buildSalesReportData(preset, range);
    return (
      <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total Revenue" value={formatTzs(data.totalRevenue)} />
          <Stat label="Transactions" value={data.totalTransactions.toLocaleString("en-US")} />
          <Stat label="Items Sold" value={data.itemsSold.toLocaleString("en-US")} />
          <Stat label="Returns" value={formatTzs(data.returnsAmount)} />
        </section>
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className={cn(glass, "px-4 py-4 sm:px-5")}>
            <h2 className="text-[15px] font-semibold text-navy">Payment Methods</h2>
            <ul className="mt-3 space-y-2">
              {data.paymentBreakdown.map((row) => (
                <li key={row.method} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-slate-500">
                    {row.method} · {row.count}
                  </span>
                  <span className="font-semibold text-navy">{formatTzs(row.amount)}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className={cn(glass, "px-4 py-4 sm:px-5")}>
            <h2 className="text-[15px] font-semibold text-navy">Top Selling Products</h2>
            <ul className="mt-3 space-y-2">
              {data.topProducts.map((row) => (
                <li key={row.name} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-slate-500">
                    {row.name} · {row.quantity}
                  </span>
                  <span className="shrink-0 font-semibold text-navy">{formatTzs(row.revenue)}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
        <article className={cn(glass, "overflow-hidden")}>
          <div className="px-4 py-4 sm:px-5">
            <h2 className="text-[15px] font-semibold text-navy">Sales Breakdown</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Discounts {formatTzs(data.discounts)} · Returns {data.returnsCount}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-[13px]">
              <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.slice(0, 20).map((sale) => (
                  <tr key={sale.id} className="border-t border-white/50">
                    <td className="px-4 py-2.5 font-medium text-navy">#{sale.id}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {sale.dateLabel} {sale.timeLabel}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{sale.payment}</td>
                    <td className="px-3 py-2.5 font-semibold text-navy">{formatTzs(sale.amount)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{sale.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </>
    );
  }

  if (kind === "inventory") {
    const data = buildInventoryReportData(preset, range);
    return (
      <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Total Products" value={data.totalProducts.toLocaleString("en-US")} />
          <Stat label="Total Stock Units" value={data.totalStockUnits.toLocaleString("en-US")} />
          <Stat label="Inventory Value" value={formatTzs(data.totalInventoryValue)} />
          <Stat label="In Stock" value={data.inStock.toLocaleString("en-US")} />
          <Stat label="Low Stock" value={data.lowStock.toLocaleString("en-US")} />
          <Stat label="Out of Stock" value={data.outOfStock.toLocaleString("en-US")} />
        </section>
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className={cn(glass, "px-4 py-4 sm:px-5")}>
            <h2 className="text-[15px] font-semibold text-navy">Stock Movement Summary</h2>
            <ul className="mt-3 space-y-2">
              {data.movements.map((row) => (
                <li key={row.label} className="flex justify-between text-[13px]">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="font-semibold text-navy">{row.count}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className={cn(glass, "px-4 py-4 sm:px-5")}>
            <h2 className="text-[15px] font-semibold text-navy">Low-stock Products</h2>
            <ul className="mt-3 space-y-2">
              {data.lowStockProducts.slice(0, 8).map((row) => (
                <li key={row.sku} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-slate-500">
                    {row.name} · {row.stock} left
                  </span>
                  <span className="shrink-0 font-semibold text-navy">{formatTzs(row.value)}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </>
    );
  }

  if (kind === "purchases") {
    const data = buildPurchaseReportData(preset, range);
    return (
      <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Total Purchases" value={formatTzs(data.totalPurchases)} />
          <Stat label="Number of Purchases" value={data.purchaseCount.toLocaleString("en-US")} />
          <Stat label="Suppliers" value={data.supplierCount.toLocaleString("en-US")} />
          <Stat label="Amount Paid" value={formatTzs(data.amountPaid)} />
          <Stat label="Outstanding" value={formatTzs(data.outstanding)} />
        </section>
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className={cn(glass, "overflow-hidden")}>
            <div className="px-4 py-4 sm:px-5">
              <h2 className="text-[15px] font-semibold text-navy">Purchase Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[520px] w-full text-left text-[13px]">
                <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Purchase</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchases.map((row) => (
                    <tr key={row.number} className="border-t border-white/50">
                      <td className="px-4 py-2.5 font-medium text-navy">{row.number}</td>
                      <td className="px-3 py-2.5 text-slate-500">{row.supplier}</td>
                      <td className="px-3 py-2.5 font-semibold text-navy">{formatTzs(row.amount)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{row.paymentStatus}</td>
                    </tr>
                  ))}
                  {data.purchases.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No purchases in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
          <article className={cn(glass, "px-4 py-4 sm:px-5")}>
            <h2 className="text-[15px] font-semibold text-navy">Supplier Summary</h2>
            <ul className="mt-3 space-y-2.5">
              {data.suppliers.map((row) => (
                <li key={row.name} className="rounded-[14px] border border-white/70 bg-white/45 px-3 py-2.5">
                  <p className="text-[13.5px] font-semibold text-navy">{row.name}</p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Paid {formatTzs(row.paid)} · Outstanding {formatTzs(row.outstanding)}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </>
    );
  }

  const data = buildProfitLossReportData(preset, range);
  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue" value={formatTzs(data.revenue)} />
        <Stat label="Product Profit" value={formatTzs(data.productProfit)} />
        <Stat label="Operating Expenses" value={formatTzs(data.operatingExpenses)} />
        <Stat label="Net Profit" value={formatTzs(data.netProfit)} />
      </section>
      <article className={cn(glass, "px-4 py-4 sm:px-5")}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-200/50 bg-white/70 text-violet-600">
            <FileText className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-navy">How Net Profit is calculated</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
              Product Profit = (Selling Price − Buying Price) × Quantity Sold. Net Profit = Product Profit −
              Operating Expenses.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {data.topProducts.map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-slate-500">
                {row.name} · {row.unitsSold} sold
              </span>
              <span className="shrink-0 font-semibold text-navy">{formatTzs(row.productProfit)}</span>
            </li>
          ))}
        </ul>
      </article>
    </>
  );
}

function ReportDetail({ kind }: { kind: ReportKind }) {
  const meta = REPORT_KIND_META[kind];
  const { preset, range, period, query, onPreset, onRange } = useReportsPeriod(meta.href);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <BackToReports query={query} />
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">{meta.title}</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">{period.label}</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={onPreset}
            onRange={onRange}
            ariaLabel={`${meta.title} period`}
          />
          <button
            type="button"
            onClick={() => downloadReportPdf(kind, preset, range)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>
      <ReportBody kind={kind} preset={preset} range={range} />
    </div>
  );
}

export function SalesReportPage() {
  return <ReportDetail kind="sales" />;
}

export function InventoryReportPage() {
  return <ReportDetail kind="inventory" />;
}

export function PurchaseReportPage() {
  return <ReportDetail kind="purchases" />;
}

export function ProfitLossReportPage() {
  return <ReportDetail kind="profit-loss" />;
}
