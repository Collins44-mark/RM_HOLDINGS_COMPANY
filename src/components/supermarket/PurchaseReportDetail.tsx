"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  Minus,
  RotateCcw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import {
  buildPurchaseReportData,
  type PurchaseReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import { seedSuppliers } from "@/lib/data/supermarket-purchasing";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import { useReportPeriod } from "@/components/supermarket/report-shell";

const glass =
  "rounded-[18px] border border-[#e7ecf3] bg-white/90 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl";

const filterSelect =
  "h-10 w-full min-w-0 rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-8 text-[13px] text-navy outline-none transition focus:border-[#b7c6da] focus:ring-4 focus:ring-[#0b2244]/5 appearance-none";

const PAYMENT_STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "Paid", label: "Paid" },
  { value: "Partial", label: "Partial" },
  { value: "Unpaid", label: "Unpaid" },
];

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "Received" || value === "Paid" || value === "Completed"
      ? "bg-[#e8f6ee] text-[#2f7a4d]"
      : value === "Unpaid" || value === "Cancelled"
        ? "bg-[#fdecee] text-[#b42318]"
        : value === "Partial" || value === "Pending"
          ? "bg-[#fff4e5] text-[#a66b1a]"
          : "bg-[#f3f6fa] text-slate-500";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>
      {value}
    </span>
  );
}

function TrendBadge({
  value,
  label,
  invert = false,
}: {
  value: number;
  label: string;
  invert?: boolean;
}) {
  const flat = value === 0;
  const up = value > 0;
  const positive = invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "mt-3 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        flat
          ? "bg-[#f3f6fa] text-slate-500"
          : positive
            ? "bg-[#e8f6ee] text-[#2f7a4d]"
            : "bg-[#fdecee] text-[#b42318]",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.4} />
      <span className="truncate">
        {Math.abs(value)}% <span className="font-normal opacity-80">{label}</span>
      </span>
    </span>
  );
}

function SummaryCard({
  label,
  value,
  delta,
  comparisonLabel,
  invert,
}: {
  label: string;
  value: string;
  delta: number;
  comparisonLabel: string;
  invert?: boolean;
}) {
  return (
    <article className={cn(glass, "min-w-0 px-4 py-4 sm:px-5")}>
      <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
      <p className="mt-3 truncate text-[22px] font-semibold tracking-[-0.04em] text-navy sm:text-[24px]">
        {value}
      </p>
      <TrendBadge value={delta} label={comparisonLabel} invert={invert} />
    </article>
  );
}

function FilterField({
  label,
  icon: Icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: typeof Building2;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.08em] text-slate-400">
        {label}
      </span>
      <span className="relative block">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy/45"
          strokeWidth={1.9}
        />
        <select value={value} onChange={(event) => onChange(event.target.value)} className={filterSelect}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy/40"
          strokeWidth={2}
        />
      </span>
    </label>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#e8eef5] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="text-[13.5px] font-semibold tabular-nums text-navy">{value}</p>
    </div>
  );
}

