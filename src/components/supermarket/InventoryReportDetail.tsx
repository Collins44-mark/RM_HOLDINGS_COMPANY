"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, ChevronDown, ClipboardList, Download, LayoutGrid, Package, RotateCcw, Search, TriangleAlert, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { SUPERMARKET_PRODUCT_CATEGORIES } from "@/lib/data/supermarket-inventory";
import {
  type InventoryReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import { downloadInventoryReportPdfFromData } from "@/lib/data/supermarket-reports-pdf";
import { useReportPeriod, type ControlledReportPeriod, ReportLoadingChrome } from "@/components/supermarket/report-shell";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { fetchInventoryReportAction } from "@/actions/supermarket/reports";
import { useLiveReport } from "@/lib/supermarket/use-live-report";

const glass =
  "rounded-[18px] border border-[#e7ecf3] bg-white/90 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl";

const filterSelect =
  "h-10 w-full min-w-0 rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-8 text-[13px] text-navy outline-none transition focus:border-[#b7c6da] focus:ring-4 focus:ring-[#0b2244]/5 appearance-none";

const STOCK_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "In Stock", label: "In Stock" },
  { value: "Low Stock", label: "Low Stock" },
  { value: "Out of Stock", label: "Out of Stock" },
  { value: "Expiring Soon", label: "Expiring Soon" },
  { value: "Expired", label: "Expired" },
];

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "In Stock"
      ? "bg-[#e8f6ee] text-[#2f7a4d]"
      : value === "Low Stock"
        ? "bg-[#fff4e5] text-[#a66b1a]"
        : value === "Out of Stock" || value === "Expired"
          ? "bg-[#fdecee] text-[#b42318]"
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
  const up = value >= 0;
  const positive = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "mt-3 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        positive ? "bg-[#e8f6ee] text-[#2f7a4d]" : "bg-[#fdecee] text-[#b42318]",
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
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: number;
  comparisonLabel: string;
  invert?: boolean;
  icon: typeof Package;
}) {
  return (
    <article className={cn(glass, "min-w-0 px-4 py-4 sm:px-5")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e7ecf3] bg-[#f7f9fc] text-navy/55">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
      </div>
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
  icon: typeof LayoutGrid;
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

export function InventoryReportDetail({
  embedded = false,
  controlledPeriod,
}: {
  embedded?: boolean;
  controlledPeriod?: ControlledReportPeriod;
} = {}) {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod(
    "/supermarket/reports/inventory",
    controlledPeriod,
  );
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const filters: InventoryReportFilters = useMemo(
    () => ({ category, status }),
    [category, status],
  );

  const { data, error, loading } = useLiveReport(fetchInventoryReportAction, preset, range, filters);

  const valuationRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = data?.valuation ?? [];
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
  }, [data?.valuation, search]);

  function resetFilters() {
    setCategory("all");
    setStatus("all");
    setSearch("");
  }

  if (loading && !data) {
    return (
      <ReportLoadingChrome
        embedded={embedded}
        title="Inventory Report"
        subtitle="Stock levels, movement and valuation for the selected period."
      />
    );
  }
  if (error || !data) {
    return <p className="px-1 py-8 text-[13px] text-[#c45b66]">{error || "Unable to load inventory report."}</p>;
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {!embedded ? <PageBackButton href={`/supermarket/reports?${query}`} prefetch /> : null}
          <div className={cn("flex items-start gap-3", embedded ? "" : "mt-4")}>
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#e7ecf3] bg-[#f7f9fc] text-navy/55 shadow-[0_4px_12px_rgba(15,35,64,0.04)]">
              <Boxes className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
                Inventory Report
              </h1>
              <p className="mt-1 text-[13.5px] text-slate-500">
                Stock levels, movement and valuation for the selected period.
              </p>
            </div>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center md:justify-end">
          {!embedded ? (
            <FinancePeriodFilter
              preset={preset}
              label={period.label}
              range={range}
              onPreset={onPreset}
              onRange={onRange}
              ariaLabel="Inventory report period"
            />
          ) : null}
          <button
            type="button"
            onClick={() => downloadInventoryReportPdfFromData(data)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Products"
          value={data.totalProducts.toLocaleString("en-US")}
          delta={data.deltas.products}
          comparisonLabel={data.comparisonLabel}
          icon={Package}
        />
        <SummaryCard
          label="Total Stock Units"
          value={data.totalStockUnits.toLocaleString("en-US")}
          delta={data.deltas.stockUnits}
          comparisonLabel={data.comparisonLabel}
          icon={Boxes}
        />
        <SummaryCard
          label="Inventory Value"
          value={formatTzs(data.totalInventoryValue)}
          delta={data.deltas.inventoryValue}
          comparisonLabel={data.comparisonLabel}
          icon={Wallet}
        />
        <SummaryCard
          label="Low Stock Items"
          value={data.lowStock.toLocaleString("en-US")}
          delta={data.deltas.lowStock}
          comparisonLabel={data.comparisonLabel}
          invert
          icon={TriangleAlert}
        />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <FilterField
              label="Product Category"
              icon={LayoutGrid}
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "All Categories" },
                ...SUPERMARKET_PRODUCT_CATEGORIES.map((name) => ({ value: name, label: name })),
              ]}
            />
            <FilterField
              label="Stock Status"
              icon={ClipboardList}
              value={status}
              onChange={setStatus}
              options={STOCK_STATUS_OPTIONS}
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Stock Movement</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Summary of stock movements in the selected period.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-[13px]">
              <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 sm:px-5">Movement</th>
                  <th className="px-3 py-2.5">Count</th>
                  <th className="px-4 py-2.5 text-right sm:px-5">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((row) => (
                  <tr key={row.label} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 font-medium text-navy sm:px-5">{row.label}</td>
                    <td className="px-3 py-3 text-slate-500">{row.count.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">
                      {row.quantity.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Inventory Summary</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Overview of inventory status.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[13px]">
              <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 sm:px-5">Metric</th>
                  <th className="px-4 py-2.5 text-right sm:px-5">Value</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { metric: "Total Products", value: data.totalProducts.toLocaleString("en-US") },
                  { metric: "Total Stock Units", value: data.totalStockUnits.toLocaleString("en-US") },
                  {
                    metric: "Inventory Value (TZS)",
                    value: data.totalInventoryValue.toLocaleString("en-US"),
                  },
                  { metric: "Low Stock Items", value: data.lowStock.toLocaleString("en-US") },
                  { metric: "Expiring Soon", value: data.expiringSoon.toLocaleString("en-US") },
                  { metric: "Expired Items", value: data.expiredItems.toLocaleString("en-US") },
                ].map((row) => (
                  <tr key={row.metric} className="border-t border-[#e8eef5]">
                    <td className="px-4 py-3 text-slate-600 sm:px-5">{row.metric}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <article className={cn(glass, "min-w-0 overflow-hidden")}>
        <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Inventory Valuation</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Current stock valuation by product.</p>
          </div>
          <label className="relative block w-full sm:w-[240px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy/40"
              strokeWidth={1.9}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products..."
              className="h-10 w-full rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-3 text-[13px] text-navy outline-none transition placeholder:text-slate-400 focus:border-[#b7c6da] focus:ring-4 focus:ring-[#0b2244]/5"
            />
          </label>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-[#f3f6fa]/90 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-4 py-2.5 sm:px-5">#</th>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5">Quantity</th>
                <th className="px-3 py-2.5">Buying Price</th>
                <th className="px-3 py-2.5">Stock Value</th>
                <th className="px-4 py-2.5 sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {valuationRows.map((row, index) => (
                <tr key={row.name} className="border-t border-[#e8eef5]">
                  <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                  <td className="px-3 py-3 font-medium text-navy">{row.name}</td>
                  <td className="px-3 py-3 text-slate-500">{row.quantity.toLocaleString("en-US")}</td>
                  <td className="px-3 py-3 text-slate-500">{formatTzs(row.buyingPrice)}</td>
                  <td className="px-3 py-3 font-semibold text-navy">{formatTzs(row.stockValue)}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <StatusPill value={row.status} />
                  </td>
                </tr>
              ))}
              {valuationRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                    No products match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {valuationRows.map((row, index) => (
            <li key={row.name} className="rounded-[14px] border border-[#e6ebf2] bg-white/70 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-slate-400">#{index + 1}</p>
                  <p className="mt-0.5 font-semibold text-navy">{row.name}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    Qty {row.quantity} · {formatTzs(row.buyingPrice)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-navy">{formatTzs(row.stockValue)}</p>
                  <div className="mt-1.5 flex justify-end">
                    <StatusPill value={row.status} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
