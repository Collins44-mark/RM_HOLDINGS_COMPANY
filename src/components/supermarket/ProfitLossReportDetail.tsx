"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building2, CalendarDays, ChevronDown, Download, FileText, Minus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import {
  type ProfitLossReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import { fetchProfitLossReportAction } from "@/actions/supermarket/reports";
import { useLiveReport } from "@/lib/supermarket/use-live-report";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import { useReportPeriod } from "@/components/supermarket/report-shell";
import { PageBackButton } from "@/components/ui/PageBackButton";

const glass =
  "rounded-[20px] border border-[#e7ecf3] bg-white/90 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl";

const filterSelect =
  "h-10 w-full min-w-0 rounded-[12px] border border-[#dbe3ee] bg-white pl-9 pr-8 text-[13px] text-navy outline-none transition focus:border-[#b7c6da] focus:ring-4 focus:ring-[#0b2244]/5 appearance-none";

const BRANCH_OPTIONS = [
  { value: "all", label: "All Branches" },
  { value: "main", label: "Main Branch" },
  { value: "warehouse", label: "Warehouse" },
];

const REPORT_TYPE_OPTIONS = [
  { value: "standard", label: "Standard P&L" },
  { value: "detailed", label: "Detailed P&L" },
  { value: "summary", label: "Summary Only" },
];

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

function formatAmount(value: number) {
  return value.toLocaleString("en-US");
}

export function ProfitLossReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/profit-loss");
  const [branch, setBranch] = useState("all");
  const [reportType, setReportType] = useState("standard");

  const filters: ProfitLossReportFilters = useMemo(
    () => ({ branch, reportType }),
    [branch, reportType],
  );

  const { data, error, loading } = useLiveReport(fetchProfitLossReportAction, preset, range, filters);
  if (loading && !data) {
    return <p className="px-1 py-8 text-[13px] text-slate-500">Loading profit & loss…</p>;
  }
  if (error || !data) {
    return <p className="px-1 py-8 text-[13px] text-[#c45b66]">{error || "Unable to load profit & loss."}</p>;
  }


  const summaryRows = [
    { label: "Revenue", amount: data.revenue, highlight: false as const },
    { label: "Cost of Goods Sold", amount: data.costOfGoodsSold, highlight: false as const },
    { label: "Gross Profit", amount: data.grossProfit, highlight: "profit" as const },
    { label: "Operating Expenses", amount: data.operatingExpenses, highlight: false as const },
    { label: "Other Income", amount: data.otherIncome, highlight: false as const },
    { label: "Other Expenses", amount: data.inventoryLoss, highlight: false as const },
    { label: "Net Profit", amount: data.netProfit, highlight: "profit" as const },
  ];

  const profitabilityRows = [
    { label: "Gross Margin", value: `${data.grossMargin}%` },
    { label: "Net Margin", value: `${data.netMargin}%` },
    { label: "Operating Expense Ratio", value: `${data.operatingExpenseRatio}%` },
    { label: "Inventory Turnover", value: `${data.inventoryTurnover}x` },
    { label: "Average Order Value", value: formatAmount(data.averageOrderValue) },
    { label: "Break-even Sales", value: formatAmount(data.breakEvenSales) },
  ];

  function resetFilters() {
    setBranch("all");
    setReportType("standard");
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <PageBackButton href={`/supermarket/reports?${query}`} prefetch />
          <div className="mt-4 min-w-0">
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
              Profit & Loss Report
            </h1>
            <p className="mt-1 text-[13.5px] text-slate-500">
              Revenue, expenses and profitability for the selected period.
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
            ariaLabel="Profit and loss report period"
          />
          <button
            type="button"
            onClick={() => downloadReportPdf("profit-loss", preset, range)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Revenue"
          value={formatTzs(data.revenue)}
          delta={data.deltas.revenue}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Cost of Goods Sold"
          value={formatTzs(data.costOfGoodsSold)}
          delta={data.deltas.cogs}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Gross Profit"
          value={formatTzs(data.grossProfit)}
          delta={data.deltas.grossProfit}
          comparisonLabel={data.comparisonLabel}
        />
        <SummaryCard
          label="Operating Expenses"
          value={formatTzs(data.operatingExpenses)}
          delta={data.deltas.operatingExpenses}
          comparisonLabel={data.comparisonLabel}
          invert
        />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
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
              label="Branch"
              icon={Building2}
              value={branch}
              onChange={setBranch}
              options={BRANCH_OPTIONS}
            />
            <FilterField
              label="Report Type"
              icon={FileText}
              value={reportType}
              onChange={setReportType}
              options={REPORT_TYPE_OPTIONS}
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
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Financial Summary</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Key financial metrics for the selected period.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead>
              <tr className="border-y border-[#e8eef5] bg-[#f8fafc]/70 text-[11.5px] uppercase tracking-[0.06em] text-slate-400">
                <th className="px-4 py-3 font-medium sm:px-5">Metric</th>
                <th className="px-4 py-3 text-right font-medium sm:px-5">Amount (TZS)</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr
                  key={row.label}
                  className={cn(
                    "border-t border-[#eef2f7]",
                    row.highlight === "profit" && "bg-[#f3faf6]",
                  )}
                >
                  <td
                    className={cn(
                      "px-4 py-3.5 sm:px-5",
                      row.highlight === "profit"
                        ? "font-semibold text-navy"
                        : "font-medium text-navy",
                    )}
                  >
                    {row.label}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3.5 text-right tabular-nums sm:px-5",
                      row.highlight === "profit"
                        ? "font-semibold text-[#2f7a4d]"
                        : "font-medium text-navy",
                    )}
                  >
                    {formatAmount(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">
              Top Operating Expenses
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Major operating expenses for the selected period.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead>
                <tr className="border-y border-[#e8eef5] bg-[#f8fafc]/70 text-[11.5px] uppercase tracking-[0.06em] text-slate-400">
                  <th className="w-10 px-4 py-3 font-medium sm:px-5">#</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 text-right font-medium">Amount (TZS)</th>
                  <th className="px-4 py-3 text-right font-medium sm:px-5">% of Expenses</th>
                </tr>
              </thead>
              <tbody>
                {data.topOperatingExpenses.map((row, index) => (
                  <tr key={row.category} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                    <td className="px-3 py-3 font-medium text-navy">{row.category}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-navy">
                      {formatAmount(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 sm:px-5">
                      {row.percentage}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[#e8eef5] bg-[#f8fafc]/50">
                  <td className="px-4 py-3.5 sm:px-5" colSpan={2}>
                    <span className="font-semibold text-navy">Total</span>
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-navy">
                    {formatAmount(data.operatingExpenses)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-navy sm:px-5">
                    100%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className={cn(glass, "min-w-0 overflow-hidden")}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">
              Profitability Metrics
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Key ratios and indicators for the selected period.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead>
                <tr className="border-y border-[#e8eef5] bg-[#f8fafc]/70 text-[11.5px] uppercase tracking-[0.06em] text-slate-400">
                  <th className="px-4 py-3 font-medium sm:px-5">Metric</th>
                  <th className="px-4 py-3 text-right font-medium sm:px-5">Value</th>
                </tr>
              </thead>
              <tbody>
                {profitabilityRows.map((row) => (
                  <tr key={row.label} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-3.5 font-medium text-navy sm:px-5">{row.label}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-navy sm:px-5">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
