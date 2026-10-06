"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  getBankMovementsWorkspaceAction,
  reverseBankMovementAction,
  saveBankMovementAction,
  type BankMovementRecord,
  type BankMovementType,
  type BankPostingStatus,
} from "@/actions/supermarket/banking";
import { saveBankAccountAction as saveAccountFromRecon } from "@/actions/supermarket/reconciliation";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { filterClass, inputClass, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { EmptyState } from "@/components/ui/PageHeader";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import type { BankAccountRecord, BankMatchStatus } from "@/lib/supermarket/reconciliation";
import { cn } from "@/lib/cn";
import {
  MoneyField,
  primaryButton,
  reconGlass,
  secondaryButton,
  StatusBadge,
  useReconPeriod,
} from "./shared";

const DEPOSIT_SOURCES = ["Cash Deposit", "Sales Collection Deposit", "Other Cash Deposit"] as const;

export function BankingTabs({ active }: { active: "movements" | "reconcile" }) {
  return (
    <div className="inline-flex rounded-full border border-white/70 bg-white/70 p-1 shadow-[0_4px_12px_rgba(15,35,64,0.05)]">
      <Link
        href="/supermarket/finance/banking"
        className={cn(
          "rounded-full px-4 py-1.5 text-[13px] font-semibold",
          active === "movements" ? "bg-[#0b2244] text-white" : "text-slate-500",
        )}
      >
        Deposits & Withdrawals
      </Link>
      <Link
        href="/supermarket/finance/bank-reconciliation"
        className={cn(
          "rounded-full px-4 py-1.5 text-[13px] font-semibold",
          active === "reconcile" ? "bg-[#0b2244] text-white" : "text-slate-500",
        )}
      >
        Reconciliation
      </Link>
    </div>
  );
}

export function BankMovementsPage() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [movements, setMovements] = useState<BankMovementRecord[]>([]);
  const [summary, setSummary] = useState({ deposits: "0.00", withdrawals: "0.00", net: "0.00", unmatched: 0 });
  const [accountId, setAccountId] = useState("");
  const [movementType, setMovementType] = useState<BankMovementType | "ALL">("ALL");
  const [postingStatus, setPostingStatus] = useState<BankPostingStatus | "ALL">("ALL");
  const [matchStatus, setMatchStatus] = useState<BankMatchStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false });
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [accountForm, setAccountForm] = useState({ bankName: "", accountName: "", accountReference: "", openingBalance: "0.00" });

  useEffect(() => {
    let active = true;
    void getBankMovementsWorkspaceAction({
      from: period.start,
      to: period.end,
      accountId: accountId || null,
      movementType,
      postingStatus,
      matchStatus,
      page,
    }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setMovements([]);
        return;
      }
      setError(null);
      setAccounts(result.accounts);
      setMovements(result.movements);
      setSummary(result.summary);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setCaps({ canCreate: result.capabilities.canCreate, canApprove: result.capabilities.canApprove });
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, accountId, movementType, postingStatus, matchStatus, page, reloadTick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const activeAccounts = accounts.filter((account) => account.isActive);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Banking</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Manage bank deposits and withdrawals and reconcile bank movements.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={setPreset}
            onRange={setRange}
          />
          {caps.canCreate ? (
            <button type="button" className={primaryButton} onClick={() => setModalOpen(true)}>
              + New Transaction
            </button>
          ) : null}
        </div>
      </header>
      <BankingTabs active="movements" />
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Deposits", summary.deposits],
          ["Withdrawals", summary.withdrawals],
          ["Net bank movement", summary.net],
          ["Unreconciled", String(summary.unmatched)],
        ].map(([label, value]) => (
          <div key={label} className={`${reconGlass} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-navy">
              {label === "Unreconciled" ? value : formatTzs(moneyToCents(value) / 100)}
            </p>
          </div>
        ))}
      </section>

      {activeAccounts.length === 0 ? (
        <div className={`${reconGlass} space-y-4 px-5 py-6`}>
          <EmptyState
            title="No bank accounts configured"
            description="Add a real supermarket bank account before recording deposits or withdrawals. No sample accounts are created."
          />
          {caps.canCreate ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <input className={inputClass} placeholder="Bank name" value={accountForm.bankName} onChange={(e) => setAccountForm((f) => ({ ...f, bankName: e.target.value }))} />
              <input className={inputClass} placeholder="Account name" value={accountForm.accountName} onChange={(e) => setAccountForm((f) => ({ ...f, accountName: e.target.value }))} />
              <input className={inputClass} placeholder="Reference" value={accountForm.accountReference} onChange={(e) => setAccountForm((f) => ({ ...f, accountReference: e.target.value }))} />
              <input className={inputClass} placeholder="Opening balance" value={accountForm.openingBalance} onChange={(e) => setAccountForm((f) => ({ ...f, openingBalance: e.target.value }))} />
              <button
                type="button"
                className={secondaryButton}
                onClick={async () => {
                  const result = await saveAccountFromRecon(accountForm);
                  if (!result.ok) setError(result.error);
                  else setReloadTick((tick) => tick + 1);
                }}
              >
                Save account
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select className={filterClass} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} · {account.accountName}
                </option>
              ))}
            </select>
            <select className={filterClass} value={movementType} onChange={(e) => { setMovementType(e.target.value as BankMovementType | "ALL"); setPage(1); }}>
              <option value="ALL">All types</option>
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAWAL">Withdrawal</option>
            </select>
            <select className={filterClass} value={postingStatus} onChange={(e) => { setPostingStatus(e.target.value as BankPostingStatus | "ALL"); setPage(1); }}>
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <select className={filterClass} value={matchStatus} onChange={(e) => { setMatchStatus(e.target.value as BankMatchStatus | "ALL"); setPage(1); }}>
              <option value="ALL">All matching</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="MATCHED">Matched</option>
              <option value="MANUALLY_MATCHED">Manually matched</option>
            </select>
          </div>
          <div className={`${reconGlass} overflow-hidden`}>
            <div className={tableScrollClass}>
              <table className="min-w-full text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Bank account</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reconciliation</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((row) => (
                    <tr key={row.id} className="border-t border-black/[0.04]">
                      <td className="px-4 py-2.5">{row.transactionDate}</td>
                      <td className="px-4 py-2.5">{row.movementType === "DEPOSIT" ? "Deposit" : "Withdrawal"}</td>
                      <td className="px-4 py-2.5">{row.bankName} · {row.accountName}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(row.amount) / 100)}</td>
                      <td className="px-4 py-2.5">{row.reference || "—"}</td>
                      <td className="px-4 py-2.5">{row.description || "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={row.postingStatus === "DRAFT" ? "Draft" : row.postingStatus === "REVERSED" ? "Reversed" : "Posted"}
                          tone={row.postingStatus === "POSTED" ? "ok" : row.postingStatus === "REVERSED" ? "variance" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {row.postingStatus === "DRAFT"
                          ? "Not applicable"
                          : row.matchStatus === "UNMATCHED"
                            ? "Unmatched"
                            : "Matched"}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.postingStatus === "DRAFT" && caps.canApprove ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-navy"
                            onClick={async () => {
                              const result = await saveBankMovementAction({
                                draftId: row.id,
                                accountId: row.bankAccountId,
                                movementType: row.movementType,
                                amount: row.amount,
                                date: row.transactionDate,
                                reference: row.reference,
                                description: row.description,
                                notes: row.notes,
                                post: true,
                              });
                              if (!result.ok) setError(result.error);
                              else setReloadTick((tick) => tick + 1);
                            }}
                          >
                            Post
                          </button>
                        ) : null}
                        {row.postingStatus === "POSTED" && !row.reversedFromId && caps.canApprove ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-slate-500"
                            onClick={async () => {
                              if (!window.confirm("Reverse this posted transaction? The original remains on file.")) return;
                              const result = await reverseBankMovementAction(row.id);
                              if (!result.ok) setError(result.error);
                              else setReloadTick((tick) => tick + 1);
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
            {movements.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No deposits or withdrawals for this period"
                  description="Record a real deposit or withdrawal. Empty history is not filled with sample rows."
                />
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

      {modalOpen ? (
        <MovementModal
          accounts={activeAccounts}
          canApprove={caps.canApprove}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setReloadTick((tick) => tick + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function MovementModal({
  accounts,
  canApprove,
  onClose,
  onSaved,
}: {
  accounts: BankAccountRecord[];
  canApprove: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");
  const [type, setType] = useState<BankMovementType>("DEPOSIT");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [source, setSource] = useState<string>(DEPOSIT_SOURCES[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Portal target is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const account = accounts.find((item) => item.id === accountId);
  const notesValue = type === "DEPOSIT" ? source : notes;

  async function persist(post: boolean) {
    const cents = moneyToCents(amount);
    if (cents <= 0) {
      setError("Amount must be positive.");
      return;
    }
    if (!accountId) {
      setError("Select a bank account.");
      return;
    }
    setSaving(true);
    const result = await saveBankMovementAction({
      accountId,
      movementType: type,
      amount,
      date,
      reference,
      description,
      notes: notesValue,
      post,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          {step === "form" ? "New transaction" : "Review transaction"}
        </h2>
        {step === "form" ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Transaction type</span>
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as BankMovementType)}>
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAWAL">Withdrawal</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bank account</span>
              <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.bankName} · {item.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <MoneyField label="Amount" value={amount} onChange={setAmount} large />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference / slip number</span>
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            {type === "DEPOSIT" ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Source</span>
                <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
                  {DEPOSIT_SOURCES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Purpose / notes</span>
                <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        ) : (
          <dl className="mt-4 space-y-2 text-[13.5px]">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Bank account</dt><dd className="font-medium text-navy">{account ? `${account.bankName} · ${account.accountName}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Type</dt><dd className="font-medium text-navy">{type === "DEPOSIT" ? "Deposit" : "Withdrawal"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Amount</dt><dd className="font-medium text-navy">{formatTzs(moneyToCents(amount) / 100)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Date</dt><dd className="font-medium text-navy">{date}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Reference</dt><dd className="font-medium text-navy">{reference || "—"}</dd></div>
          </dl>
        )}
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          {step === "form" ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                if (moneyToCents(amount) <= 0) {
                  setError("Amount must be positive.");
                  return;
                }
                setError("");
                setStep("review");
              }}
            >
              Review
            </button>
          ) : (
            <>
              <button type="button" className={secondaryButton} disabled={saving} onClick={() => void persist(false)}>
                {saving ? "Saving…" : "Save draft"}
              </button>
              {canApprove ? (
                <button type="button" className={primaryButton} disabled={saving} onClick={() => void persist(true)}>
                  Post transaction
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
