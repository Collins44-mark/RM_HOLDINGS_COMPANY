"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { disburseLoanAction, loadLoanDetailAction, repayLoanAction } from "@/actions/rice/loans";
import { glassCard, glassPanel, inputClass, primaryButton, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { LoanDisbursement, LoanPosition, LoanRepayment } from "@/lib/rice/loan-model";
import { formatRiceDate, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";
import { SaveLabel } from "@/components/ui/SaveMark";
import { cn } from "@/lib/cn";

type Detail = {
  loan: LoanPosition;
  terms: string;
  purpose: string;
  applicationNumber: string;
  disbursements: LoanDisbursement[];
  repayments: LoanRepayment[];
};

function paidAmount(row: LoanRepayment) {
  return row.principal + row.interest + row.fee;
}

export function RiceLoanDetailPage({
  initial,
}: {
  initial:
    | { ok: true; detail: Detail; caps: { canDisburse: boolean; canRepay: boolean } }
    | { ok: false; error: string };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial.ok ? initial.detail : null);
  const canRepay = initial.ok ? initial.caps.canRepay : false;
  const canDisburse = initial.ok ? initial.caps.canDisburse : false;
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<string | null>(null);
  const [showRepay, setShowRepay] = useState(false);
  const [repay, setRepay] = useState({ amount: "", reference: "", date: todayIso(), note: "" });
  const [disburse, setDisburse] = useState({ amount: "", date: todayIso(), method: "CASH", reference: "" });
  const [receipt, setReceipt] = useState<LoanRepayment | null>(null);

  const loan = detail?.loan;

  async function reload() {
    if (!loan) return;
    const result = await loadLoanDetailAction(loan.id);
    if (result.ok) setDetail(result.detail);
    else setError(result.error);
    router.refresh();
  }

  function printReceipt(row: LoanRepayment) {
    setReceipt(row);
    window.setTimeout(() => window.print(), 50);
  }

  const note = detail?.terms && detail.terms !== "Farmer loan" ? detail.terms : detail?.purpose && detail.purpose !== "Farmer loan" ? detail.purpose : "";
  const remaining = loan ? Math.max(0, loan.approvedAmount - loan.disbursed) : 0;
  const givenOn = detail?.disbursements[0]?.disbursedOn ?? loan?.approvedOn ?? "";

  return (
    <div className="space-y-5 pb-10">
      <style>{`@media print { body * { visibility: hidden; } .loan-print-target, .loan-print-target * { visibility: visible; } .loan-print-target { position: absolute; left: 0; top: 0; width: 100%; background: white; } }`}</style>
      <div>
        <RicePageHeader icon={HandCoins} title={loan ? loan.number : "Loan"} subtitle={loan ? `${loan.farmerName} · ${loan.farmerNumber}` : undefined} />
        <Link href="/rice/loans" className="inline-flex text-[13px] font-semibold text-navy">Back to farmer loans</Link>
        {error ? <RiceNotice>{error}</RiceNotice> : null}
        {!loan || !detail ? null : (
          <>
            <section className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                ["Borrowed", formatTzs(loan.disbursed)],
                ["Repaid", formatTzs(loan.principalRepaid)],
                ["Outstanding", formatTzs(loan.outstanding)],
                ["Status", loan.disbursed <= 0 ? "Not posted" : loan.outstanding <= 0 ? "Fully repaid" : "Active"],
              ].map(([label, value]) => (
                <article key={label} className={`${glassCard} px-3 py-3.5`}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
                  <p className="mt-1.5 text-[16px] font-semibold text-navy">{value}</p>
                </article>
              ))}
            </section>

            <section className={`${glassPanel} mt-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-navy">Loan</h2>
                  <p className="mt-1 text-[13.5px] text-slate-600">
                    Given {formatRiceDate(givenOn)} · {formatTzs(loan.disbursed)}
                    {note ? ` · ${note}` : ""}
                  </p>
                </div>
                {canRepay && loan.outstanding > 0 ? (
                  <button className={primaryButton} type="button" onClick={() => setShowRepay(true)}>Repay</button>
                ) : null}
              </div>
              {showRepay && loan.outstanding > 0 ? (
                <form
                  className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setBusyAction("repay");
                    setFailedAction(null);
                    setError(null);
                    void repayLoanAction({
                      requestId: crypto.randomUUID(),
                      loanId: loan.id,
                      principal: repay.amount,
                      interest: "0",
                      fee: "0",
                      paidOn: repay.date,
                      method: "CASH",
                      reference: repay.reference,
                      note: repay.note,
                    }).then(async (result) => {
                      if (!result.ok) {
                        setFailedAction("repay");
                        setError(result.error);
                        setBusyAction(null);
                        return;
                      }
                      setBusyAction(null);
                      setRepay({ amount: "", reference: "", date: todayIso(), note: "" });
                      await reload();
                      setShowRepay(false);
                    });
                  }}
                >
                  <RiceField label="Amount paid">
                    <input className={inputClass} inputMode="decimal" value={repay.amount} onChange={(event) => setRepay({ ...repay, amount: event.target.value })} required />
                  </RiceField>
                  <RiceField label="Payment reference">
                    <input className={inputClass} value={repay.reference} onChange={(event) => setRepay({ ...repay, reference: event.target.value })} required />
                  </RiceField>
                  <RiceField label="Payment date">
                    <input type="date" className={inputClass} value={repay.date} onChange={(event) => setRepay({ ...repay, date: event.target.value })} required />
                  </RiceField>
                  <RiceField label="Note">
                    <input className={inputClass} value={repay.note} onChange={(event) => setRepay({ ...repay, note: event.target.value })} placeholder="Optional" />
                  </RiceField>
                  <div className="flex flex-wrap gap-2">
                    <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "repay"} failed={failedAction === "repay"} label="Save repayment" /></button>
                    <button className={secondaryButton} type="button" onClick={() => setShowRepay(false)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </section>

            {canDisburse && loan.status !== "CLOSED" && remaining > 0 ? (
              <section className={`${glassPanel} mt-4`}>
                <h2 className="text-[16px] font-semibold text-navy">Post the approved amount</h2>
                <p className="mt-1 text-[13px] text-slate-500">{formatTzs(remaining)} is still waiting to be given.</p>
                <form
                  className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setBusyAction("disburse");
                    setFailedAction(null);
                    setError(null);
                    void disburseLoanAction({
                      requestId: crypto.randomUUID(),
                      loanId: loan.id,
                      amount: disburse.amount,
                      disbursedOn: disburse.date,
                      method: disburse.method,
                      reference: disburse.reference,
                    }).then(async (result) => {
                      if (!result.ok) {
                        setFailedAction("disburse");
                        setError(result.error);
                        setBusyAction(null);
                        return;
                      }
                      setBusyAction(null);
                      setDisburse({ amount: "", date: todayIso(), method: "CASH", reference: "" });
                      await reload();
                    });
                  }}
                >
                  <RiceField label="Amount"><input className={inputClass} inputMode="decimal" value={disburse.amount} onChange={(event) => setDisburse({ ...disburse, amount: event.target.value })} required /></RiceField>
                  <RiceField label="Date"><input type="date" className={inputClass} value={disburse.date} onChange={(event) => setDisburse({ ...disburse, date: event.target.value })} required /></RiceField>
                  <RiceField label="Method">
                    <select className={inputClass} value={disburse.method} onChange={(event) => setDisburse({ ...disburse, method: event.target.value })}>
                      <option value="CASH">Cash</option>
                      <option value="MOBILE_MONEY">Mobile money</option>
                      <option value="BANK">Bank</option>
                    </select>
                  </RiceField>
                  <RiceField label="Payment reference"><input className={inputClass} value={disburse.reference} onChange={(event) => setDisburse({ ...disburse, reference: event.target.value })} /></RiceField>
                  <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "disburse"} failed={failedAction === "disburse"} label="Post amount" /></button>
                </form>
              </section>
            ) : null}

            <section className={`${glassPanel} mt-4 ${receipt ? "" : "loan-print-target"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[16px] font-semibold text-navy">Repayment history</h2>
                {detail.repayments.length > 0 ? (
                  <button className={secondaryButton} type="button" onClick={() => { setReceipt(null); window.setTimeout(() => window.print(), 50); }}>Print records</button>
                ) : null}
              </div>
              <div className={`${tableScrollClass} mt-3`}>
                <table className="min-w-full text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr>{["Receipt", "Date", "Amount", "Reference", ""].map((heading) => <th key={heading || "print"} className="px-3 py-2">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {detail.repayments.length === 0 ? (
                      <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>No repayments yet.</td></tr>
                    ) : detail.repayments.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.receiptNumber}</td>
                        <td className="px-3 py-2.5">{formatRiceDate(row.paidOn)}</td>
                        <td className="px-3 py-2.5">{formatTzs(paidAmount(row))}</td>
                        <td className="px-3 py-2.5">{row.reference || "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button className="font-semibold text-navy" type="button" onClick={() => printReceipt(row)}>Print receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loan.interestReceived > 0 || loan.feesReceived > 0 ? (
                <p className="mt-3 text-[12.5px] text-slate-500">
                  Earlier receipts on this loan also recorded interest {formatTzs(loan.interestReceived)} and fees {formatTzs(loan.feesReceived)}. Those amounts are included in the amount column and do not change the outstanding principal.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
      {receipt && loan ? (
        <article className="loan-print-target hidden print:block">
          <h1 className="text-[22px] font-semibold text-navy">RM Holdings · Loan repayment receipt</h1>
          <p className="mt-4 text-[14px] text-navy">{receipt.receiptNumber}</p>
          <p className="mt-2 text-[14px]">Farmer: {loan.farmerName} · {loan.farmerNumber}</p>
          <p className="mt-1 text-[14px]">Loan: {loan.number}</p>
          <p className="mt-1 text-[14px]">Date: {formatRiceDate(receipt.paidOn)}</p>
          <p className="mt-1 text-[14px]">Amount: {formatTzs(paidAmount(receipt))}</p>
          <p className="mt-1 text-[14px]">Reference: {receipt.reference || "—"}</p>
        </article>
      ) : null}
    </div>
  );
}
