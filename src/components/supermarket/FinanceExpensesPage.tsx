"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  EXPENSE_CATEGORIES,
  FINANCE_PAYMENT_METHODS,
  expenseSummaryCards,
  formatFinanceDate,
  type ExpenseCategory,
  type FinancePaymentMethod,
  type MockExpense,
} from "@/lib/data/sample-supermarket-finance";
import {
  resolveSalesPeriod,
  type SalesDateRange,
  type SalesPeriodPreset,
} from "@/lib/data/sample-supermarket-sales";
import { FinanceBackLink } from "@/components/supermarket/FinanceBackLink";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { RecordExpenseModal } from "@/components/supermarket/FinanceRecordModals";
import { filterClass, primaryButton, tableHead } from "@/components/supermarket/purchasing-ui";
import { useSupermarketFinance } from "@/lib/supermarket/client-stores";

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FinanceExpensesPage() {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ExpenseCategory>("all");
  const [paymentMethod, setPaymentMethod] = useState<"all" | FinancePaymentMethod>("all");
  const [preset, setPreset] = useState<SalesPeriodPreset>("week");
  const [customRange, setCustomRange] = useState<SalesDateRange>(() => {
    const today = todayIso();
    return { from: today, to: today };
  });

  const finance = useSupermarketFinance();
  const asOf = todayIso();
  const period = useMemo(
    () => resolveSalesPeriod(preset, customRange, asOf),
    [preset, customRange, asOf],
  );

  const mapped: MockExpense[] = useMemo(
    () =>
      finance.expenses.map((item) => ({
        id: item.id,
        name: item.description || item.category,
        category: (EXPENSE_CATEGORIES.includes(item.category as ExpenseCategory)
          ? item.category
          : "Other") as ExpenseCategory,
        amount: item.amount,
        paymentMethod: "Cash",
        date: item.expenseDate,
        note: item.description,
        reference: "",
        recordedBy: "Staff",
        status: item.paymentStatus === "PAID" ? "Paid" : "Recorded",
      })),
    [finance.expenses],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mapped.filter((item) => {
      if (item.date < period.start || item.date > period.end) return false;
      if (category !== "all" && item.category !== category) return false;
      if (paymentMethod !== "all" && item.paymentMethod !== paymentMethod) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.note.toLowerCase().includes(needle)
      );
    });
  }, [mapped, period.start, period.end, category, paymentMethod, query]);

  const summary = useMemo(() => expenseSummaryCards(rows), [rows]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <FinanceBackLink />
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Expenses</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Operating expenses such as electricity, transport, rent, salaries and repairs. These reduce Net Profit.
          </p>
          {finance.error ? (
            <p className="mt-2 text-[12.5px] text-[#c45b66]">{finance.error}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={customRange}
            onPreset={setPreset}
            onRange={setCustomRange}
            ariaLabel="Expenses period"
          />
          <button type="button" onClick={() => setExpenseOpen(true)} className={cn(primaryButton, "w-full sm:w-auto")}>
            + Record Expense
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat label="Period Total" value={formatTzs(summary.total)} />
        <SummaryStat label="Transactions" value={summary.count.toLocaleString("en-US")} />
        <SummaryStat label="Average" value={formatTzs(summary.average)} />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5 sm:py-5")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search expenses</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search expenses..."
              className={cn(filterClass, "pl-10")}
            />
          </label>
          <label className="block">
            <span className="sr-only">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as "all" | ExpenseCategory)}
              className={filterClass}
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Payment method</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as "all" | FinancePaymentMethod)}
              className={filterClass}
            >
              <option value="all">All Methods</option>
              {FINANCE_PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rm-table-scroll mt-4 overflow-x-auto rounded-[18px] border border-white/60">
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/50 bg-white/35">
                  <td className="px-3 py-3 text-slate-500">{formatFinanceDate(row.date)}</td>
                  <td className="px-3 py-3 font-medium text-navy">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.category}</td>
                  <td className="px-3 py-3 text-slate-600">{row.paymentMethod}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-navy">
                    {formatTzs(row.amount)}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.status}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    {finance.loaded ? "No expenses in this period." : "Loading expenses…"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {expenseOpen ? <RecordExpenseModal onClose={() => setExpenseOpen(false)} /> : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <article className={cn(glass, "px-4 py-4")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </article>
  );
}
