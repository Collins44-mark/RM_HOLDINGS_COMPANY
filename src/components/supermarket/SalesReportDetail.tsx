"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Banknote,
  BarChart3,
  Building2,
  Coins,
  CreditCard,
  Download,
  FileText,
  LayoutGrid,
  Phone,
  RotateCcw,
  ShoppingBag,
  TrendingDown,
  Trophy,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { ComparisonIndicator } from "@/components/finance/ComparisonIndicator";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";
import {
  SUPERMARKET_PRODUCT_CATEGORIES,
} from "@/lib/data/supermarket-inventory";
import {
  type SalesReportFilters,
} from "@/lib/data/sample-supermarket-reports";
import { downloadSalesReportPdfFromData } from "@/lib/data/supermarket-reports-pdf";
import { fetchSalesReportAction } from "@/actions/supermarket/reports";
import {
  useReportPeriod,
  type ControlledReportPeriod,
  ReportLoadingChrome,
} from "@/components/supermarket/report-shell";
import { useLiveReport } from "@/lib/supermarket/use-live-report";

const glass =
  "rounded-[22px] border border-white/65 bg-white/70 shadow-[0_12px_36px_rgba(15,35,64,0.055),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl";

const filterSelect =
  "h-10 w-full min-w-0 rounded-full border border-white/75 bg-white/88 pl-9 pr-8 text-[13px] text-navy shadow-[0_4px_12px_rgba(15,35,64,0.04)] outline-none backdrop-blur-xl transition focus:border-white focus:bg-white appearance-none";

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  Cash: Banknote,
  "Mobile Money": Phone,
  Card: CreditCard,
  Bank: Building2,
};

const PAYMENT_TONES: Record<string, string> = {
  Cash: "border-amber-200/50 bg-amber-50/70 text-amber-700",
  "Mobile Money": "border-sky-200/50 bg-sky-50/70 text-sky-700",
  Card: "border-violet-200/50 bg-violet-50/70 text-violet-700",
  Bank: "border-slate-200/60 bg-slate-50/80 text-slate-600",
};

