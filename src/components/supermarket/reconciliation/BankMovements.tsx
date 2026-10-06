"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
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

export function BankingTabs({
  active,
  onChange,
}: {
  active: "movements" | "reconcile";
  onChange?: (next: "movements" | "reconcile") => void;
}) {
  const itemClass = (isActive: boolean) =>
    cn(
      "rounded-full px-4 py-1.5 text-[13px] font-semibold",
      isActive ? "bg-[#0b2244] text-white" : "text-slate-500",
    );
  return (
    <div className="inline-flex rounded-full border border-white/70 bg-white/70 p-1 shadow-[0_4px_12px_rgba(15,35,64,0.05)]">
      {onChange ? (
        <>
          <button type="button" className={itemClass(active === "movements")} onClick={() => onChange("movements")}>
            Deposits & Withdrawals
          </button>
          <button type="button" className={itemClass(active === "reconcile")} onClick={() => onChange("reconcile")}>
            Reconciliation
          </button>
        </>
      ) : (
        <>
          <Link href="/supermarket/finance/banking" className={itemClass(active === "movements")}>
            Deposits & Withdrawals
          </Link>
          <Link href="/supermarket/finance/bank-reconciliation" className={itemClass(active === "reconcile")}>
            Reconciliation
          </Link>
        </>
      )}
    </div>
  );
}

