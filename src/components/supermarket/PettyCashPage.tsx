"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  getPettyCashWorkspaceAction,
  reversePettyCashTransactionAction,
  approvePettyCashReconciliationAction,
  savePettyCashExpenseAction,
  savePettyCashFundAction,
  savePettyCashReconciliationAction,
  savePettyCashReplenishmentAction,
  type PettyCashPostingStatus,
  type PettyCashTxn,
  type PettyCashTxnType,
} from "@/actions/supermarket/petty-cash";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { cn } from "@/lib/cn";
import { filterClass, inputClass, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { EmptyState } from "@/components/ui/PageHeader";
import { EXPENSE_CATEGORIES } from "@/lib/data/sample-supermarket-finance";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
import { stripTechnicalIds } from "@/lib/supermarket/payment-display";
import {
  MoneyField,
  primaryButton,
  reconGlass,
  ReconPulse,
  secondaryButton,
  StatusBadge,
  useReconPeriod,
} from "@/components/supermarket/reconciliation/shared";

type LoadPhase = "loading" | "ready" | "error";

const selectFilterClass = cn(filterClass, "appearance-none pr-10");

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative block min-w-0 overflow-hidden rounded-full">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={selectFilterClass}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute inset-y-0 right-3.5 my-auto h-4 w-4 text-slate-400"
        strokeWidth={2}
      />
    </label>
  );
}

function WorkflowAction({
  className,
  busy,
  disabled,
  idleLabel,
  successLabel,
  confirmed,
  onClick,
}: {
  className: string;
  busy: boolean;
  disabled?: boolean;
  idleLabel: string;
  successLabel: string;
  confirmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} className={cn(className, "relative min-w-[8.75rem]")}>
      <span className={cn("inline-flex items-center justify-center", busy && "invisible")}>
        {confirmed ? successLabel : idleLabel}
      </span>
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
        </span>
      ) : null}
    </button>
  );
}

