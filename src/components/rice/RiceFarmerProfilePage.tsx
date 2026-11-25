"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { loadFarmerHistoryAction, loadLoanWorkspaceAction, repayLoanAction, saveFarmerProfileAction } from "@/actions/rice/loans";
import { glassPanel, inputClass, primaryButton, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import type { LoanFarmer, LoanPosition } from "@/lib/rice/loan-model";
import { formatRiceDate, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SaveLabel } from "@/components/ui/SaveMark";
import { cn } from "@/lib/cn";
import { DEFAULT_PAGE_SIZE, pageMeta } from "@/lib/pagination";

type History = {
  repayments: { id: string; loanId: string; receiptNumber: string; amount: number; paidOn: string; reference: string }[];
  disbursements: { id: string; loanId: string; number: string; amount: number; disbursedOn: string; reference: string }[];
};

type Profile = {
  farmer: LoanFarmer;
  loans: LoanPosition[];
  history: History;
  canEdit: boolean;
  canRepay: boolean;
};

function loanStatus(status: string, outstanding: number, disbursed: number) {
  if (disbursed <= 0 && status !== "CLOSED") return "Approved";
  if (outstanding <= 0) return "Fully repaid";
  if (status === "ACTIVE") return "Active";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function RiceFarmerProfilePage({
  initial,
}: {
  initial: { ok: true; profile: Profile } | { ok: false; error: string };
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial.ok ? initial.profile : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<string | null>(null);
  const [showRepay, setShowRepay] = useState(false);
  const [loanPage, setLoanPage] = useState(1);
  const [loanPageSize, setLoanPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [repaymentPage, setRepaymentPage] = useState(1);
  const [repaymentPageSize, setRepaymentPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [repay, setRepay] = useState({ loanId: "", amount: "", date: todayIso(), reference: "", note: "" });
  const [form, setForm] = useState({
    location: initial.ok ? initial.profile.farmer.location ?? "" : "",
    farmDetails: initial.ok ? initial.profile.farmer.farmDetails ?? "" : "",
  });

  const farmer = profile?.farmer ?? null;
  const loans = profile?.loans ?? [];
  const openLoans = loans.filter((row) => row.outstanding > 0);
  const repayments = profile?.history.repayments ?? [];
  const loanPages = pageMeta(loanPage, loans.length, loanPageSize);
  const loanRows = loans.slice((loanPages.page - 1) * loanPageSize, loanPages.page * loanPageSize);
  const repaymentPages = pageMeta(repaymentPage, repayments.length, repaymentPageSize);
  const repaymentRows = repayments.slice((repaymentPages.page - 1) * repaymentPageSize, repaymentPages.page * repaymentPageSize);

  async function reload(partyId: string) {
    const [workspaceResult, historyResult] = await Promise.all([
      loadLoanWorkspaceAction(),
      loadFarmerHistoryAction(partyId),
    ]);
    if (!workspaceResult.ok) {
      setError(workspaceResult.error);
      return;
    }
    const next = workspaceResult.workspace.farmers.find((row) => row.id === partyId);
    if (!next) {
      setError("Farmer was not found.");
      return;
    }
    if (!historyResult.ok) setError(historyResult.error);
    setProfile({
      farmer: next,
      loans: workspaceResult.workspace.loans.filter((row) => row.partyId === partyId),
      history: historyResult.ok ? { repayments: historyResult.repayments, disbursements: historyResult.disbursements } : { repayments: [], disbursements: [] },
      canEdit: workspaceResult.workspace.caps.canApply,
      canRepay: workspaceResult.workspace.caps.canRepay,
    });
    setForm({ location: next.location ?? "", farmDetails: next.farmDetails ?? "" });
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={HandCoins} title={farmer?.name ?? "Farmer"} subtitle={farmer ? `${farmer.partyNumber}${farmer.phone ? ` · ${farmer.phone}` : ""}` : undefined} />
      <Link href="/rice/loans?tab=farmers" className="inline-flex text-[13px] font-semibold text-navy">Back to farmers</Link>
      {error ? <RiceNotice>{error}</RiceNotice> : null}
      {!farmer || !profile ? null : (
        <>
          <section className="grid grid-cols-3 gap-2.5">
            {[
              ["Borrowed", formatTzs(farmer.borrowed)],
              ["Repaid", formatTzs(farmer.repaid)],
              ["Outstanding", formatTzs(farmer.outstanding)],
            ].map(([label, value]) => (
              <div key={label} className={`${glassPanel} px-4 py-4`}>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
                <p className="mt-1 text-[18px] font-semibold text-navy">{value}</p>
              </div>
            ))}
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Profile</h2>
            <p className="mt-2 text-[13.5px] text-slate-600">{farmer.location || "No location"}{farmer.farmDetails ? ` · ${farmer.farmDetails}` : ""}</p>
            {profile.canEdit ? (
              <form
                className="mt-4 grid grid-cols-2 gap-3 max-[540px]:grid-cols-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBusyAction("profile");
                  setFailedAction(null);
                  setError(null);
                  void saveFarmerProfileAction({ partyId: farmer.id, location: form.location, farmDetails: form.farmDetails }).then(async (result) => {
                    if (!result.ok) {
                      setFailedAction("profile");
                      setError(result.error);
                      setBusyAction(null);
                      return;
                    }
                    setBusyAction(null);
                    await reload(farmer.id);
                  });
                }}
              >
                <RiceField label="Location"><input className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></RiceField>
                <RiceField label="Farm details"><input className={inputClass} value={form.farmDetails} onChange={(event) => setForm({ ...form, farmDetails: event.target.value })} /></RiceField>
                <button className={cn(secondaryButton, "mt-6 h-12 min-w-[8.75rem] justify-self-start")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "profile"} failed={failedAction === "profile"} label="Save details" /></button>
              </form>
            ) : null}
          </section>
          <section className={glassPanel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-navy">Loans</h2>
              {profile.canRepay && openLoans.length > 0 ? (
                <button
                  className={primaryButton}
                  type="button"
                  onClick={() => {
                    setShowRepay(true);
                    setRepay((current) => ({ ...current, loanId: current.loanId || openLoans[0]?.id || "" }));
                  }}
                >
                  Repay
                </button>
              ) : null}
            </div>
            {showRepay && profile.canRepay ? (
              <form
                className="mt-4 grid grid-cols-2 gap-3 max-[540px]:grid-cols-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBusyAction("repay");
                  setFailedAction(null);
                  setError(null);
                  void repayLoanAction({
                    requestId: crypto.randomUUID(),
                    loanId: repay.loanId,
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
                    setRepay({ loanId: repay.loanId, amount: "", date: todayIso(), reference: "", note: "" });
                    setRepaymentPage(1);
                    await reload(farmer.id);
                    window.setTimeout(() => setShowRepay(false), 700);
                  });
                }}
              >
                <RiceField label="Loan">
                  <select className={inputClass} value={repay.loanId} onChange={(event) => setRepay({ ...repay, loanId: event.target.value })} required>
                    <option value="">Select a loan</option>
                    {openLoans.map((row) => <option key={row.id} value={row.id}>{row.number} · {formatAmount(row.outstanding)} outstanding</option>)}
                  </select>
                </RiceField>
                <RiceField label="Amount paid"><input className={inputClass} inputMode="decimal" value={repay.amount} onChange={(event) => setRepay({ ...repay, amount: event.target.value })} required /></RiceField>
                <RiceField label="Payment date"><input type="date" className={inputClass} value={repay.date} onChange={(event) => setRepay({ ...repay, date: event.target.value })} required /></RiceField>
                <RiceField label="Payment reference"><input className={inputClass} value={repay.reference} onChange={(event) => setRepay({ ...repay, reference: event.target.value })} required /></RiceField>
                <RiceField label="Note"><input className={inputClass} value={repay.note} onChange={(event) => setRepay({ ...repay, note: event.target.value })} placeholder="Optional" /></RiceField>
                <button className={cn(primaryButton, "mt-6 h-12 min-w-[8.75rem] justify-self-start")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "repay"} failed={failedAction === "repay"} label="Save repayment" /></button>
              </form>
            ) : null}
            {loans.length === 0 ? <p className="mt-2 text-[13.5px] text-slate-500">This farmer has no loans yet.</p> : (
              <div className={`${tableScrollClass} mt-3`}>
                <table className="min-w-full text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr>{["Loan", "Date", "Borrowed", "Repaid", "Outstanding", "Status"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loanRows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5 font-semibold"><Link href={`/rice/loans/${row.id}`}>{row.number}</Link></td>
                        <td className="px-3 py-2.5">{formatRiceDate(row.approvedOn)}</td>
                        <td className="px-3 py-2.5">{formatAmount(row.disbursed)}</td>
                        <td className="px-3 py-2.5">{formatAmount(row.principalRepaid)}</td>
                        <td className="px-3 py-2.5 font-semibold">{formatAmount(row.outstanding)}</td>
                        <td className="px-3 py-2.5">{loanStatus(row.status, row.outstanding, row.disbursed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={loanPages.page}
              total={loans.length}
              pageSize={loanPageSize}
              pageSizeEditable
              onPage={setLoanPage}
              onPageSize={(size) => { setLoanPageSize(size); setLoanPage(1); }}
            />
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Repayments</h2>
            {repayments.length === 0 ? <p className="mt-2 text-[13.5px] text-slate-500">No repayments yet.</p> : (
              <div className={`${tableScrollClass} mt-3`}>
                <table className="min-w-full text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr>{["Receipt", "Loan", "Date", "Amount", "Reference"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {repaymentRows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.receiptNumber}</td>
                        <td className="px-3 py-2.5">{loans.find((item) => item.id === row.loanId)?.number ?? "—"}</td>
                        <td className="px-3 py-2.5">{formatRiceDate(row.paidOn)}</td>
                        <td className="px-3 py-2.5">{formatAmount(row.amount)}</td>
                        <td className="px-3 py-2.5">{row.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={repaymentPages.page}
              total={repayments.length}
              pageSize={repaymentPageSize}
              pageSizeEditable
              onPage={setRepaymentPage}
              onPageSize={(size) => { setRepaymentPageSize(size); setRepaymentPage(1); }}
            />
          </section>
        </>
      )}
    </div>
  );
}