export function BankMovementsPage({
  omitChrome = false,
  periodStart,
  periodEnd,
  periodChrome,
  onTabChange,
  initial,
}: {
  omitChrome?: boolean;
  periodStart?: string;
  periodEnd?: string;
  periodChrome?: ReactNode;
  onTabChange?: (next: "movements" | "reconcile") => void;
  initial?: Awaited<ReturnType<typeof getBankMovementsWorkspaceAction>>;
}) {
  const localPeriod = useReconPeriod();
  const preset = localPeriod.preset;
  const setPreset = localPeriod.setPreset;
  const range = localPeriod.range;
  const setRange = localPeriod.setRange;
  const period = {
    start: periodStart ?? localPeriod.period.start,
    end: periodEnd ?? localPeriod.period.end,
    label: localPeriod.period.label,
  };
  const seeded = initial && initial.ok ? initial : null;
  const skipFirstFetch = useRef(Boolean(seeded));
  const [accounts, setAccounts] = useState<BankAccountRecord[] | null>(seeded?.accounts ?? null);
  const [movements, setMovements] = useState<BankMovementRecord[]>(seeded?.movements ?? []);
  const [summary, setSummary] = useState(seeded?.summary ?? { deposits: "0.00", withdrawals: "0.00", net: "0.00", unmatched: 0 });
  const [accountId, setAccountId] = useState("");
  const [movementType, setMovementType] = useState<BankMovementType | "ALL">("ALL");
  const [postingStatus, setPostingStatus] = useState<BankPostingStatus | "ALL">("ALL");
  const [matchStatus, setMatchStatus] = useState<BankMatchStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(seeded?.total ?? 0);
  const [pageSize, setPageSize] = useState(seeded?.pageSize ?? 50);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState({
    canCreate: seeded?.capabilities.canCreate ?? false,
    canApprove: seeded?.capabilities.canApprove ?? false,
    isOwner: seeded?.capabilities.isOwner ?? false,
    userId: seeded?.capabilities.userId ?? "",
    sodBanking: seeded?.capabilities.sodBanking ?? true,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [accountForm, setAccountForm] = useState({ bankName: "", accountName: "", accountReference: "", openingBalance: "0.00" });
  const [reverseRow, setReverseRow] = useState<BankMovementRecord | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reverseOk, setReverseOk] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
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
        return;
      }
      setError(null);
      setAccounts(result.accounts);
      setMovements(result.movements);
      setSummary(result.summary);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setCaps({
        canCreate: result.capabilities.canCreate,
        canApprove: result.capabilities.canApprove,
        isOwner: result.capabilities.isOwner,
        userId: result.capabilities.userId,
        sodBanking: result.capabilities.sodBanking,
      });
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, accountId, movementType, postingStatus, matchStatus, page, reloadTick]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const accountsReady = accounts !== null;
  const activeAccounts = (accounts ?? []).filter((account) => account.isActive);
  const noAccounts = accountsReady && activeAccounts.length === 0;

  return (
    <div className={omitChrome ? "min-w-0 max-w-full space-y-5" : "min-w-0 max-w-full space-y-5 pb-10"}>
      {omitChrome ? null : (
        <>
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Banking</h1>
              <p className="mt-1.5 text-[13.5px] text-slate-500">
                Manage bank deposits and withdrawals and reconcile bank movements.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {periodChrome ?? (
                <FinancePeriodFilter
                  preset={preset}
                  label={period.label}
                  range={range}
                  onPreset={setPreset}
                  onRange={setRange}
                />
              )}
              {accountsReady && caps.canCreate ? (
                <button type="button" className={primaryButton} onClick={() => setModalOpen(true)}>
                  + New Transaction
                </button>
              ) : null}
            </div>
          </header>
          <BankingTabs active="movements" onChange={onTabChange} />
        </>
      )}
      {omitChrome && accountsReady && caps.canCreate ? (
        <div className="flex justify-end">
          <button type="button" className={primaryButton} onClick={() => setModalOpen(true)}>
            + New Transaction
          </button>
        </div>
      ) : null}
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {reverseOk ? <p className="text-[12.5px] font-medium text-[#3f8a5a]">Reversed ✓</p> : null}

      {accountsReady ? (
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
      ) : null}

      {!accountsReady ? null : noAccounts ? (
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
          <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 xl:grid-cols-4">
            <select className={filterClass} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
              <option value="">All accounts</option>
              {accounts?.map((account) => (
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
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Bank account</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Reconciliation</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((row) => (
                    <tr key={row.id} className="border-t border-black/[0.04]">
                      <td className="px-4 py-3 text-[13px] text-navy">{row.transactionDate}</td>
                      <td className="px-4 py-3 text-[13px] text-navy">{row.movementType === "DEPOSIT" ? "Deposit" : "Withdrawal"}</td>
                      <td className="px-4 py-3 text-[13px] text-navy">{row.bankName} · {row.accountName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[13px] text-navy">{formatTzs(moneyToCents(row.amount) / 100)}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{row.reference || "—"}</td>
                      <td className="max-w-[16rem] px-4 py-3 text-[13px] text-slate-600">{row.description || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={row.postingStatus === "DRAFT" ? "Draft" : row.postingStatus === "REVERSED" ? "Reversed" : "Posted"}
                          tone={row.postingStatus === "POSTED" ? "ok" : row.postingStatus === "REVERSED" ? "variance" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-500">
                        {row.postingStatus === "DRAFT"
                          ? "Not applicable"
                          : row.matchStatus === "UNMATCHED"
                            ? "Unmatched"
                            : "Matched"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.postingStatus === "DRAFT" &&
                        canApprovePreparedWork({
                          canApprove: caps.canApprove,
                          isOwner: caps.isOwner,
                          sodEnabled: caps.sodBanking,
                          preparerId: row.createdBy,
                          userId: caps.userId,
                        }) ? (
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
                        {row.postingStatus === "POSTED" &&
                        !row.reversedFromId &&
                        canApprovePreparedWork({
                          canApprove: caps.canApprove,
                          isOwner: caps.isOwner,
                          sodEnabled: caps.sodBanking,
                          preparerId: row.createdBy,
                          userId: caps.userId,
                        }) ? (
                          <button
                            type="button"
                            className="text-[12.5px] font-semibold text-navy"
                            onClick={() => {
                              setReverseOk(false);
                              setReverseError(null);
                              setReverseRow(row);
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
      {reverseRow ? (
        <ReverseConfirmModal
          row={reverseRow}
          reversing={reversing}
          error={reverseError}
          onCancel={() => {
            if (reversing) return;
            setReverseRow(null);
            setReverseError(null);
          }}
          onConfirm={async () => {
            if (reversing) return;
            setReversing(true);
            setReverseError(null);
            const result = await reverseBankMovementAction(reverseRow.id);
            setReversing(false);
            if (!result.ok) {
              setReverseError(result.error);
              return;
            }
            setReverseRow(null);
            setReverseOk(true);
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

function ReverseConfirmModal({
  row,
  reversing,
  error,
  onCancel,
  onConfirm,
}: {
  row: BankMovementRecord;
  reversing: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portal target is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !reversing) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, reversing]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/25 px-4 backdrop-blur-[3px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cancel" disabled={reversing} onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reverse-txn-title"
        className="relative z-[91] w-full max-w-[420px] rounded-[24px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl sm:p-6"
      >
        <h2 id="reverse-txn-title" className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          Reverse transaction?
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
          This will reverse the posted transaction by creating the appropriate opposite movement. The original
          transaction will remain on record for audit history.
        </p>
        <dl className="mt-4 space-y-2 rounded-[16px] border border-white/80 bg-white/70 px-4 py-3.5 text-[13.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Type</dt>
            <dd className="font-medium text-navy">{row.movementType === "DEPOSIT" ? "Deposit" : "Withdrawal"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-medium tabular-nums text-navy">{formatTzs(moneyToCents(row.amount) / 100)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Bank Account</dt>
            <dd className="text-right font-medium text-navy">{row.bankName} · {row.accountName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Reference</dt>
            <dd className="font-medium text-navy">{row.reference || "—"}</dd>
          </div>
        </dl>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={cn(secondaryButton, "w-full sm:w-auto")} disabled={reversing} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={cn(primaryButton, "w-full sm:w-auto")} disabled={reversing} onClick={onConfirm}>
            {reversing ? "Reversing…" : "Reverse Transaction"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
