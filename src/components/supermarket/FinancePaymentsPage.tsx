"use client";

import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  FINANCE_PAYMENT_METHODS,
  MONEY_IN_PAYMENT_TYPES,
  MONEY_OUT_PAYMENT_TYPES,
  filterMockPayments,
  formatFinanceDate,
  paymentDirection,
  paymentDisplayDescription,
  paymentSummaryCards,
  type FinancePaymentMethod,
  type MockPayment,
  type PaymentType,
} from "@/lib/data/sample-supermarket-finance";
import {
  resolveSalesPeriod,
  type SalesDateRange,
  type SalesPeriodPreset,
} from "@/lib/data/sample-supermarket-sales";
import { FinanceBackLink } from "@/components/supermarket/FinanceBackLink";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { RecordPaymentModal } from "@/components/supermarket/FinanceRecordModals";
import { filterClass, primaryButton, tableHead } from "@/components/supermarket/purchasing-ui";
import { removePayment, useSupermarketFinance } from "@/lib/supermarket/client-stores";
import type { PaymentRecord } from "@/lib/supermarket/types";

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function methodFromDb(method: string): FinancePaymentMethod {
  const upper = method.toUpperCase();
  if (upper === "MOBILE_MONEY" || method === "Mobile Money") return "Mobile Money";
  if (upper === "CARD" || method === "Card") return "Card";
  if (upper === "BANK" || method === "Bank") return "Bank";
  return "Cash";
}

function paymentTypeFromRecord(payment: PaymentRecord): PaymentType {
  const kind = payment.kind.toUpperCase();
  if (kind === "SUPPLIER_PAYMENT") return "Supplier Payment";
  if (kind === "EXPENSE_PAYMENT") return "Expense Payment";
  if (kind === "REFUND") return "Customer Refund";
  if (kind === "CUSTOMER_PAYMENT") {
    return payment.direction === "OUT" ? "Customer Refund" : "Customer Receipt";
  }
  return payment.direction === "IN" ? "Other Income" : "Other Payment";
}

function mapPayment(payment: PaymentRecord): MockPayment {
  return {
    id: payment.id,
    paymentType: paymentTypeFromRecord(payment),
    description: payment.notes || payment.kind,
    amount: payment.amount,
    paymentMethod: methodFromDb(payment.method),
    date: payment.paymentDate.slice(0, 10),
    reference: payment.reference,
    notes: payment.notes,
    supplier: "",
    linkedExpenseId: "",
  };
}

export function FinancePaymentsPage() {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [paymentType, setPaymentType] = useState<"all" | PaymentType>("all");
  const [paymentMethod, setPaymentMethod] = useState<"all" | FinancePaymentMethod>("all");
  const [preset, setPreset] = useState<SalesPeriodPreset>("week");
  const [customRange, setCustomRange] = useState<SalesDateRange>(() => {
    const today = todayIso();
    return { from: today, to: today };
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const finance = useSupermarketFinance();
  const asOf = todayIso();
  const period = useMemo(
    () => resolveSalesPeriod(preset, customRange, asOf),
    [preset, customRange, asOf],
  );

  const mapped = useMemo(() => finance.payments.map(mapPayment), [finance.payments]);

  const rows = useMemo(
    () =>
      filterMockPayments(mapped, {
        query,
        paymentType,
        paymentMethod,
        start: period.start,
        end: period.end,
      }),
    [mapped, query, paymentType, paymentMethod, period.start, period.end],
  );

  const summary = useMemo(() => paymentSummaryCards(rows), [rows]);

  async function onDelete(id: string) {
    setDeletingId(id);
    await removePayment(id);
    setDeletingId(null);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <FinanceBackLink />
          <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Payments</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-slate-500">
            Money movements only. Supplier payments settle outstanding payables and do not reduce Net Profit again.
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
            ariaLabel="Payments period"
          />
          <button type="button" onClick={() => setPaymentOpen(true)} className={cn(primaryButton, "w-full sm:w-auto")}>
            + Record Payment
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat label="Money Received" value={formatTzs(summary.received)} />
        <SummaryStat label="Money Paid" value={formatTzs(summary.paid)} />
        <SummaryStat label="Total Transactions" value={summary.totalTransactions.toLocaleString("en-US")} />
      </section>

      <section className={cn(glass, "px-4 py-4 sm:px-5 sm:py-5")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search payments</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search payments..."
              className={cn(filterClass, "pl-10")}
            />
          </label>
          <label className="block">
            <span className="sr-only">Payment type</span>
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value as "all" | PaymentType)}
              className={filterClass}
            >
              <option value="all">All Types</option>
              <optgroup label="Money In">
                {MONEY_IN_PAYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Money Out">
                {MONEY_OUT_PAYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
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
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Payment Method</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const direction = paymentDirection(row.paymentType);
                return (
                  <tr key={row.id} className="border-t border-white/50">
                    <td className="whitespace-nowrap px-5 py-3.5 text-[13.5px] tabular-nums text-slate-600">
                      {formatFinanceDate(row.date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-[13.5px] text-slate-600">{row.paymentType}</p>
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                        {direction === "in" ? "Money In" : "Money Out"}
                      </p>
                    </td>
                    <td className="min-w-0 px-5 py-3.5 text-[13.5px] font-semibold text-navy">
                      {paymentDisplayDescription(row)}
                      {row.paymentType === "Supplier Payment" ? (
                        <span className="mt-0.5 block text-[11.5px] font-normal text-slate-400">
                          Settles supplier outstanding — not an operating expense
                        </span>
                      ) : null}
                      {row.paymentType === "Expense Payment" ? (
                        <span className="mt-0.5 block text-[11.5px] font-normal text-slate-400">
                          Linked expense payment — profit impact is via the expense
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] text-slate-600">{row.paymentMethod}</td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-5 py-3.5 text-[13.5px] font-semibold tabular-nums",
                        direction === "in" ? "text-emerald-700" : "text-[#c45b66]",
                      )}
                    >
                      {direction === "in" ? "+" : "-"}
                      {formatTzs(row.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-[13.5px] text-slate-600">{row.reference || "—"}</td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        disabled={deletingId === row.id}
                        onClick={() => void onDelete(row.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[#c45b66] transition hover:bg-rose-50 disabled:opacity-50"
                        aria-label={`Delete ${paymentDisplayDescription(row)}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[13.5px] text-slate-500">
                    No payments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => {
            const direction = paymentDirection(row.paymentType);
            return (
              <article
                key={row.id}
                className="rounded-[18px] border border-white/70 bg-white/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-navy">{paymentDisplayDescription(row)}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {formatFinanceDate(row.date)} · {row.paymentType}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-[14px] font-semibold tabular-nums",
                      direction === "in" ? "text-emerald-700" : "text-[#c45b66]",
                    )}
                  >
                    {direction === "in" ? "+" : "-"}
                    {formatTzs(row.amount)}
                  </p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div>
                    <dt className="text-slate-400">Direction</dt>
                    <dd className="mt-0.5 font-medium text-navy">{direction === "in" ? "Money In" : "Money Out"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Payment Method</dt>
                    <dd className="mt-0.5 font-medium text-navy">{row.paymentMethod}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Reference</dt>
                    <dd className="mt-0.5 font-medium text-navy">{row.reference || "—"}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  disabled={deletingId === row.id}
                  onClick={() => void onDelete(row.id)}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-[#c45b66] transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  Delete
                </button>
              </article>
            );
          })}
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-slate-500">No payments yet.</p>
          ) : null}
        </div>
      </section>

      {paymentOpen ? <RecordPaymentModal onClose={() => setPaymentOpen(false)} /> : null}
    </div>
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