function SectionCard({
  title,
  subtitle,
  icon,
  iconClass,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconClass?: string;
  children: ReactNode;
}) {
  return (
    <article className={cn(glass, "flex min-w-0 flex-col overflow-hidden")}>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-white/80 text-navy/70 shadow-[0_4px_10px_rgba(15,35,64,0.04)]",
            iconClass,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">{title}</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  delta,
  comparisonLabel,
  invert,
  icon: Icon,
  iconTone,
}: {
  label: string;
  value: string;
  delta: number;
  comparisonLabel: string;
  invert?: boolean;
  icon: typeof Coins;
  iconTone: string;
}) {
  return (
    <article className={cn(glass, "min-w-0 px-4 py-4")}>
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white/75 shadow-[0_4px_10px_rgba(15,35,64,0.04)]",
          iconTone,
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      <p className="mt-3 text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[18px] font-semibold tracking-[-0.03em] text-navy sm:text-[19px]">
        {value}
      </p>
      <ComparisonIndicator value={delta} label={comparisonLabel} invert={invert} plainArrow />
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
  icon: typeof Users;
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
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
        <select value={value} onChange={(event) => onChange(event.target.value)} className={filterSelect}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export function SalesReportDetail({
  embedded = false,
  controlledPeriod,
}: {
  embedded?: boolean;
  controlledPeriod?: ControlledReportPeriod;
} = {}) {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod(
    "/supermarket/reports/sales",
    controlledPeriod,
  );
  const [cashier, setCashier] = useState("all");
  const [payment, setPayment] = useState("all");
  const [category, setCategory] = useState("all");

  const filters: SalesReportFilters = useMemo(
    () => ({ cashier, payment, category }),
    [cashier, payment, category],
  );

  const { data, error, loading } = useLiveReport(fetchSalesReportAction, preset, range, filters);
  const cashiers = useMemo(
    () => ["all", ...new Set((data?.cashierPerformance ?? []).map((row) => row.cashier))],
    [data],
  );

  function resetFilters() {
    setCashier("all");
    setPayment("all");
    setCategory("all");
  }

  if (loading && !data) {
    return (
      <ReportLoadingChrome
        embedded={embedded}
        title="Sales Report"
        subtitle="Sales performance and product analysis for the selected period."
      />
    );
  }
  if (error || !data) {
    return <p className="px-1 py-8 text-[13px] text-[#c45b66]">{error || "Unable to load sales report."}</p>;
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {!embedded ? <PageBackButton href={`/supermarket/reports?${query}`} prefetch /> : null}
          <div className={cn("flex items-start gap-3", embedded ? "" : "mt-4")}>
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#0b2244] text-white shadow-[0_8px_18px_rgba(11,34,68,0.22)]">
              <BarChart3 className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
                Sales Report
              </h1>
              <p className="mt-1 text-[13.5px] text-slate-500">
                Sales performance and product analysis for the selected period.
              </p>
            </div>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {!embedded ? (
            <FinancePeriodFilter
              preset={preset}
              label={period.label}
              range={range}
              onPreset={onPreset}
              onRange={onRange}
              ariaLabel="Sales report period"
            />
          ) : null}
          <button
            type="button"
            onClick={() => downloadSalesReportPdfFromData(data, filters)}
            className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Revenue"
          value={formatTzs(data.totalRevenue)}
          delta={data.deltas.revenue}
          comparisonLabel={data.comparisonLabel}
          icon={Coins}
          iconTone="border-sky-200/50 text-sky-600"
        />
        <SummaryCard
          label="Sales"
          value={data.totalSales.toLocaleString("en-US")}
          delta={data.deltas.sales}
          comparisonLabel={data.comparisonLabel}
          icon={FileText}
          iconTone="border-sky-200/50 text-sky-600"
        />
        <SummaryCard
          label="Items Sold"
          value={data.itemsSold.toLocaleString("en-US")}
          delta={data.deltas.itemsSold}
          comparisonLabel={data.comparisonLabel}
          icon={ShoppingBag}
          iconTone="border-sky-200/50 text-sky-600"
        />
        <SummaryCard
          label="Returns"
          value={formatTzs(data.returnsAmount)}
          delta={data.deltas.returns}
          comparisonLabel={data.comparisonLabel}
          invert
          icon={RotateCcw}
          iconTone="border-rose-200/50 text-rose-500"
        />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterField
              label="Cashier"
              icon={Users}
              value={cashier}
              onChange={setCashier}
              options={cashiers.map((name) => ({
                value: name,
                label: name === "all" ? "All Cashiers" : name,
              }))}
            />
            <FilterField
              label="Payment Method"
              icon={Wallet}
              value={payment}
              onChange={setPayment}
              options={[
                { value: "all", label: "All Payment Methods" },
                { value: "Cash", label: "Cash" },
                { value: "Mobile Money", label: "Mobile Money" },
                { value: "Card", label: "Card" },
                { value: "Bank", label: "Bank" },
              ]}
            />
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
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className={cn(secondaryButton, "h-10 w-full shrink-0 gap-1.5 lg:w-auto")}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Reset Filters
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <SectionCard
          title="Payment Methods"
          subtitle="Sales distribution by payment method"
          icon={<CreditCard className="h-4 w-4" strokeWidth={1.9} />}
          iconClass="text-sky-600"
        >
          <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full min-w-[320px] text-left text-[13px]">
              <thead className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 pb-2 pt-1 font-medium sm:px-5">Payment Method</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Transactions</th>
                  <th className="px-4 pb-2 pt-1 text-right font-medium sm:px-5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.paymentBreakdown.map((row) => {
                  const Icon = PAYMENT_ICONS[row.method] ?? Coins;
                  return (
                    <tr key={row.method} className="border-t border-[#e8eef5]/80">
                      <td className="px-4 py-3 sm:px-5">
                        <span className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                              PAYMENT_TONES[row.method],
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                          </span>
                          <span className="font-medium text-navy">{row.method}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{row.count.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">
                        {formatTzs(row.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Cashier Performance"
          subtitle="Sales performance by cashier"
          icon={<UserRound className="h-4 w-4" strokeWidth={1.9} />}
          iconClass="text-sky-600"
        >
          <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full min-w-[360px] text-left text-[13px]">
              <thead className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 pb-2 pt-1 font-medium sm:px-5">Cashier</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Sales</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Items Sold</th>
                  <th className="px-4 pb-2 pt-1 text-right font-medium sm:px-5">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.cashierPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No cashier sales in this period.
                    </td>
                  </tr>
                ) : (
                  data.cashierPerformance.map((row) => (
                    <tr key={row.cashier} className="border-t border-[#e8eef5]/80">
                      <td className="px-4 py-3 font-medium text-navy sm:px-5">{row.cashier}</td>
                      <td className="px-3 py-3 text-slate-500">{row.sales.toLocaleString("en-US")}</td>
                      <td className="px-3 py-3 text-slate-500">{row.itemsSold.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">
                        {formatTzs(row.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <SectionCard
          title="Top Selling Products"
          subtitle="Products with highest sales in the selected period"
          icon={<Trophy className="h-4 w-4" strokeWidth={1.9} />}
          iconClass="border-amber-200/50 bg-amber-50/70 text-amber-600"
        >
          <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full min-w-[360px] text-left text-[13px]">
              <thead className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 pb-2 pt-1 font-medium sm:px-5">#</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Product</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Quantity Sold</th>
                  <th className="px-4 pb-2 pt-1 text-right font-medium sm:px-5">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No product sales in this period.
                    </td>
                  </tr>
                ) : (
                  data.topProducts.map((row, index) => (
                    <tr key={row.name} className="border-t border-[#e8eef5]/80">
                      <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-navy">{row.name}</td>
                      <td className="px-3 py-3 text-slate-500">{row.quantity.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">
                        {formatTzs(row.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Low Selling Products"
          subtitle="Products with lowest sales in the selected period"
          icon={<TrendingDown className="h-4 w-4" strokeWidth={1.9} />}
          iconClass="border-rose-200/50 bg-rose-50/70 text-rose-500"
        >
          <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full min-w-[360px] text-left text-[13px]">
              <thead className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 pb-2 pt-1 font-medium sm:px-5">#</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Product</th>
                  <th className="px-3 pb-2 pt-1 font-medium">Quantity Sold</th>
                  <th className="px-4 pb-2 pt-1 text-right font-medium sm:px-5">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.lowProducts.map((row, index) => (
                  <tr key={row.name} className="border-t border-[#e8eef5]/80">
                    <td className="px-4 py-3 text-slate-400 sm:px-5">{index + 1}</td>
                    <td className="px-3 py-3 font-medium text-navy">{row.name}</td>
                    <td className="px-3 py-3 text-slate-500">{row.quantity.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-right font-semibold text-navy sm:px-5">
                      {formatTzs(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
