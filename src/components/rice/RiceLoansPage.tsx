"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import {
  decideLoanApplicationAction,
  giveFarmerLoanAction,
  loadFarmerHistoryAction,
  loadLoanWorkspaceAction,
  registerLoanFarmerAction,
  repayLoanAction,
  submitLoanApplicationAction,
  type LoanWorkspace,
} from "@/actions/rice/loans";
import { glassCard, glassPanel, inputClass, primaryButton, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import { filterLoans, isPracticeLoanParty, loanDashboard } from "@/lib/rice/loan-model";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { ContainedDrawer } from "@/components/ui/ContainedDrawer";
import { formatRiceDate, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SaveLabel } from "@/components/ui/SaveMark";
import { cn } from "@/lib/cn";
import { DEFAULT_PAGE_SIZE, pageMeta } from "@/lib/pagination";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "farmers", label: "Farmers" },
  { id: "applications", label: "Applications" },
  { id: "loans", label: "Loans" },
] as const;

export type LoanTab = (typeof TABS)[number]["id"];

function money(value: number) {
  return formatTzs(value);
}

function figures(value: number) {
  return formatAmount(value);
}

type LoanPeriod = "today" | "week" | "month" | "year" | "custom";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodRange(period: LoanPeriod, from: string, to: string) {
  const today = todayIso();
  const current = new Date(`${today}T00:00:00`);
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const weekday = current.getDay();
    const start = new Date(current);
    start.setDate(current.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return { from: isoDate(start), to: today };
  }
  if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from, to };
}

