"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import {
  getSchoolFeeAccountAction,
  getSchoolFeeReceiptAction,
  listSchoolFeeAccountsAction,
  recordSchoolFeePaymentAction,
  verifySchoolFeePaymentAction,
  type SchoolFeesWorkspaceResult,
} from "@/actions/school/fees";
import { listFeeStructureClassesAction } from "@/actions/school/settings";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { downloadFeeReceiptPdf, type FeeReceiptPayload } from "@/lib/school/fee-receipt-pdf";
import {
  feeStatusLabel,
  paymentMethodLabel,
  type FeeAccountListRow,
  type FeeSummary,
  type StudentFeeAccount,
} from "@/lib/school/fee-types";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";

type Caps = {
  canRecord: boolean;
  canVerify: boolean;
  canReceipt: boolean;
  canManageStructures: boolean;
};

const EMPTY_SUMMARY: FeeSummary = { totalFees: 0, collected: 0, outstanding: 0, studentsWithBalance: 0 };

function amountCell(value: number | null) {
  if (value == null) return "Not configured";
  return formatTzs(value);
}

export function SchoolFeesPage({ initial }: { initial: SchoolFeesWorkspaceResult }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [accounts, setAccounts] = useState<FeeAccountListRow[]>(ready ? initial.accounts : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [summary, setSummary] = useState<FeeSummary>(ready ? initial.summary : EMPTY_SUMMARY);
  const [years] = useState(ready ? initial.years : []);
  const [levels] = useState(ready ? initial.levels : []);
  const [caps, setCaps] = useState<Caps>(
    ready
      ? initial.capabilities
      : { canRecord: false, canVerify: false, canReceipt: false, canManageStructures: false },
  );
  const [yearId, setYearId] = useState(ready ? initial.academicYearId : "");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [detail, setDetail] = useState<StudentFeeAccount | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<FeeReceiptPayload | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "MOBILE_MONEY" | "BANK">("CASH");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [requestId, setRequestId] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [verifiedId, setVerifiedId] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!levelId) return;
    let active = true;
    void listFeeStructureClassesAction(levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [levelId]);

  function load(nextPage: number, next: { yearId?: string; levelId?: string; classId?: string; status?: string; q?: string } = {}) {
    const academicYearId = next.yearId ?? yearId;
    const nextLevel = next.levelId ?? levelId;
    const nextClass = next.classId ?? classId;
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? q;
    void listSchoolFeeAccountsAction({
      page: nextPage,
      academicYearId: academicYearId || undefined,
      levelId: nextLevel || undefined,
      classId: nextClass || undefined,
      status: nextStatus,
      q: nextQ,
    }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAccounts(result.accounts);
      setPage(result.page);
      setSummary(result.summary);
      setCaps(result.capabilities);
    });
  }

  function openDetail(enrollmentId: string, record = false) {
    void getSchoolFeeAccountAction(enrollmentId).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDetail(result.account);
      setCaps(result.capabilities);
      if (record) openPay(result.account);
    });
  }

  function openPay(account: StudentFeeAccount) {
    setPayOpen(true);
    setSaved(false);
    setPayAmount("");
    setPayMethod("CASH");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayReference("");
    setPayNotes("");
    setRequestId(crypto.randomUUID());
    setDetail(account);
  }

  function applyAccount(account: StudentFeeAccount | null) {
    if (!account) return;
    setDetail(account);
    setAccounts((current) =>
      current.map((row) =>
        row.enrollmentId === account.enrollmentId
          ? {
              ...row,
              annualAmount: account.annualAmount,
              paidAmount: account.paidAmount,
              outstandingAmount: account.outstandingAmount,
              status: account.status,
              currentTermName: account.currentTermName,
              currentTermAmount: account.currentTermAmount,
            }
          : row,
      ),
    );
    load(page.page);
  }

  function runRecord() {
    if (!detail || lock.current) return;
    lock.current = true;
    setSaveBusy(true);
    void recordSchoolFeePaymentAction({
      enrollmentId: detail.enrollmentId,
      amount: payAmount,
      method: payMethod,
      paymentDate: payDate,
      reference: payReference,
      notes: payNotes,
      requestId,
    }).then((result) => {
      lock.current = false;
      setSaveBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setCaps(result.capabilities);
      applyAccount(result.account);
    });
  }

  function runVerify(paymentId: string) {
    if (lock.current) return;
    lock.current = true;
    setVerifyBusy(paymentId);
    setVerifiedId(null);
    void verifySchoolFeePaymentAction(paymentId).then((result) => {
      lock.current = false;
      setVerifyBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVerifiedId(paymentId);
      setCaps(result.capabilities);
      applyAccount(result.account);
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

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Fees & Payments</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Manage student fees, payments and outstanding balances.</p>
        </div>
        {caps.canManageStructures ? (
          <Link href="/school/settings?tab=fees" className={secondaryButton}>
            Manage Fee Structures →
          </Link>
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total Fees", summary.totalFees],
          ["Collected", summary.collected],
          ["Outstanding", summary.outstanding],
          ["Students with Balance", summary.studentsWithBalance],
        ].map(([label, value]) => (
          <section key={String(label)} className={cn(glassPanel, "px-4 py-3")}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">
              {label === "Students with Balance" ? value : formatTzs(Number(value))}
            </p>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            load(1, { yearId: event.target.value });
          }}
        >
          <option value="">Academic Year</option>
          {years.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={levelId}
          onChange={(event) => {
            setLevelId(event.target.value);
            setClassId("");
            setClasses([]);
            load(1, { levelId: event.target.value, classId: "" });
          }}
        >
          <option value="">All Levels</option>
          {levels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={classId}
          disabled={!levelId}
          onChange={(event) => {
            setClassId(event.target.value);
            load(1, { classId: event.target.value });
          }}
        >
          <option value="">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[156px] shrink-0")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            load(1, { status: event.target.value });
          }}
        >
          <option value="all">All Status</option>
          <option value="outstanding">Outstanding</option>
          <option value="partial">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="no_structure">No Fee Structure</option>
        </select>
        <form
          className="min-w-[220px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <input
            className={cn(inputClass, "!h-9 !rounded-full")}
            value={q}
            placeholder="Search student name / student no."
            onChange={(event) => setQ(event.target.value)}
          />
        </form>
      </div>

      {accounts.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Wallet} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No students with active enrollment yet.</h2>
          <p className="text-[13.5px] text-slate-500">Completed admissions will appear here automatically.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Student", "Student No.", "Level", "Class", "Annual Fee", "Current Term", "Paid", "Outstanding", "Status", ""].map(
                    (heading) => (
                      <th key={heading || "actions"} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.enrollmentId} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">{row.studentName}</td>
                    <td className="px-4 py-3">{row.studentNumber}</td>
                    <td className="px-4 py-3">{row.levelName}</td>
                    <td className="px-4 py-3">{row.className}</td>
                    <td className="px-4 py-3">{amountCell(row.annualAmount)}</td>
                    <td className="px-4 py-3">
                      {row.currentTermAmount != null
                        ? `${row.currentTermName ?? "Term"} · ${formatTzs(row.currentTermAmount)}`
                        : row.currentTermName
                          ? `${row.currentTermName} · Term fee not configured`
                          : "Term fee not configured"}
                    </td>
                    <td className="px-4 py-3">{formatTzs(row.paidAmount)}</td>
                    <td className="px-4 py-3">{amountCell(row.outstandingAmount)}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={feeStatusLabel(row.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.studentName} fee actions`}
                        items={[
                          { label: "View", onSelect: () => openDetail(row.enrollmentId) },
                          ...(caps.canRecord && row.status !== "no_structure"
                            ? [{ label: "Record Payment", onSelect: () => openDetail(row.enrollmentId, true) }]
                            : []),
                          { label: "View Payments", onSelect: () => openDetail(row.enrollmentId) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next)} />
        </section>
      )}

      {detail && !payOpen && !receipt ? (
        <ContainedDrawer
          title={detail.studentName}
          subtitle={`${detail.studentNumber} · ${detail.levelName} · ${detail.className} · ${detail.streamName}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <DrawerCancel />
              {caps.canRecord && detail.status !== "no_structure" ? (
                <button type="button" className={primaryButton} onClick={() => openPay(detail)}>
                  + Record Payment
                </button>
              ) : null}
            </>
          }
        >
          <div className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-2 text-[13.5px]">
              <p className="text-slate-500">Academic Year</p>
              <p className="text-navy">{detail.academicYearName}</p>
              <p className="text-slate-500">Annual Fee</p>
              <p className="text-navy">{amountCell(detail.annualAmount)}</p>
              <p className="text-slate-500">Current Term</p>
              <p className="text-navy">{detail.currentTermName || "—"}</p>
              <p className="text-slate-500">Term Due</p>
              <p className="text-navy">{detail.currentTermAmount == null ? "Term fee not configured" : formatTzs(detail.currentTermAmount)}</p>
              <p className="text-slate-500">Paid</p>
              <p className="text-navy">{formatTzs(detail.paidAmount)}</p>
              <p className="text-slate-500">Outstanding</p>
              <p className="text-navy">{amountCell(detail.outstandingAmount)}</p>
            </div>
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-navy">Payment History</h3>
              {detail.payments.length ? (
                <div className="space-y-2">
                  {detail.payments.map((payment) => (
                    <div key={payment.id} className="rounded-[14px] border border-navy/8 px-3 py-2 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-navy">
                          {payment.paymentNumber} · {formatTzs(payment.amount)}
                        </p>
                        <StatusPill value={payment.status === "posted" ? "Verified" : "Pending"} />
                      </div>
                      <p className="mt-1 text-slate-500">
                        {payment.paymentDate} · {paymentMethodLabel(payment.method)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                      <p className="text-slate-500">Recorded by {payment.recordedByName || "—"}</p>
                      {payment.verifiedByName ? <p className="text-slate-500">Verified by {payment.verifiedByName}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
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
                              View Receipt
                            </button>
                            <button type="button" className={secondaryButton} onClick={() => runReceipt(payment.id, true)}>
                              Download Receipt
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-slate-500">No payments recorded yet.</p>
              )}
            </div>
          </div>
        </ContainedDrawer>
      ) : null}

      {payOpen && detail ? (
        <ContainedDrawer
          title="Record Payment"
          subtitle={`${detail.studentName} · ${detail.studentNumber}`}
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
            <p className="text-[13px] text-slate-500">
              Annual school fees
              {detail.outstandingAmount != null ? ` · Outstanding ${formatTzs(detail.outstandingAmount)}` : ""}
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount</span>
              <input className={inputClass} inputMode="decimal" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} />
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
            <p>{receipt.studentName} · {receipt.studentNumber}</p>
            <p>{receipt.academicYearName} · {receipt.levelName} · {receipt.className}</p>
            <p>{formatTzs(receipt.amount)} · {receipt.methodLabel}</p>
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
