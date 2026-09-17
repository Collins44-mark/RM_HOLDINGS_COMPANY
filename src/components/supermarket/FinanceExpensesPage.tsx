"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  EXPENSE_CATEGORIES,
  FINANCE_ACTIVITY_AS_OF,
  FINANCE_PAYMENT_METHODS,
  deleteMockExpense,
  expenseSummaryCards,
  filterMockExpenses,
  formatFinanceDate,
  getFinanceActivitySnapshot,
  subscribeFinanceActivity,
  type ExpenseCategory,
  type FinancePaymentMethod,
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

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

export function FinanceExpensesPage() {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ExpenseCategory>("all");
  const [paymentMethod, setPaymentMethod] = useState<"all" | FinancePaymentMethod>("all");
  const [preset, setPreset] = useState<SalesPeriodPreset>("week");
  const [customRange, setCustomRange] = useState<SalesDateRange>({
    from: "2026-09-01",
    to: FINANCE_ACTIVITY_AS_OF,
  });

  const activity = useSyncExternalStore(
    subscribeFinanceActivity,
    getFinanceActivitySnapshot,
    getFinanceActivitySnapshot,
  );

  const period = useMemo(
    () => resolveSalesPeriod(preset, customRange, FINANCE_ACTIVITY_AS_OF),
    [preset, customRange],
  );

  const rows = useMemo(
    () =>
      filterMockExpenses(activity.expenses, {
        query,
        category,
        paymentMethod,
        start: period.start,
        end: period.end,
      }),
    [activity.expenses, query, category, paymentMethod, period.start, period.end],
  );

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
      </section>

      <section className={cn(glass, "overflow-hidden")}>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Payment Method</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Recorded By</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/50">
                  <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                    {formatFinanceDate(row.date)}
                  </td>
                  <td className="min-w-0 px-5 py-3.5">
                    <p className="text-[13.5px] font-semibold text-navy">{row.name}</p>
                    {row.note ? <p className="mt-0.5 text-[12px] text-slate-400">{row.note}</p> : null}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] text-slate-600">{row.category}</td>
                  <td className="px-5 py-3.5 text-[13.5px] text-slate-600">{row.paymentMethod}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] font-semibold tabular-nums text-navy">
                    {formatTzs(row.amount)}
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] text-slate-600">{row.recordedBy}</td>
                  <td className="px-5 py-3.5">
                    <StatusPill value={row.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => deleteMockExpense(row.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[#c45b66] transition hover:bg-rose-50"
                      aria-label={`Delete ${row.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    No expenses found for these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-[18px] border border-white/70 bg-white/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-navy">{row.name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{formatFinanceDate(row.date)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-semibold tabular-nums text-navy">{formatTzs(row.amount)}</p>
                  <div className="mt-1 flex justify-end">
                    <StatusPill value={row.status} />
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                <div>
                  <dt className="text-slate-400">Category</dt>
                  <dd className="mt-0.5 font-medium text-navy">{row.category}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Payment Method</dt>
                  <dd className="mt-0.5 font-medium text-navy">{row.paymentMethod}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Recorded By</dt>
                  <dd className="mt-0.5 font-medium text-navy">{row.recordedBy}</dd>
                </div>
                {row.note ? (
                  <div className="col-span-2">
                    <dt className="text-slate-400">Note</dt>
                    <dd className="mt-0.5 font-medium text-navy">{row.note}</dd>
                  </div>
                ) : null}
              </dl>
              <button
                type="button"
                onClick={() => deleteMockExpense(row.id)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[#c45b66] transition hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                Delete
              </button>
            </article>
          ))}
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-slate-500">No expenses found for these filters.</p>
          ) : null}
        </div>
      </section>

      {expenseOpen ? <RecordExpenseModal onClose={() => setExpenseOpen(false)} /> : null}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        value === "Paid" && "bg-[#e7f4ea] text-[#3f8a5a]",
        value === "Recorded" && "bg-[#e8eef6] text-[#4d6480]",
      )}
    >
      {value}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(glass, "px-4 py-4 sm:px-5")}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </div>
  );
}