export function PurchaseReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/purchases");
  const [supplier, setSupplier] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [search, setSearch] = useState("");

  const filters: PurchaseReportFilters = useMemo(
    () => ({ supplier, paymentStatus }),
    [supplier, paymentStatus],
  );

  const data = useMemo(
    () => buildPurchaseReportData(preset, range, filters),
    [preset, range, filters],
  );

  const purchaseRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.purchases;
    return data.purchases.filter(
      (row) =>
        row.number.toLowerCase().includes(needle) ||
        row.supplier.toLowerCase().includes(needle) ||
        row.paymentStatus.toLowerCase().includes(needle) ||
        row.status.toLowerCase().includes(needle),
    );
  }, [data.purchases, search]);

  const supplierTotal = data.suppliers.reduce((sum, row) => sum + row.purchases, 0);
  const paymentAmountTotal = data.paymentStatusSummary.reduce((sum, row) => sum + row.amount, 0);
  const paymentCountTotal = data.paymentStatusSummary.reduce((sum, row) => sum + row.count, 0);

  function resetFilters() {
    setSupplier("all");
    setPaymentStatus("all");
    setSearch("");
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link
            href={`/supermarket/reports?${query}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Reports
          </Link>
          <div className="mt-3 min-w-0">
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
              Purchase Report
            </h1>
            <p className="mt-1 text-[13.5px] text-slate-500">
              Purchase summary and supplier-wise details for the selected period.
            </p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center md:justify-end">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={onPreset}
            onRange={onRange}
            ariaLabel="Purchase report period"
          />
          <button
            type="button"
            onClick={() => downloadReportPdf("purchases", preset, range)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Purchases (TZS)"
          value={formatTzs(data.totalPurchases)}
          delta={data.deltas.purchases}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Purchase Orders"
          value={data.purchaseCount.toLocaleString("en-US")}
          delta={data.deltas.orders}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Items Purchased"
          value={data.itemsPurchased.toLocaleString("en-US")}
          delta={data.deltas.items}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Outstanding (TZS)"
          value={formatTzs(data.outstanding)}
          delta={data.deltas.outstanding}
          comparisonLabel={data.comparisonLabel}
          invert
        />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterField
              label="Supplier"
              icon={Building2}
              value={supplier}
              onChange={setSupplier}
              options={[
                { value: "all", label: "All Suppliers" },
                ...seedSuppliers().map((item) => ({ value: item.name, label: item.name })),
              ]}
            />
            <label className="block min-w-0 flex-1">
              <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.08em] text-slate-400">
                Date Range
              </span>
              <span className="relative block">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy/45"
                  strokeWidth={1.9}
                />
                <input
                  readOnly
                  value={data.periodDates}
                  className="h-10 w-full rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-3 text-[13px] text-navy outline-none"
                />
              </span>
            </label>
            <FilterField
              label="Payment Status"
              icon={CreditCard}
              value={paymentStatus}
              onChange={setPaymentStatus}
              options={PAYMENT_STATUS_OPTIONS}
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className={cn(secondaryButton, "h-10 w-full shrink-0 gap-1.5 rounded-[12px] lg:w-auto")}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Reset Filters
          </button>
        </div>
      </section>

      <article className={cn(glass, "min-w-0 overflow-hidden")}>
        <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Purchase Summary</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Overview of purchases for the selected period.</p>
        </div>
        <div className="grid grid-cols-1 gap-0 border-t border-[#e8eef5] px-4 py-2 sm:grid-cols-2 sm:gap-8 sm:px-5 sm:py-3">
          <div>
            <MetricRow label="Total Purchases (TZS)" value={data.totalPurchases.toLocaleString("en-US")} />
            <MetricRow label="Purchase Orders" value={data.purchaseCount.toLocaleString("en-US")} />
            <MetricRow label="Items Purchased" value={data.itemsPurchased.toLocaleString("en-US")} />
          </div>
          <div>
            <MetricRow label="Outstanding (TZS)" value={data.outstanding.toLocaleString("en-US")} />
            <MetricRow label="Suppliers" value={data.supplierCount.toLocaleString("en-US")} />
            <MetricRow
              label="Average Order Value (TZS)"
              value={data.averageOrderValue.toLocaleString("en-US")}
            />
          </div>
        </div>
      </article>

      <article className={cn(glass, "min-w-0 overflow-hidden")}>
        <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Purchases</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Detailed list of purchases in the selected period.
            </p>
          </div>
          <label className="relative block w-full sm:w-[240px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy/40"
              strokeWidth={1.9}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search purchases..."
              className="h-10 w-full rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-3 text-[13px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#b7c6da] focus:ring-4 focus:ring-[#0b2244]/5"
            />
          </label>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-4 py-2.5 sm:px-5">#</th>
                <th className="px-3 py-2.5">PO Number</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5">Items</th>
                <th className="px-3 py-2.5">Amount (TZS)</th>
                <th className="px-3 py-2.5">Payment Status</th>
                <th className="px-4 py-2.5 sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {purchaseRows.map((row, index) => (
                <tr key={row.number} className="border-t border-[#e8eef5]">
                  <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold text-navy">{row.number}</td>
                  <td className="px-3 py-3 text-slate-500">{row.date}</td>
                  <td className="px-3 py-3 text-slate-600">{row.supplier}</td>
                  <td className="px-3 py-3 text-slate-500">{row.items.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-navy">
                    {row.amount.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill value={row.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <StatusPill value={row.status} />
                  </td>
                </tr>
              ))}
              {purchaseRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    No purchases match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {purchaseRows.map((row, index) => (
            <li key={row.number} className="rounded-[14px] border border-[#e6ebf2] bg-white/70 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-400">#{index + 1}</p>
                  <p className="mt-0.5 font-semibold text-navy">{row.number}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {row.supplier} · {row.date} · {row.items} items
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-navy">{formatTzs(row.amount)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill value={row.paymentStatus} />
                <StatusPill value={row.status} />
              </div>
            </li>
          ))}
        </ul>
      </article>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Supplier Summary</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Purchases by supplier for the selected period.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[13px]">
              <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 sm:px-5">#</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5 text-right sm:px-5">Total Purchases (TZS)</th>
                </tr>
              </thead>
              <tbody>
                {data.suppliers.map((row, index) => (
                  <tr key={row.name} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                    <td className="px-3 py-3 font-medium text-navy">{row.name}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy sm:px-5">
                      {row.purchases.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
                {data.suppliers.length > 0 ? (
                  <tr className="border-t border-[#e8eef5] bg-[#f7f9fc]/80">
                    <td className="px-4 py-3 sm:px-5" colSpan={2}>
                      <span className="font-semibold text-navy">Total</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy sm:px-5">
                      {supplierTotal.toLocaleString("en-US")}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                      No supplier purchases in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Payment Status Summary</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Breakdown by payment status.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-[13px]">
              <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 sm:px-5">Status</th>
                  <th className="px-3 py-2.5 text-right">Amount (TZS)</th>
                  <th className="px-3 py-2.5 text-right">Count</th>
                  <th className="px-4 py-2.5 text-right sm:px-5">% of Purchases</th>
                </tr>
              </thead>
              <tbody>
                {data.paymentStatusSummary.map((row) => (
                  <tr key={row.status} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 sm:px-5">
                      <StatusPill value={row.status} />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-navy">
                      {row.amount.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-500">
                      {row.count.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-navy sm:px-5">
                      {row.percentage.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {data.paymentStatusSummary.length > 0 ? (
                  <tr className="border-t border-[#e8eef5] bg-[#f7f9fc]/80">
                    <td className="px-4 py-3 font-semibold text-navy sm:px-5">Total</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-navy">
                      {paymentAmountTotal.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-navy">
                      {paymentCountTotal.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">100%</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No payment activity in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
