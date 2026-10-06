"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { filterClass, inputClass, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { EmptyState } from "@/components/ui/PageHeader";
import { EXPENSE_CATEGORIES } from "@/lib/data/sample-supermarket-finance";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import {
  MoneyField,
  primaryButton,
  reconGlass,
  secondaryButton,
  StatusBadge,
  useReconPeriod,
} from "@/components/supermarket/reconciliation/shared";

export function PettyCashPage() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
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
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false, isOwner: false, userId: "" });
  const [accounts, setAccounts] = useState<Array<{ id: string; bankName: string; accountName: string }>>([]);
  const [recon, setRecon] = useState<{ id: string; status: string; date: string; preparedBy: string | null } | null>(null);
  const [modal, setModal] = useState<"expense" | "replenish" | "reconcile" | null>(null);
  const [tick, setTick] = useState(0);
  const [fundForm, setFundForm] = useState({ name: "Petty Cash", openingBalance: "0.00" });

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
        setRows([]);
        return;
      }
      setError(null);
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
      });
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, type, status, category, page, tick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Petty Cash</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Manage petty cash expenses, replenishments and cash balance.
          </p>
        </div>
        <FinancePeriodFilter
          preset={preset}
          label={period.label}
          range={range}
          onPreset={setPreset}
          onRange={setRange}
        />
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      {!fund ? (
        <div className={`${reconGlass} space-y-4 px-5 py-6`}>
          <EmptyState
            title="No petty cash fund configured"
            description="Create the supermarket petty cash fund with a real opening balance. No sample fund is created automatically."
          />
          {caps.canApprove ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input className={inputClass} value={fundForm.name} onChange={(e) => setFundForm((f) => ({ ...f, name: e.target.value }))} />
              <input className={inputClass} value={fundForm.openingBalance} onChange={(e) => setFundForm((f) => ({ ...f, openingBalance: e.target.value }))} />
              <button
                type="button"
                className={primaryButton}
                onClick={async () => {
                  const result = await savePettyCashFundAction(fundForm);
                  if (!result.ok) setError(result.error);
                  else setTick((n) => n + 1);
                }}
              >
                Create fund
              </button>
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
                  {formatTzs(moneyToCents(value) / 100)}
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
            {caps.canApprove && recon?.status === "SUBMITTED" && (caps.isOwner || recon.preparedBy !== caps.userId) ? (
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
          <div className="flex flex-wrap gap-2">
            <select className={filterClass} value={type} onChange={(e) => { setType(e.target.value as PettyCashTxnType | "ALL"); setPage(1); }}>
              <option value="ALL">All types</option>
              <option value="EXPENSE">Expense</option>
              <option value="REPLENISHMENT">Replenishment</option>
              <option value="REVERSAL">Reversal</option>
            </select>
            <select className={filterClass} value={status} onChange={(e) => { setStatus(e.target.value as PettyCashPostingStatus | "ALL"); setPage(1); }}>
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <select className={filterClass} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
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
                      <td className="px-4 py-2.5">{row.description || "—"}</td>
                      <td className="px-4 py-2.5">{row.category || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(row.amount) / 100)}</td>
                      <td className="px-4 py-2.5">{row.txnType === "EXPENSE" ? "Petty cash" : row.source === "BANK" ? "Bank" : row.source === "MAIN_CASH" ? "Main cash" : "—"}</td>
                      <td className="px-4 py-2.5">{row.reference || "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={row.postingStatus === "DRAFT" ? "Draft" : row.postingStatus === "REVERSED" ? "Reversed" : "Posted"}
                          tone={row.postingStatus === "POSTED" ? "ok" : row.postingStatus === "REVERSED" ? "variance" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-2.5">{row.createdByName}</td>
                      <td className="px-4 py-2.5">
                        {row.postingStatus === "DRAFT" &&
                        caps.canApprove &&
                        (caps.isOwner || row.createdBy !== caps.userId) &&
                        (row.txnType === "EXPENSE" || row.txnType === "REPLENISHMENT") ? (
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
            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No petty cash transactions for this period" description="Record a real expense or replenishment. Empty history is not replaced with sample rows." />
              </div>
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
  const [recon, setRecon] = useState<{ system: string; variance: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const after = moneyToCents(currentBalance) + (kind === "expense" ? -moneyToCents(amount) : moneyToCents(amount));

  async function persist(post: boolean) {
    if (kind !== "reconcile" && moneyToCents(amount) <= 0) {
      setError("Amount must be positive.");
      return;
    }
    setSaving(true);
    if (kind === "expense") {
      const result = await savePettyCashExpenseAction({
        fundId, amount, date, category, description, reference, notes, post,
      });
      setSaving(false);
      if (!result.ok) { setError(result.error); return; }
      onSaved();
      return;
    }
    if (kind === "replenish") {
      const result = await savePettyCashReplenishmentAction({
        fundId, amount, date, source, bankAccountId: source === "BANK" ? bankAccountId : null, reference, description, notes, post,
      });
      setSaving(false);
      if (!result.ok) { setError(result.error); return; }
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
              <button
                type="button"
                className={secondaryButton}
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const result = await savePettyCashReconciliationAction({
                    fundId, date, actualCounted: amount, varianceReason: notes, notes: "",
                  });
                  setSaving(false);
                  if (!result.ok) setError(result.error);
                  else setRecon({ system: result.system, variance: result.variance });
                }}
              >
                Save draft
              </button>
              {canApprove ? (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    const result = await savePettyCashReconciliationAction({
                      fundId, date, actualCounted: amount, varianceReason: notes, notes: "", submit: true,
                    });
                    setSaving(false);
                    if (!result.ok) setError(result.error);
                    else onSaved();
                  }}
                >
                  Submit count
                </button>
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
              <button type="button" className={secondaryButton} disabled={saving} onClick={() => void persist(false)}>{saving ? "Saving…" : "Save draft"}</button>
              {canApprove && isOwner ? (
                <button type="button" className={primaryButton} disabled={saving} onClick={() => void persist(true)}>
                  {kind === "expense" ? "Post expense" : "Post replenishment"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
