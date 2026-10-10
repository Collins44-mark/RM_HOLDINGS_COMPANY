"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getSchoolFeeAccountAction,
  getSchoolFeeReceiptAction,
  recordSchoolFeePaymentAction,
  verifySchoolFeePaymentAction,
} from "@/actions/school/fees";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import { downloadFeeReceiptPdf, type FeeReceiptPayload } from "@/lib/school/fee-receipt-pdf";
import {
  feeStatusLabel,
  paymentMethodLabel,
  type FeeObligationRow,
  type StudentFeeAccount,
} from "@/lib/school/fee-types";
import { formatCompactStudentNumber } from "@/lib/school/student-number";
import { SchoolStudentTransportPanel } from "@/components/school/SchoolStudentTransportPanel";
import { patchFeesListSnapshotAccount } from "@/lib/school/admission-flash";

type Caps = {
  canRecord: boolean;
  canVerify: boolean;
  canReceipt: boolean;
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-navy">{value || "—"}</p>
    </div>
  );
}

function money(value: number | null) {
  if (value == null) return "Not configured";
  return formatTzs(value);
}

function formatWhen(iso: string, date: string) {
  if (!iso) return date || "—";
  const next = new Date(iso);
  if (Number.isNaN(next.getTime())) return date || iso;
  return next.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function remainingOf(account: StudentFeeAccount, chargeId: string) {
  const obligation = account.obligations.find((row) => row.chargeId && row.chargeId === chargeId);
  return obligation?.remaining ?? null;
}

function obligationLabel(row: FeeObligationRow) {
  const period = row.billingPeriod || row.academicYearName;
  const remaining = row.remaining == null ? "—" : formatAmount(row.remaining);
  return `${row.description} · ${period} · remaining ${remaining}`;
}

function payableObligations(account: StudentFeeAccount) {
  return account.obligations.filter((row) => row.status !== "no_structure" && (row.remaining == null || row.remaining > 0));
}

export function SchoolStudentFeeProfilePage({
  account: initialAccount,
  capabilities: initialCaps,
  error: initialError,
  pending = false,
  heading = null,
  openPay = false,
}: {
  account: StudentFeeAccount | null;
  capabilities: Caps | null;
  error: string | null;
  pending?: boolean;
  heading?: { studentName?: string; studentNumber?: string } | null;
  openPay?: boolean;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [caps, setCaps] = useState<Caps>(
    initialCaps ?? { canRecord: false, canVerify: false, canReceipt: false },
  );
  const [error, setError] = useState(initialError);
  const [payOpen, setPayOpen] = useState(openPay && Boolean(initialAccount));
  const [payEnrollmentId, setPayEnrollmentId] = useState(initialAccount?.enrollmentId ?? "");
  const [payChargeId, setPayChargeId] = useState(initialAccount?.chargeId ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "MOBILE_MONEY" | "BANK">("CASH");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [verifiedId, setVerifiedId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FeeReceiptPayload | null>(null);
  const lock = useRef(false);

  if (!account && pending) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <Link href="/school/fees" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Fees & Payments
        </Link>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{heading?.studentName || "Student fees"}</h1>
        {heading?.studentNumber ? <p className="text-[13.5px] text-slate-500">{heading.studentNumber}</p> : null}
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-w-0 max-w-full space-y-4 pb-10">
        <Link href="/school/fees" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Fees & Payments
        </Link>
        <p className="text-[13px] text-[#c45b66]">{error ?? "Fee account was not found."}</p>
      </div>
    );
  }

  const viewEnrollmentId = account.enrollmentId;

  function startPay(target?: FeeObligationRow) {
    const current = account;
    if (!current) return;
    const open = payableObligations(current);
    const next =
      target && (target.remaining == null || target.remaining > 0)
        ? target
        : open.find((row) => row.enrollmentId === viewEnrollmentId) ?? open[0];
    setPayEnrollmentId(next?.enrollmentId || viewEnrollmentId);
    setPayChargeId(next?.chargeId || "");
    setPayOpen(true);
    setSaved(false);
    setPayAmount("");
    setPayMethod("CASH");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayReference("");
    setPayNotes("");
    setRequestId(crypto.randomUUID());
  }

  function applyAccount(next: StudentFeeAccount) {
    setAccount(next);
    patchFeesListSnapshotAccount({
      enrollmentId: next.enrollmentId,
      studentId: next.studentId,
      annualAmount: next.annualAmount,
      paidAmount: next.paidAmount,
      outstandingAmount: next.outstandingAmount,
      totalOutstanding: next.totalOutstanding,
      status: next.status,
    });
  }

  function runRecord() {
    if (!account || lock.current) return;
    lock.current = true;
    setSaveBusy(true);
    const enrollmentId = payEnrollmentId || viewEnrollmentId;
    void recordSchoolFeePaymentAction({
      enrollmentId,
      chargeId: payChargeId,
      amount: payAmount,
      method: payMethod,
      paymentDate: payDate,
      reference: payReference,
      notes: payNotes,
      requestId,
    }).then(async (result) => {
      lock.current = false;
      setSaveBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setCaps(result.capabilities);
      if (result.account && result.account.enrollmentId === viewEnrollmentId) {
        applyAccount(result.account);
      } else {
        const view = await getSchoolFeeAccountAction(viewEnrollmentId);
        if (view.ok) {
          applyAccount(view.account);
          setCaps(view.capabilities);
        } else if (result.account) applyAccount(result.account);
      }
    });
  }

  function runVerify(paymentId: string) {
    if (lock.current) return;
    lock.current = true;
    setVerifyBusy(paymentId);
    setVerifiedId(null);
    void verifySchoolFeePaymentAction(paymentId).then(async (result) => {
      lock.current = false;
      setVerifyBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVerifiedId(paymentId);
      setCaps(result.capabilities);
      if (result.account && result.account.enrollmentId === viewEnrollmentId) {
        applyAccount(result.account);
      } else {
        const view = await getSchoolFeeAccountAction(viewEnrollmentId);
        if (view.ok) applyAccount(view.account);
      }
    });
  }

  function runReceipt(paymentId: string, download: boolean) {
    void getSchoolFeeReceiptAction(paymentId, { audit: download }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReceipt(result.receipt);
      if (download) downloadFeeReceiptPdf(result.receipt);
    });
  }

  const studentNo = formatCompactStudentNumber(account.studentNumber);
  const remaining = remainingOf(account, payChargeId);
  const payable = payableObligations(account);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/fees" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Fees & Payments
      </Link>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{account.studentName}</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {studentNo}
            {account.admissionNumber ? ` · ${account.admissionNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value={feeStatusLabel(account.status)} />
          {caps.canRecord && account.status !== "no_structure" ? (
            <button type="button" className={primaryButton} onClick={() => startPay()}>
              Record Payment
            </button>
          ) : null}
        </div>
      </header>

      <section className={cn(glassPanel, "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3")}>
        <Fact label="Student no." value={studentNo} />
        <Fact label="Admission no." value={account.admissionNumber} />
        <Fact label="Status" value={account.studentStatus === "active" ? "Active" : account.studentStatus} />
        <Fact label="Level" value={account.levelName} />
        <Fact label="Class" value={account.className} />
        <Fact label="Class code" value={account.classCode} />
        <Fact label="Stream" value={account.streamName || "Not assigned"} />
        <Fact label="Academic year" value={account.academicYearName} />
        <Fact label="Current term" value={account.currentTermName || "—"} />
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total billed", money(account.totalBilled)],
          ["Payments collected", formatTzs(account.totalPaid)],
          ["Total outstanding", money(account.totalOutstanding)],
          ["This year outstanding", money(account.outstandingAmount)],
        ].map(([label, value]) => (
          <section key={label} className={cn(glassPanel, "px-4 py-3")}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
          </section>
        ))}
      </div>

      <section className={cn(glassPanel, "grid grid-cols-1 gap-3 sm:grid-cols-3")}>
        <Fact label="Current term billed" value={account.currentTermAmount == null ? "Not configured" : formatTzs(account.currentTermAmount)} />
        <Fact label="This year paid" value={formatTzs(account.paidAmount)} />
        <Fact label="This year balance" value={money(account.outstandingAmount)} />
      </section>

      <SchoolStudentTransportPanel studentId={account.studentId} enrollmentId={account.enrollmentId} initial={null} />

      <section className={glassPanel}>
        <h2 className="px-4 pt-4 text-[15px] font-semibold text-navy">Fee breakdown</h2>
        <p className="px-4 pb-2 text-[12.5px] text-slate-500">
          Tuition and school transport charges share this account. Term amounts on tuition are structure breakdown, not a second bill.
        </p>
        {account.obligations.length === 0 ? (
          <p className="px-4 pb-4 text-[13.5px] text-slate-500">No billed obligations for this student.</p>
        ) : (
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Charge", "Period", "Billed", "Paid", "Remaining", "Status", ""].map((heading) => (
                    <th key={heading || "act"} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account.obligations.map((row) => (
                  <tr key={row.chargeId || `${row.enrollmentId}-${row.description}`} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{row.description}</td>
                    <td className="px-4 py-3">{row.billingPeriod || row.academicYearName}</td>
                    <td className="px-4 py-3 tabular-nums">{money(row.billed)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTzs(row.paid)}</td>
                    <td className="px-4 py-3 tabular-nums">{money(row.remaining)}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={feeStatusLabel(row.status)} />
                    </td>
                    <td className="px-4 py-3">
                      {caps.canRecord && row.status !== "no_structure" && (row.remaining == null || row.remaining > 0) ? (
                        <button type="button" className={secondaryButton} onClick={() => startPay(row)}>
                          Record Payment
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="payments" className={glassPanel}>
        <h2 className="px-4 pt-4 text-[15px] font-semibold text-navy">Payment history</h2>
        {account.payments.length === 0 ? (
          <p className="px-4 py-4 text-[13.5px] text-slate-500">No payments recorded yet.</p>
        ) : (
          <div className={tableScrollClass}>
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Amount", "Method", "Reference", "Allocated to", "Recorded by", "Status", ""].map((heading) => (
                    <th key={heading || "pay-act"} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account.payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{formatWhen(payment.recordedAt, payment.paymentDate)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTzs(payment.amount)}</td>
                    <td className="px-4 py-3">{paymentMethodLabel(payment.method)}</td>
                    <td className="px-4 py-3">{payment.reference || "—"}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const allocated = account.obligations.find((row) => row.chargeId === payment.chargeId);
                        if (!allocated) return payment.academicYearName || "Unallocated";
                        return [allocated.description, allocated.billingPeriod || allocated.academicYearName].filter(Boolean).join(" · ");
                      })()}
                    </td>
                    <td className="px-4 py-3">{payment.recordedByName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        value={
                          payment.status === "posted" ? "Posted" : payment.status === "pending" ? "Pending" : payment.status
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {caps.canVerify && payment.status === "pending" ? (
                          <SchoolWorkflowButton
                            className={secondaryButton}
                            busy={verifyBusy === payment.id}
                            confirmed={verifiedId === payment.id}
                            idleLabel="Verify"
                            confirmedLabel="Verified ✓"
                            onClick={() => runVerify(payment.id)}
                          />
                        ) : null}
                        {caps.canReceipt && payment.status === "posted" ? (
                          <>
                            <button type="button" className={secondaryButton} onClick={() => runReceipt(payment.id, false)}>
                              View receipt
                            </button>
                            <button type="button" className={secondaryButton} onClick={() => runReceipt(payment.id, true)}>
                              Print
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payOpen ? (
        <ContainedDrawer
          title="Record Payment"
          subtitle={`${account.studentName} · ${studentNo}`}
          onClose={() => setPayOpen(false)}
          busy={saveBusy}
          footer={
            <>
              <DrawerCancel disabled={saveBusy} />
              <SchoolWorkflowButton
                className={primaryButton}
                busy={saveBusy}
                confirmed={saved}
                idleLabel="Save Payment"
                confirmedLabel="Saved ✓"
                onClick={runRecord}
              />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            {payable.length > 1 ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Charge</span>
                <select
                  className={inputClass}
                  value={payChargeId}
                  onChange={(event) => {
                    const next = event.target.value;
                    const match = payable.find((row) => row.chargeId === next);
                    setPayChargeId(match?.chargeId ?? next);
                    setPayEnrollmentId(match?.enrollmentId || payEnrollmentId);
                    setPayAmount("");
                  }}
                >
                  {payable.map((row) => (
                    <option key={row.chargeId || `${row.enrollmentId}-${row.description}-${row.billingPeriod ?? ""}`} value={row.chargeId || ""}>
                      {obligationLabel(row)}
                    </option>
                  ))}
                </select>
              </label>
            ) : payable.length === 1 ? (
              <p className="text-[13px] text-slate-500">{obligationLabel(payable[0])}</p>
            ) : (
              <p className="text-[13px] text-slate-500">There is no outstanding charge to receive a payment.</p>
            )}
            {remaining != null ? (
              <p className="text-[12.5px] text-slate-500">Outstanding on this charge: {formatTzs(remaining)}. Partial payments are allowed.</p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={payAmount}
                placeholder={remaining != null ? formatAmount(remaining) : undefined}
                onChange={(event) => setPayAmount(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment method</span>
              <select
                className={inputClass}
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value as "CASH" | "MOBILE_MONEY" | "BANK")}
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK">Bank</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment date</span>
              <input type="date" className={inputClass} value={payDate} onChange={(event) => setPayDate(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">
                {payMethod === "CASH" ? "Reference (optional)" : "Reference"}
              </span>
              <input className={inputClass} value={payReference} onChange={(event) => setPayReference(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
              <input className={inputClass} value={payNotes} onChange={(event) => setPayNotes(event.target.value)} />
            </label>
          </div>
        </ContainedDrawer>
      ) : null}

      {receipt ? (
        <ContainedDrawer
          title="Fee receipt"
          subtitle={receipt.paymentNumber}
          onClose={() => setReceipt(null)}
          footer={
            <>
              <DrawerCancel />
              <button type="button" className={primaryButton} onClick={() => downloadFeeReceiptPdf(receipt)}>
                Download Receipt
              </button>
            </>
          }
        >
          <div className="space-y-2 pb-4 text-[13.5px] text-navy">
            <p>{receipt.schoolName}</p>
            <p>
              {receipt.studentName} · {formatCompactStudentNumber(receipt.studentNumber)}
            </p>
            <p>
              {receipt.academicYearName} · {receipt.levelName} · {receipt.className}
            </p>
            <p>
              {formatTzs(receipt.amount)} · {receipt.methodLabel}
            </p>
            <p>Reference: {receipt.reference}</p>
            <p>Recorded by {receipt.recordedByName || "—"}</p>
            <p>Verified by {receipt.verifiedByName || "—"}</p>
            <p>Outstanding: {receipt.outstandingAmount == null ? "—" : formatTzs(receipt.outstandingAmount)}</p>
          </div>
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