export function PettyCashRouteShell({
  period,
}: {
  period?: ReturnType<typeof useReconPeriod>;
}) {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Petty Cash</h1>
        </div>
        {period ? (
          <FinancePeriodFilter
            preset={period.preset}
            label={period.period.label}
            range={period.range}
            onPreset={period.setPreset}
            onRange={period.setRange}
          />
        ) : (
          <div className="h-10 w-40 rounded-full bg-slate-200/60" />
        )}
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["Current balance", "Total spent", "Total replenished", "Variance"].map((label) => (
          <div key={label} className={`${reconGlass} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-2">
              <ReconPulse className="h-6 w-24" />
            </p>
          </div>
        ))}
      </section>
      <div className="h-10 w-44 rounded-full bg-slate-200/50" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="h-10 rounded-full bg-white/80" />
        <div className="h-10 rounded-full bg-white/80" />
        <div className="h-10 rounded-full bg-white/80" />
      </div>
      <div className={`${reconGlass} overflow-hidden`}>
        <div className="px-4 py-8 text-center text-[13.5px] text-slate-400"> </div>
      </div>
    </div>
  );
}

export function PettyCashPage() {
  const periodState = useReconPeriod();
  const { preset, setPreset, range, setRange, period } = periodState;
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [fund, setFund] = useState<{ id: string; name: string; currentBalance: string; openingBalance: string } | null>(null);
  const [summary, setSummary] = useState({ currentBalance: "0.00", totalSpent: "0.00", totalReplenished: "0.00", variance: "0.00" });
  const [rows, setRows] = useState<PettyCashTxn[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [type, setType] = useState<PettyCashTxnType | "ALL">("ALL");
  const [status, setStatus] = useState<PettyCashPostingStatus | "ALL">("ALL");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState({
    canCreate: false,
    canApprove: false,
    isOwner: false,
    userId: "",
    sodPettyCash: true,
  });
  const [accounts, setAccounts] = useState<Array<{ id: string; bankName: string; accountName: string }>>([]);
  const [recon, setRecon] = useState<{ id: string; status: string; date: string; preparedBy: string | null } | null>(null);
  const [modal, setModal] = useState<"expense" | "replenish" | "reconcile" | null>(null);
  const [tick, setTick] = useState(0);
  const [fundForm, setFundForm] = useState({ name: "Petty Cash", openingBalance: "0.00" });
  const [fundBusy, setFundBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getPettyCashWorkspaceAction({
      from: period.start,
      to: period.end,
      type,
      status,
      category: category || undefined,
      page,
    }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        return;
      }
      setError(null);
      setPhase("ready");
      setFund(result.fund);
      setSummary(result.summary);
      setRows(result.transactions);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setAccounts(result.bankAccounts);
      setRecon(result.latestReconciliation);
      setCaps({
        canCreate: result.capabilities.canCreate,
        canApprove: result.capabilities.canApprove,
        isOwner: result.capabilities.isOwner,
        userId: result.capabilities.userId,
        sodPettyCash: result.capabilities.sodPettyCash,
      });
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, type, status, category, page, tick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showEmptyFund = phase === "ready" && !fund;
  const valuesReady = Boolean(fund);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Petty Cash</h1>
        </div>
        <FinancePeriodFilter
          preset={preset}
          label={period.label}
          range={range}
          onPreset={(next) => {
            setPreset(next);
            setPage(1);
          }}
          onRange={(next) => {
            setRange(next);
            setPage(1);
          }}
        />
      </header>
      {phase === "error" && error ? (
        <p className="text-[13px] text-[#c45b66]">Couldn&apos;t load petty cash data. {error}</p>
      ) : error ? (
        <p className="text-[13px] text-[#c45b66]">{error}</p>
      ) : null}

      {showEmptyFund ? (
        <div className={`${reconGlass} space-y-4 px-5 py-6`}>
          <EmptyState
            title="No petty cash fund configured"
            description="Create the supermarket petty cash fund with a real opening balance."
          />
          {caps.canApprove ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input className={inputClass} value={fundForm.name} onChange={(e) => setFundForm((f) => ({ ...f, name: e.target.value }))} />
              <input className={inputClass} value={fundForm.openingBalance} onChange={(e) => setFundForm((f) => ({ ...f, openingBalance: e.target.value }))} />
              <WorkflowAction
                className={primaryButton}
                busy={fundBusy}
                idleLabel="Create fund"
                successLabel="Saved ✓"
                onClick={() => {
                  if (fundBusy) return;
                  setFundBusy(true);
                  void savePettyCashFundAction(fundForm).then((result) => {
                    setFundBusy(false);
                    if (!result.ok) setError(result.error);
                    else setTick((n) => n + 1);
                  });
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Current balance", summary.currentBalance],
              ["Total spent", summary.totalSpent],
              ["Total replenished", summary.totalReplenished],
              ["Variance", summary.variance],
            ].map(([label, value]) => (
              <div key={label} className={`${reconGlass} px-5 py-5`}>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
                <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-navy">
                  {valuesReady ? formatTzs(moneyToCents(value) / 100) : <ReconPulse className="h-6 w-24" />}
                </p>
              </div>
            ))}
          </section>
          <div className="flex flex-wrap gap-2">
            {caps.canCreate ? (
              <button type="button" className={primaryButton} onClick={() => setModal("expense")}>
                + Record Expense
              </button>
            ) : null}
            {caps.canCreate ? (
              <button type="button" className={secondaryButton} onClick={() => setModal("replenish")}>
                + Replenish Fund
              </button>
            ) : null}
            {caps.canCreate ? (
              <button type="button" className={secondaryButton} onClick={() => setModal("reconcile")}>
                Reconcile Cash
              </button>
            ) : null}
            {recon &&
            canApprovePreparedWork({
              canApprove: caps.canApprove && recon.status === "SUBMITTED",
              isOwner: caps.isOwner,
              sodEnabled: caps.sodPettyCash,
              preparerId: recon.preparedBy,
              userId: caps.userId,
            }) ? (
              <button
                type="button"
                className={secondaryButton}
                onClick={async () => {
                  const result = await approvePettyCashReconciliationAction(recon.id);
                  if (!result.ok) setError(result.error);
                  else setTick((n) => n + 1);
                }}
              >
                Approve count
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FilterSelect
              label="All types"
              value={type}
              onChange={(value) => {
                setType(value as PettyCashTxnType | "ALL");
                setPage(1);
              }}
            >
              <option value="ALL">All types</option>
              <option value="EXPENSE">Expense</option>
              <option value="REPLENISHMENT">Replenishment</option>
              <option value="REVERSAL">Reversal</option>
            </FilterSelect>
            <FilterSelect
              label="All statuses"
              value={status}
              onChange={(value) => {
                setStatus(value as PettyCashPostingStatus | "ALL");
                setPage(1);
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </FilterSelect>
            <FilterSelect
              label="All categories"
              value={category}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </FilterSelect>
          </div>
          <div className={`${reconGlass} overflow-hidden`}>
            <div className={tableScrollClass}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment source</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created by</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-black/[0.04]">
                      <td className="px-4 py-2.5">{row.txnDate}</td>
                      <td className="px-4 py-2.5">{row.txnType === "EXPENSE" ? "Expense" : row.txnType === "REPLENISHMENT" ? "Replenishment" : "Reversal"}</td>
                      <td className="px-4 py-2.5">{stripTechnicalIds(row.description) || "—"}</td>
                      <td className="px-4 py-2.5">{row.category || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(row.amount) / 100)}</td>
                      <td className="px-4 py-2.5">{row.txnType === "EXPENSE" ? "Petty cash" : row.source === "BANK" ? "Bank" : row.source === "MAIN_CASH" ? "Main cash" : "—"}</td>
                      <td className="px-4 py-2.5">{stripTechnicalIds(row.reference) || "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={row.postingStatus === "DRAFT" ? "Draft" : row.postingStatus === "REVERSED" ? "Reversed" : "Posted"}
                          tone={row.postingStatus === "POSTED" ? "ok" : row.postingStatus === "REVERSED" ? "variance" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-2.5">{row.createdByName}</td>
                      <td className="px-4 py-2.5">
                        {row.postingStatus === "DRAFT" &&
                        canApprovePreparedWork({
                          canApprove: caps.canApprove && (row.txnType === "EXPENSE" || row.txnType === "REPLENISHMENT"),
                          isOwner: caps.isOwner,
                          sodEnabled: caps.sodPettyCash,
                          preparerId: row.createdBy,
                          userId: caps.userId,
                        }) ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-navy"
                            onClick={async () => {
                              const result =
                                row.txnType === "EXPENSE"
                                  ? await savePettyCashExpenseAction({
                                      draftId: row.id,
                                      fundId: row.fundId,
                                      amount: row.amount,
                                      date: row.txnDate,
                                      category: row.category,
                                      description: row.description,
                                      reference: row.reference,
                                      notes: "",
                                      post: true,
                                    })
                                  : await savePettyCashReplenishmentAction({
                                      draftId: row.id,
                                      fundId: row.fundId,
                                      amount: row.amount,
                                      date: row.txnDate,
                                      source: row.source === "BANK" ? "BANK" : "MAIN_CASH",
                                      bankAccountId: row.bankAccountId,
                                      reference: row.reference,
                                      description: row.description,
                                      notes: "",
                                      post: true,
                                    });
                              if (!result.ok) setError(result.error);
                              else setTick((n) => n + 1);
                            }}
                          >
                            Post
                          </button>
                        ) : null}
                        {row.postingStatus === "POSTED" && caps.canApprove ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-slate-500"
                            onClick={async () => {
                              if (!window.confirm("Reverse this posted petty cash transaction? The original remains on file.")) return;
                              const result = await reversePettyCashTransactionAction(row.id);
                              if (!result.ok) setError(result.error);
                              else setTick((n) => n + 1);
                            }}
                          >
                            Reverse
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {phase === "ready" && rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13.5px] text-slate-500">No petty cash transactions for this period.</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-slate-500">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {modal && fund ? (
        <PettyCashModal
          kind={modal}
          fundId={fund.id}
          currentBalance={summary.currentBalance}
          canApprove={caps.canApprove}
          isOwner={caps.isOwner}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setTick((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function PettyCashModal({
  kind,
  fundId,
  currentBalance,
  canApprove,
  isOwner,
  accounts,
  onClose,
  onSaved,
}: {
  kind: "expense" | "replenish" | "reconcile";
  fundId: string;
  currentBalance: string;
  canApprove: boolean;
  isOwner: boolean;
  accounts: Array<{ id: string; bankName: string; accountName: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number]>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"MAIN_CASH" | "BANK">("MAIN_CASH");
  const [bankAccountId, setBankAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [recon, setRecon] = useState<{ system: string; variance: string } | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const after = moneyToCents(currentBalance) + (kind === "expense" ? -moneyToCents(amount) : moneyToCents(amount));

  async function persist(post: boolean) {
    if (lock.current) return;
    if (kind !== "reconcile" && moneyToCents(amount) <= 0) {
      setError("Amount must be positive.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    if (kind === "expense") {
      const result = await savePettyCashExpenseAction({
        fundId, amount, date, category, description, reference, notes, post,
      });
      if (!result.ok) {
        lock.current = false;
        setSaving(false);
        setError(result.error);
        return;
      }
      setSaving(false);
      setConfirmed(true);
      onSaved();
      return;
    }
    if (kind === "replenish") {
      const result = await savePettyCashReplenishmentAction({
        fundId, amount, date, source, bankAccountId: source === "BANK" ? bankAccountId : null, reference, description, notes, post,
      });
      if (!result.ok) {
        lock.current = false;
        setSaving(false);
        setError(result.error);
        return;
      }
      setSaving(false);
      setConfirmed(true);
      onSaved();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          {kind === "expense" ? (step === "review" ? "Review petty cash expense" : "Record petty cash expense") : kind === "replenish" ? (step === "review" ? "Review replenishment" : "Replenish fund") : "Reconcile petty cash"}
        </h2>
        {kind === "expense" && step === "form" ? (
          <div className="mt-4 space-y-3">
            <p className="text-[12.5px] text-slate-500">Payment method: Petty cash. This creates one Finance expense.</p>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Expense category</span>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as (typeof EXPENSE_CATEGORIES)[number])}>
                {EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <MoneyField label="Amount" value={amount} onChange={setAmount} large />
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference / receipt no.</span><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </div>
        ) : null}
        {kind === "replenish" && step === "form" ? (
          <div className="mt-4 space-y-3">
            <p className="text-[12.5px] text-slate-500">Replenishment is a transfer, not an expense.</p>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <MoneyField label="Amount" value={amount} onChange={setAmount} large />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Source</span>
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as "MAIN_CASH" | "BANK")}>
                <option value="MAIN_CASH">Main cash</option>
                <option value="BANK">Bank</option>
              </select>
            </label>
            {source === "BANK" ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bank account</span>
                <select className={inputClass} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.bankName} · {account.accountName}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          </div>
        ) : null}
        {kind !== "reconcile" && step === "review" ? (
          <dl className="mt-4 space-y-2 text-[13.5px]">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Amount</dt><dd className="font-medium text-navy">{formatTzs(moneyToCents(amount) / 100)}</dd></div>
            {kind === "expense" ? <div className="flex justify-between gap-3"><dt className="text-slate-500">Category</dt><dd className="font-medium text-navy">{category}</dd></div> : null}
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Current petty cash</dt><dd className="font-medium text-navy">{formatTzs(moneyToCents(currentBalance) / 100)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Balance after</dt><dd className="font-medium text-navy">{formatTzs(after / 100)}</dd></div>
          </dl>
        ) : null}
        {kind === "reconcile" ? (
          <div className="mt-4 space-y-3">
            <p className="text-[12.5px] text-slate-500">System petty cash {formatTzs(moneyToCents(currentBalance) / 100)}</p>
            <MoneyField label="Physical cash count" value={amount} onChange={setAmount} large />
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-slate-500">Variance reason</span><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            {recon ? <p className="text-[13px] text-slate-500">Variance {formatTzs(moneyToCents(recon.variance) / 100)}</p> : null}
          </div>
        ) : null}
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          {kind === "reconcile" ? (
            <>
              <WorkflowAction
                className={secondaryButton}
                busy={saving}
                idleLabel="Save draft"
                successLabel="Saved ✓"
                confirmed={Boolean(recon) && !saving}
                onClick={() => {
                  if (lock.current) return;
                  lock.current = true;
                  setSaving(true);
                  void savePettyCashReconciliationAction({
                    fundId, date, actualCounted: amount, varianceReason: notes, notes: "",
                  }).then((result) => {
                    lock.current = false;
                    setSaving(false);
                    if (!result.ok) setError(result.error);
                    else setRecon({ system: result.system, variance: result.variance });
                  });
                }}
              />
              {canApprove ? (
                <WorkflowAction
                  className={primaryButton}
                  busy={saving}
                  idleLabel="Submit count"
                  successLabel="Reconciled ✓"
                  confirmed={confirmed}
                  onClick={() => {
                    if (lock.current) return;
                    lock.current = true;
                    setSaving(true);
                    void savePettyCashReconciliationAction({
                      fundId, date, actualCounted: amount, varianceReason: notes, notes: "", submit: true,
                    }).then((result) => {
                      if (!result.ok) {
                        lock.current = false;
                        setSaving(false);
                        setError(result.error);
                        return;
                      }
                      setSaving(false);
                      setConfirmed(true);
                      onSaved();
                    });
                  }}
                />
              ) : null}
            </>
          ) : step === "form" ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                if (moneyToCents(amount) <= 0) { setError("Amount must be positive."); return; }
                setError("");
                setStep("review");
              }}
            >
              Review
            </button>
          ) : (
            <>
              <WorkflowAction
                className={secondaryButton}
                busy={saving}
                idleLabel="Save draft"
                successLabel="Saved ✓"
                confirmed={confirmed}
                onClick={() => void persist(false)}
              />
              {canApprove && isOwner ? (
                <WorkflowAction
                  className={primaryButton}
                  busy={saving}
                  idleLabel={kind === "expense" ? "Post expense" : "Post replenishment"}
                  successLabel="Posted ✓"
                  confirmed={confirmed}
                  onClick={() => void persist(true)}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