function applicationStatus(status: string) {
  if (status === "APPROVED") return "Approved";
  if (status === "SUBMITTED") return "Submitted";
  if (status === "REJECTED") return "Rejected";
  if (status === "CANCELLED") return "Cancelled";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function loanStatus(status: string, outstanding: number, disbursed: number) {
  if (disbursed <= 0 && status !== "CLOSED") return "Approved";
  if (outstanding <= 0) return "Fully repaid";
  if (status === "ACTIVE") return "Active";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function withoutPracticeRecords(workspace: LoanWorkspace): LoanWorkspace {
  const farmers = workspace.farmers.filter((farmer) => !isPracticeLoanParty(farmer.id));
  const loans = workspace.loans.filter((loan) => !isPracticeLoanParty(loan.partyId));
  const loanIds = new Set(loans.map((loan) => loan.id));
  return {
    ...workspace,
    farmers,
    loans,
    applications: workspace.applications.filter((row) => !isPracticeLoanParty(row.partyId)),
    recentDisbursements: workspace.recentDisbursements.filter((row) => loanIds.has(row.loanId)),
    recentRepayments: workspace.recentRepayments.filter((row) => loanIds.has(row.loanId)),
    dashboard: loanDashboard(loans),
  };
}

type History = {
  repayments: { id: string; loanId: string; receiptNumber: string; amount: number; paidOn: string; reference: string }[];
  disbursements: { id: string; loanId: string; number: string; amount: number; disbursedOn: string; reference: string }[];
};

export function RiceLoansPage({
  initial,
  tab: initialTab,
}: {
  initial: { ok: true; workspace: LoanWorkspace } | { ok: false; error: string };
  tab: LoanTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<LoanTab>(initialTab);
  const [workspace, setWorkspace] = useState(initial.ok ? withoutPracticeRecords(initial.workspace) : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [period, setPeriod] = useState<LoanPeriod>("year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loanPage, setLoanPage] = useState(1);
  const [loanPageSize, setLoanPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [appPeriod, setAppPeriod] = useState<LoanPeriod>("year");
  const [appFrom, setAppFrom] = useState("");
  const [appTo, setAppTo] = useState("");
  const [appStatus, setAppStatus] = useState("APPROVED");
  const [appPage, setAppPage] = useState(1);
  const [appPageSize, setAppPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [farmerPage, setFarmerPage] = useState(1);
  const [farmerPageSize, setFarmerPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [decidingId, setDecidingId] = useState("");
  const [drawerPartyId, setDrawerPartyId] = useState("");
  const [selectedFarmer, setSelectedFarmer] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [repayLoanId, setRepayLoanId] = useState("");
  const [farmerForm, setFarmerForm] = useState({ name: "", phone: "", location: "", farmDetails: "" });
  const [loan, setLoan] = useState({ partyId: "", amount: "", date: todayIso(), note: "" });
  const [repay, setRepay] = useState({ amount: "", date: todayIso(), reference: "", note: "" });
  const [application, setApplication] = useState({ partyId: "", amount: "", date: todayIso(), purpose: "", documentName: "" });
  const [decision, setDecision] = useState<Record<string, { amount: string; terms: string; dueOn: string; note: string }>>({});

  const farmers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (workspace?.farmers ?? []).filter((farmer) => {
      if (tab !== "farmers" || !needle) return true;
      return `${farmer.name} ${farmer.partyNumber} ${farmer.phone ?? ""}`.toLowerCase().includes(needle);
    });
  }, [query, tab, workspace?.farmers]);
  const farmerPages = pageMeta(farmerPage, farmers.length, farmerPageSize);
  const farmerRows = farmers.slice((farmerPages.page - 1) * farmerPageSize, farmerPages.page * farmerPageSize);

  const loans = useMemo(() => {
    const range = periodRange(period, customFrom, customTo);
    return filterLoans(workspace?.loans ?? [], { status, from: range.from, to: range.to });
  }, [customFrom, customTo, period, status, workspace?.loans]);
  const loanPages = pageMeta(loanPage, loans.length, loanPageSize);
  const loanRows = loans.slice((loanPages.page - 1) * loanPageSize, loanPages.page * loanPageSize);
  const applications = useMemo(() => {
    const range = periodRange(appPeriod, appFrom, appTo);
    return (workspace?.applications ?? []).filter((row) => {
      if (appStatus !== "ALL" && row.status !== appStatus) return false;
      if (range.from && row.applicationDate < range.from) return false;
      if (range.to && row.applicationDate > range.to) return false;
      return true;
    });
  }, [appFrom, appPeriod, appStatus, appTo, workspace?.applications]);
  const applicationPages = pageMeta(appPage, applications.length, appPageSize);
  const applicationRows = applications.slice((applicationPages.page - 1) * appPageSize, applicationPages.page * appPageSize);
  const deciding = applications.find((row) => row.id === decidingId) ?? workspace?.applications.find((row) => row.id === decidingId) ?? null;

  const drawerFarmer = workspace?.farmers.find((row) => row.id === drawerPartyId) ?? null;
  const drawerLoans = (workspace?.loans ?? []).filter((row) => row.partyId === drawerPartyId);
  const repayTarget = drawerLoans.find((row) => row.id === repayLoanId) ?? null;

  function openTab(next: LoanTab) {
    setTab(next);
    setError(null);
    router.replace(next === "overview" ? "/rice/loans" : `/rice/loans?tab=${next}`, { scroll: false });
  }

  async function refresh() {
    const result = await loadLoanWorkspaceAction();
    if (result.ok) setWorkspace(withoutPracticeRecords(result.workspace));
    else setError(result.error);
    router.refresh();
  }

  async function openDrawer(partyId: string, loanId = "") {
    setDecidingId("");
    setDrawerPartyId(partyId);
    setSelectedFarmer(partyId);
    setRepayLoanId(loanId);
    setRepay({ amount: "", date: todayIso(), reference: "", note: "" });
    setHistory(null);
    setHistoryError(null);
    setHistoryLoading(true);
    const result = await loadFarmerHistoryAction(partyId);
    setHistoryLoading(false);
    if (!result.ok) setHistoryError(result.error);
    else setHistory({ repayments: result.repayments, disbursements: result.disbursements });
  }

  async function run(action: string, task: () => Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string }>) {
    setBusyAction(action);
    setFailedAction(null);
    setError(null);
    const result = await task();
    if (!result.ok) {
      setFailedAction(action);
      setError(result.error);
      setBusyAction(null);
      return false;
    }
    setBusyAction(null);
    await refresh();
    if (selectedFarmer) {
      const historyResult = await loadFarmerHistoryAction(selectedFarmer);
      if (historyResult.ok) setHistory({ repayments: historyResult.repayments, disbursements: historyResult.disbursements });
    }
    return true;
  }

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={HandCoins} title="Farmer Loans" subtitle="Give a loan, record a repayment, and see what each farmer still owes." />
      <div className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Farmer loan views"
          className="inline-flex rounded-full border border-white/70 bg-white/55 p-1 shadow-[0_6px_18px_rgba(15,35,64,0.05)] backdrop-blur-xl"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-semibold transition duration-150",
                tab === item.id ? "bg-[#0b2244] text-white shadow-[0_8px_16px_rgba(11,34,68,0.18)]" : "text-slate-500 hover:text-navy",
              )}
              onClick={() => openTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {workspace ? (
          <div className="flex flex-row flex-nowrap items-center gap-2">
            {workspace.caps.canApply ? (
              <button className={cn(primaryButton, "h-9")} type="button" onClick={() => openTab("farmers")}>Register farmer</button>
            ) : null}
            {workspace.caps.canGive ? (
              <button className={cn(primaryButton, "h-9")} type="button" onClick={() => openTab("loans")}>Give loan</button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <RiceNotice>{error}</RiceNotice> : null}
      {!workspace ? (
        <section className={glassPanel}>
          <p className="text-[13.5px] text-slate-500">Farmer loans could not be loaded.</p>
          <button className={`${primaryButton} mt-4`} type="button" onClick={() => void refresh()}>Try again</button>
        </section>
      ) : null}

      {workspace && tab === "overview" ? (
        <>
          <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {[
              ["Total outstanding", money(workspace.dashboard.outstanding)],
              ["Total disbursed", money(workspace.dashboard.disbursed)],
              ["Total repaid", money(workspace.dashboard.principalRepaid)],
              ["Active borrowers", String(workspace.dashboard.activeBorrowers)],
            ].map(([label, value]) => (
              <article key={label} className={cn(glassCard, "px-3 py-3.5")}>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-navy">{value}</p>
              </article>
            ))}
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Recent loan activity</h2>
            {workspace.recentDisbursements.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-slate-500">No loans have been given yet.</p>
            ) : (
              <div className={`${tableScrollClass} mt-3`}>
                <table className="min-w-full text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr>{["Loan", "Farmer", "Date", "Reference", "Amount"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {workspace.recentDisbursements.slice(0, 5).map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5"><Link className="font-semibold" href={`/rice/loans/${row.loanId}`}>{row.number}</Link></td>
                        <td className="px-3 py-2.5">{row.farmerName}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatRiceDate(row.disbursedOn)}</td>
                        <td className="px-3 py-2.5">{row.reference || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{figures(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Recent repayments</h2>
            {workspace.recentRepayments.length === 0 ? (
              <p className="mt-3 text-[13.5px] text-slate-500">No repayments have been recorded yet.</p>
            ) : (
              <div className={`${tableScrollClass} mt-3`}>
                <table className="min-w-full text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr>{["Receipt", "Farmer", "Date", "Reference", "Amount"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {workspace.recentRepayments.slice(0, 5).map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5"><Link className="font-semibold" href={`/rice/loans/${row.loanId}`}>{row.receiptNumber}</Link></td>
                        <td className="px-3 py-2.5">{row.farmerName}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatRiceDate(row.paidOn)}</td>
                        <td className="px-3 py-2.5">{row.reference || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{figures(row.principal + row.interest + row.fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {workspace && tab === "farmers" ? (
        <>
          {workspace.caps.canApply ? (
            <section className={glassPanel}>
              <h2 className="text-[16px] font-semibold text-navy">Register farmer</h2>
              <form
                className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("register", () => registerLoanFarmerAction({
                    requestId: crypto.randomUUID(),
                    name: farmerForm.name,
                    phone: farmerForm.phone,
                    location: farmerForm.location,
                    farmDetails: farmerForm.farmDetails,
                  })).then((saved) => {
                    if (saved) setFarmerForm({ name: "", phone: "", location: "", farmDetails: "" });
                  });
                }}
              >
                <RiceField label="Name"><input className={inputClass} value={farmerForm.name} onChange={(event) => setFarmerForm({ ...farmerForm, name: event.target.value })} required /></RiceField>
                <RiceField label="Phone"><input className={inputClass} value={farmerForm.phone} onChange={(event) => setFarmerForm({ ...farmerForm, phone: event.target.value })} /></RiceField>
                <RiceField label="Location"><input className={inputClass} value={farmerForm.location} onChange={(event) => setFarmerForm({ ...farmerForm, location: event.target.value })} /></RiceField>
                <RiceField label="Farm details"><input className={inputClass} value={farmerForm.farmDetails} onChange={(event) => setFarmerForm({ ...farmerForm, farmDetails: event.target.value })} /></RiceField>
                <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "register"} failed={failedAction === "register"} label="Save farmer" /></button>
              </form>
            </section>
          ) : null}
          <section className={glassPanel}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-navy">Farmers</h2>
              <input className={`${inputClass} max-w-xs`} value={query} onChange={(event) => { setQuery(event.target.value); setFarmerPage(1); }} placeholder="Search name or number" />
            </div>
            <div className={`${tableScrollClass} mt-3`}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>{["Name", "Phone", "Borrowed", "Repaid", "Outstanding", "Action"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {farmers.length === 0 ? (
                    <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>No farmers match this search.</td></tr>
                  ) : farmerRows.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold">{row.name}</p>
                        <p className="text-[12px] text-slate-500">{row.partyNumber}</p>
                      </td>
                      <td className="px-3 py-2.5">{row.phone || "—"}</td>
                      <td className="px-3 py-2.5">{figures(row.borrowed)}</td>
                      <td className="px-3 py-2.5">{figures(row.repaid)}</td>
                      <td className="px-3 py-2.5 font-semibold">{figures(row.outstanding)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <CompactActionsMenu
                          ariaLabel={`Actions for ${row.name}`}
                          items={[{ label: "View", href: `/rice/loans/farmers/${row.id}` }]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={farmerPages.page}
              total={farmers.length}
              pageSize={farmerPageSize}
              pageSizeEditable
              onPage={setFarmerPage}
              onPageSize={(size) => { setFarmerPageSize(size); setFarmerPage(1); }}
            />
          </section>
        </>
      ) : null}

      {workspace && tab === "applications" ? (
        <>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Submit an application</h2>
            <p className="mt-1 text-[13px] text-slate-500">An application is optional. A direct loan on the Loans tab does not need approval.</p>
            {workspace.caps.canApply ? (
              <form
                className="mt-4 grid grid-cols-2 gap-3 max-[540px]:grid-cols-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("application", () => submitLoanApplicationAction({
                    requestId: crypto.randomUUID(),
                    partyId: application.partyId,
                    requestedAmount: application.amount,
                    applicationDate: application.date,
                    purpose: application.purpose,
                    documentName: application.documentName,
                  })).then((saved) => {
                    if (saved) setApplication({ partyId: "", amount: "", date: todayIso(), purpose: "", documentName: "" });
                  });
                }}
              >
                <RiceField label="Farmer">
                  <select className={inputClass} value={application.partyId} onChange={(event) => setApplication({ ...application, partyId: event.target.value })} required>
                    <option value="">Select a farmer</option>
                    {workspace.farmers.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.partyNumber}</option>)}
                  </select>
                </RiceField>
                <RiceField label="Requested amount"><input className={inputClass} inputMode="decimal" value={application.amount} onChange={(event) => setApplication({ ...application, amount: event.target.value })} required /></RiceField>
                <RiceField label="Application date"><input type="date" className={inputClass} value={application.date} onChange={(event) => setApplication({ ...application, date: event.target.value })} required /></RiceField>
                <RiceField label="Purpose"><input className={inputClass} value={application.purpose} onChange={(event) => setApplication({ ...application, purpose: event.target.value })} required /></RiceField>
                <RiceField label="Document reference"><input className={inputClass} value={application.documentName} onChange={(event) => setApplication({ ...application, documentName: event.target.value })} placeholder="Optional" /></RiceField>
                <button className={cn(primaryButton, "mt-6 h-12 min-w-[8.75rem] justify-self-start")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "application"} failed={failedAction === "application"} label="Submit application" /></button>
              </form>
            ) : null}
          </section>
          <section className={glassPanel}>
            <div className="flex flex-row flex-wrap items-center justify-between gap-3">
              <h2 className="shrink-0 text-[16px] font-semibold text-navy">Applications</h2>
              <div className="flex flex-row flex-nowrap items-center gap-2">
                <select className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={appPeriod} onChange={(event) => { setAppPeriod(event.target.value as LoanPeriod); setAppPage(1); }}>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="custom">Custom</option>
                </select>
                {appPeriod === "custom" ? (
                  <>
                    <input type="date" className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={appFrom} onChange={(event) => { setAppFrom(event.target.value); setAppPage(1); }} aria-label="From" />
                    <input type="date" className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={appTo} onChange={(event) => { setAppTo(event.target.value); setAppPage(1); }} aria-label="To" />
                  </>
                ) : null}
                <select className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={appStatus} onChange={(event) => { setAppStatus(event.target.value); setAppPage(1); }}>
                  <option value="APPROVED">Approved</option>
                  <option value="ALL">All statuses</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
            <div className={`${tableScrollClass} mt-3`}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>{["Application", "Farmer", "Amount", "Purpose", "Status", "Action"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {applications.length === 0 ? (
                    <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>No applications in this period.</td></tr>
                  ) : applicationRows.map((row) => {
                    const canDecide = row.status === "SUBMITTED" && workspace.caps.canApprove && row.submittedBy !== workspace.userId;
                    return (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5 font-semibold">{row.number}</td>
                        <td className="px-3 py-2.5">{row.farmerName}</td>
                        <td className="px-3 py-2.5">{figures(row.requestedAmount)}</td>
                        <td className="max-w-[16rem] px-3 py-2.5">{row.purpose}</td>
                        <td className="px-3 py-2.5">{applicationStatus(row.status)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <CompactActionsMenu
                            ariaLabel={`Actions for ${row.number}`}
                            items={[
                              ...(canDecide ? [{ label: "Decide", onSelect: () => { setDrawerPartyId(""); setDecidingId(row.id); } }] : []),
                              { label: "View", onSelect: () => void openDrawer(row.partyId) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={applicationPages.page}
              total={applications.length}
              pageSize={appPageSize}
              pageSizeEditable
              onPage={setAppPage}
              onPageSize={(size) => { setAppPageSize(size); setAppPage(1); }}
            />
          </section>
        </>
      ) : null}

      {workspace && tab === "loans" ? (
        <>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Give a loan</h2>
            <p className="mt-1 text-[13px] text-slate-500">The outstanding balance is the amount you enter. It appears as soon as you save.</p>
            {workspace.caps.canGive ? (
              <form
                className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("loan", () => giveFarmerLoanAction({
                    requestId: crypto.randomUUID(),
                    partyId: loan.partyId,
                    amount: loan.amount,
                    loanDate: loan.date,
                    note: loan.note,
                  })).then((saved) => {
                    if (saved) setLoan({ partyId: loan.partyId, amount: "", date: todayIso(), note: "" });
                  });
                }}
              >
                <RiceField label="Farmer">
                  <select className={inputClass} value={loan.partyId} onChange={(event) => setLoan({ ...loan, partyId: event.target.value })} required>
                    <option value="">Select a farmer</option>
                    {workspace.farmers.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.partyNumber}</option>)}
                  </select>
                </RiceField>
                <RiceField label="Loan amount"><input className={inputClass} inputMode="decimal" value={loan.amount} onChange={(event) => setLoan({ ...loan, amount: event.target.value })} required /></RiceField>
                <RiceField label="Loan date"><input type="date" className={inputClass} value={loan.date} onChange={(event) => setLoan({ ...loan, date: event.target.value })} required /></RiceField>
                <RiceField label="Reference"><input className={inputClass} value={loan.note} onChange={(event) => setLoan({ ...loan, note: event.target.value })} placeholder="Optional" /></RiceField>
                <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "loan"} failed={failedAction === "loan"} label="Save loan" /></button>
              </form>
            ) : <p className="mt-3 text-[13.5px] text-slate-500">You can view loans. Giving a loan needs loan access.</p>}
          </section>
          <section className={glassPanel}>
            <div className="flex flex-row flex-wrap items-center justify-between gap-3">
              <h2 className="shrink-0 text-[16px] font-semibold text-navy">Loans</h2>
              <div className="flex flex-row flex-nowrap items-center gap-2">
                <select className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={period} onChange={(event) => { setPeriod(event.target.value as LoanPeriod); setLoanPage(1); }}>
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="custom">Custom</option>
                </select>
                {period === "custom" ? (
                  <>
                    <input type="date" className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setLoanPage(1); }} aria-label="From" />
                    <input type="date" className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={customTo} onChange={(event) => { setCustomTo(event.target.value); setLoanPage(1); }} aria-label="To" />
                  </>
                ) : null}
                <select className={cn(inputClass, "h-10 w-[9.5rem] shrink-0")} value={status} onChange={(event) => { setStatus(event.target.value); setLoanPage(1); }}>
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CLOSED">Fully repaid</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
              </div>
            </div>
            <div className={`${tableScrollClass} mt-3`}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>{["Loan", "Farmer", "Disbursed", "Repaid", "Outstanding", "Status", "Action"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {loans.length === 0 ? (
                    <tr><td className="px-3 py-6 text-slate-500" colSpan={7}>No loans in this period.</td></tr>
                  ) : loanRows.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5 font-semibold">{row.number}</td>
                      <td className="px-3 py-2.5">{row.farmerName}</td>
                      <td className="px-3 py-2.5">{figures(row.disbursed)}</td>
                      <td className="px-3 py-2.5">{figures(row.principalRepaid)}</td>
                      <td className="px-3 py-2.5 font-semibold">{figures(row.outstanding)}</td>
                      <td className="px-3 py-2.5">{loanStatus(row.status, row.outstanding, row.disbursed)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <CompactActionsMenu
                          ariaLabel={`Actions for ${row.number}`}
                          items={[
                            ...(workspace.caps.canRepay && row.outstanding > 0
                              ? [{ label: "Repay", onSelect: () => void openDrawer(row.partyId, row.id) }]
                              : []),
                            { label: "View", onSelect: () => void openDrawer(row.partyId) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={loanPages.page}
              total={loans.length}
              pageSize={loanPageSize}
              pageSizeEditable
              onPage={setLoanPage}
              onPageSize={(size) => { setLoanPageSize(size); setLoanPage(1); }}
            />
          </section>
        </>
      ) : null}
      {deciding && workspace ? (
        <ContainedDrawer title={deciding.number} subtitle={`${deciding.farmerName} · ${money(deciding.requestedAmount)}`} onClose={() => setDecidingId("")}>
          <p className="text-[13.5px] text-slate-600">{formatRiceDate(deciding.applicationDate)} · {deciding.purpose}</p>
          {deciding.status === "SUBMITTED" && workspace.caps.canApprove && deciding.submittedBy !== workspace.userId ? (
            <form
              className="mt-4 grid grid-cols-1 gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const fields = decision[deciding.id] ?? { amount: String(deciding.requestedAmount), terms: deciding.purpose, dueOn: todayIso(), note: "" };
                const choice = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
                if (choice !== "APPROVE" && choice !== "REJECT" && choice !== "CANCEL") return;
                void run(`${choice}-${deciding.id}`, () => decideLoanApplicationAction({
                  requestId: crypto.randomUUID(),
                  applicationId: deciding.id,
                  decision: choice,
                  approvedAmount: fields.amount,
                  terms: fields.terms,
                  dueOn: fields.dueOn,
                  note: fields.note,
                })).then((saved) => {
                  if (saved) setDecidingId("");
                });
              }}
            >
              <RiceField label="Approved amount"><input className={inputClass} inputMode="decimal" value={(decision[deciding.id] ?? { amount: String(deciding.requestedAmount) }).amount} onChange={(event) => setDecision({ ...decision, [deciding.id]: { amount: event.target.value, terms: decision[deciding.id]?.terms ?? deciding.purpose, dueOn: decision[deciding.id]?.dueOn ?? todayIso(), note: decision[deciding.id]?.note ?? "" } })} /></RiceField>
              <RiceField label="Due date"><input type="date" className={inputClass} value={decision[deciding.id]?.dueOn ?? todayIso()} onChange={(event) => setDecision({ ...decision, [deciding.id]: { amount: decision[deciding.id]?.amount ?? String(deciding.requestedAmount), terms: decision[deciding.id]?.terms ?? deciding.purpose, dueOn: event.target.value, note: decision[deciding.id]?.note ?? "" } })} /></RiceField>
              <RiceField label="Terms"><input className={inputClass} value={decision[deciding.id]?.terms ?? deciding.purpose} onChange={(event) => setDecision({ ...decision, [deciding.id]: { amount: decision[deciding.id]?.amount ?? String(deciding.requestedAmount), terms: event.target.value, dueOn: decision[deciding.id]?.dueOn ?? todayIso(), note: decision[deciding.id]?.note ?? "" } })} /></RiceField>
              <RiceField label="Decision note"><input className={inputClass} value={decision[deciding.id]?.note ?? ""} onChange={(event) => setDecision({ ...decision, [deciding.id]: { amount: decision[deciding.id]?.amount ?? String(deciding.requestedAmount), terms: decision[deciding.id]?.terms ?? deciding.purpose, dueOn: decision[deciding.id]?.dueOn ?? todayIso(), note: event.target.value } })} /></RiceField>
              <div className="flex flex-wrap gap-2">
                <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} name="decision" type="submit" value="APPROVE"><SaveLabel busy={busyAction === `APPROVE-${deciding.id}`} failed={failedAction === `APPROVE-${deciding.id}`} label="Approve" /></button>
                <button className={cn(secondaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} name="decision" type="submit" value="REJECT"><SaveLabel busy={busyAction === `REJECT-${deciding.id}`} failed={failedAction === `REJECT-${deciding.id}`} label="Reject" /></button>
                <button className={cn(secondaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} name="decision" type="submit" value="CANCEL"><SaveLabel busy={busyAction === `CANCEL-${deciding.id}`} failed={failedAction === `CANCEL-${deciding.id}`} label="Cancel" /></button>
              </div>
            </form>
          ) : deciding.status === "SUBMITTED" ? (
            <p className="mt-3 text-[13.5px] text-slate-500">Another officer must decide this application.</p>
          ) : (
            <p className="mt-3 text-[13.5px] text-slate-500">{applicationStatus(deciding.status)}{deciding.decisionNote ? ` · ${deciding.decisionNote}` : ""}</p>
          )}
        </ContainedDrawer>
      ) : null}
      {drawerFarmer ? (
        <ContainedDrawer title={drawerFarmer.name} subtitle={`${drawerFarmer.partyNumber}${drawerFarmer.phone ? ` · ${drawerFarmer.phone}` : ""}`} onClose={() => { setDrawerPartyId(""); setRepayLoanId(""); }}>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Borrowed", money(drawerFarmer.borrowed)],
              ["Repaid", money(drawerFarmer.repaid)],
              ["Outstanding", money(drawerFarmer.outstanding)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[#f4f7fb] px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
                <p className="mt-1 text-[15px] font-semibold text-navy">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13.5px] text-slate-600">
            {drawerFarmer.location || "No location"}{drawerFarmer.farmDetails ? ` · ${drawerFarmer.farmDetails}` : ""}
          </p>
          {repayTarget && repayTarget.outstanding > 0 && workspace?.caps.canRepay ? (
            <form
              className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-navy/10 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const loanId = repayTarget.id;
                void run("repay", () => repayLoanAction({
                  requestId: crypto.randomUUID(),
                  loanId,
                  principal: repay.amount,
                  interest: "0",
                  fee: "0",
                  paidOn: repay.date,
                  method: "CASH",
                  reference: repay.reference,
                  note: repay.note,
                })).then((saved) => {
                  if (saved) setRepay({ amount: "", date: todayIso(), reference: "", note: "" });
                });
              }}
            >
              <p className="text-[13.5px] font-semibold text-navy">Repay {repayTarget.number}</p>
              <RiceField label="Amount paid"><input className={inputClass} inputMode="decimal" value={repay.amount} onChange={(event) => setRepay({ ...repay, amount: event.target.value })} required /></RiceField>
              <RiceField label="Payment date"><input type="date" className={inputClass} value={repay.date} onChange={(event) => setRepay({ ...repay, date: event.target.value })} required /></RiceField>
              <RiceField label="Payment reference"><input className={inputClass} value={repay.reference} onChange={(event) => setRepay({ ...repay, reference: event.target.value })} required /></RiceField>
              <RiceField label="Note"><input className={inputClass} value={repay.note} onChange={(event) => setRepay({ ...repay, note: event.target.value })} placeholder="Optional" /></RiceField>
              <button className={cn(primaryButton, "min-w-[8.75rem]")} disabled={busyAction !== null} type="submit"><SaveLabel busy={busyAction === "repay"} failed={failedAction === "repay"} label="Save repayment" /></button>
            </form>
          ) : null}
          <h3 className="mt-5 text-[15px] font-semibold text-navy">Loans</h3>
          {drawerLoans.length === 0 ? <p className="mt-2 text-[13.5px] text-slate-500">No loans yet.</p> : (
            <div className={`${tableScrollClass} mt-2`}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>{["Loan", "Disbursed", "Repaid", "Outstanding", "Status"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {drawerLoans.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5 font-semibold">{row.number}</td>
                      <td className="px-3 py-2.5">{figures(row.disbursed)}</td>
                      <td className="px-3 py-2.5">{figures(row.principalRepaid)}</td>
                      <td className="px-3 py-2.5">{figures(row.outstanding)}</td>
                      <td className="px-3 py-2.5">{loanStatus(row.status, row.outstanding, row.disbursed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="mt-5 text-[15px] font-semibold text-navy">Repayments</h3>
          {historyLoading ? <p className="mt-2 text-[13.5px] text-slate-500">Loading this farmer’s records…</p> : null}
          {historyError ? <RiceNotice>{historyError}</RiceNotice> : null}
          {history && history.repayments.length === 0 ? <p className="mt-2 text-[13.5px] text-slate-500">No repayments yet.</p> : null}
          {history && history.repayments.length > 0 ? (
            <div className={`${tableScrollClass} mt-2`}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>{["Receipt", "Loan", "Date", "Amount", "Reference"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {history.repayments.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">{row.receiptNumber}</td>
                      <td className="px-3 py-2.5">{drawerLoans.find((item) => item.id === row.loanId)?.number ?? "—"}</td>
                      <td className="px-3 py-2.5">{formatRiceDate(row.paidOn)}</td>
                      <td className="px-3 py-2.5">{figures(row.amount)}</td>
                      <td className="px-3 py-2.5">{row.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
