"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addBankStatementLineAction,
  approveBankReconciliationAction,
  getBankWorkspaceAction,
  loadSystemBankPaymentsAction,
  matchBankTransactionsAction,
  saveBankAccountAction,
  saveBankReconciliationAction,
  unmatchBankTransactionAction,
} from "@/actions/supermarket/reconciliation";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { filterClass, inputClass, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { EmptyState } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import type { BankAccountRecord, BankReconciliationRecord, BankTransactionRecord } from "@/lib/supermarket/reconciliation";
import { displayStatus } from "@/lib/supermarket/reconciliation";
import { MoneyField, reconGlass, ReconActions, ReconPulse, ReconTableSkeletonRows, secondaryButton, StatusBadge, useReconPeriod } from "./shared";
import { BankMovementsPage, BankingTabs } from "./BankMovements";
import { formatImportedCount, StatementImportButton } from "./StatementImportModal";

export function BankingPage() {
  return <BankMovementsPage />;
}

export function BankReconciliationPage() {
  return <BankWorkspace mode="reconcile" />;
}

function BankWorkspace({ mode }: { mode: "accounts" | "reconcile" }) {
  const { preset, setPreset, range, setRange, period, asOf } = useReconPeriod();
  const [accounts, setAccounts] = useState<BankAccountRecord[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BankTransactionRecord[]>([]);
  const [record, setRecord] = useState<BankReconciliationRecord | null>(null);
  const [opening, setOpening] = useState("0.00");
  const [closing, setClosing] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${accountId ?? ""}:${period.start}:${period.end}`;
  const pending = loadedKey !== requestKey;
  const ready = loadedKey !== null;
  const accountsReady = accounts !== null;
  const noAccounts = accountsReady && accounts.length === 0;
  const [accountForm, setAccountForm] = useState({ bankName: "", accountName: "", accountReference: "", openingBalance: "0.00" });
  const [line, setLine] = useState({ transactionDate: asOf, reference: "", description: "", debit: "0.00", credit: "0.00" });

  async function reload(nextAccount = accountId) {
    const result = await getBankWorkspaceAction({ accountId: nextAccount, from: period.start, to: period.end });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setAccounts(result.accounts);
    setAccountId(result.accountId);
    setTransactions(result.transactions);
    setRecord(result.record);
    setOpening(result.record?.statementOpeningBalance ?? result.accounts.find((a) => a.id === result.accountId)?.openingBalance ?? "0.00");
    setClosing(result.record?.statementClosingBalance ?? "0.00");
    setNotes(result.record?.notes ?? "");
    setCaps({ canCreate: result.capabilities.canCreate, canApprove: result.capabilities.canApprove });
    setLoadedKey(`${result.accountId ?? ""}:${period.start}:${period.end}`);
  }

  useEffect(() => {
    let active = true;
    void getBankWorkspaceAction({ accountId, from: period.start, to: period.end }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLoadedKey(`${accountId ?? ""}:${period.start}:${period.end}`);
        return;
      }
      setError(null);
      setAccounts(result.accounts);
      setAccountId(result.accountId);
      setTransactions(result.transactions);
      setRecord(result.record);
      setOpening(
        result.record?.statementOpeningBalance ??
          result.accounts.find((a) => a.id === result.accountId)?.openingBalance ??
          "0.00",
      );
      setClosing(result.record?.statementClosingBalance ?? "0.00");
      setNotes(result.record?.notes ?? "");
      setCaps({ canCreate: result.capabilities.canCreate, canApprove: result.capabilities.canApprove });
      setLoadedKey(`${result.accountId ?? ""}:${period.start}:${period.end}`);
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end, accountId]);

  const unmatched = transactions.filter((row) => row.status === "UNMATCHED").length;
  const status = displayStatus(record?.status ?? null, moneyToCents(record?.difference));
  const selectedTxns = useMemo(
    () => transactions.filter((row) => selected.includes(row.id)),
    [transactions, selected],
  );

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-2)));
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <PageBackButton href="/supermarket/reconciliation" label="Reconciliation" />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">
            Banking
          </h1>
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
          <StatusBadge label={status.label} tone={unmatched > 0 ? "variance" : status.tone} />
        </div>
      </header>
      <BankingTabs active="reconcile" />
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {importNote ? <p className="text-[12.5px] font-medium text-[#3f8a5a]">Imported ✓ {importNote}</p> : null}

      <section className={`${reconGlass} px-4 py-4 sm:px-5`}>
        {!accountsReady ? (
          <div className="h-10 max-w-md animate-pulse rounded-full bg-slate-200/70" />
        ) : noAccounts ? (
          <EmptyState
            title="No bank accounts configured"
            description="Add a real supermarket bank account before reconciling statement lines. No sample accounts are created."
          />
        ) : (
          <select
            className={cn(filterClass, "max-w-full sm:max-w-md")}
            value={accountId ?? ""}
            onChange={(e) => void reload(e.target.value || null)}
          >
            <option value="">Select account</option>
            {(accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} · {account.accountName}
              </option>
            ))}
          </select>
        )}
        {accountsReady && caps.canCreate ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input className={cn(inputClass, "h-10")} placeholder="Bank name" value={accountForm.bankName} onChange={(e) => setAccountForm((f) => ({ ...f, bankName: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Account name" value={accountForm.accountName} onChange={(e) => setAccountForm((f) => ({ ...f, accountName: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Reference" value={accountForm.accountReference} onChange={(e) => setAccountForm((f) => ({ ...f, accountReference: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Opening balance" value={accountForm.openingBalance} onChange={(e) => setAccountForm((f) => ({ ...f, openingBalance: e.target.value }))} />
            <button
              type="button"
              className={cn(secondaryButton, "h-10")}
              onClick={async () => {
                const result = await saveBankAccountAction(accountForm);
                if (!result.ok) setError(result.error);
                else void reload(result.id);
              }}
            >
              Save account
            </button>
          </div>
        ) : null}
      </section>

      {!accountsReady ? (
        <section className={`${reconGlass} space-y-3 px-4 py-4 sm:px-5`} aria-hidden>
          <div className="h-5 w-36 animate-pulse rounded-md bg-slate-200/80" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-[14px] bg-slate-200/70" />
            ))}
          </div>
        </section>
      ) : accountId && caps.canCreate ? (
        <section className={`${reconGlass} space-y-3 px-4 py-4 sm:px-5`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Statement line</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={async () => {
                  const result = await addBankStatementLineAction({ accountId, ...line });
                  if (!result.ok) setError(result.error);
                  else void reload(accountId);
                }}
              >
                Add line
              </button>
              <StatementImportButton
                accountId={accountId}
                onImported={(count) => {
                  setImportNote(formatImportedCount(count));
                  void reload(accountId);
                }}
              />
              <button
                type="button"
                className={secondaryButton}
                onClick={async () => {
                  const result = await loadSystemBankPaymentsAction({ accountId, from: period.start, to: period.end });
                  if (!result.ok) setError(result.error);
                  else void reload(accountId);
                }}
              >
                Load system bank payments
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input type="date" className={cn(inputClass, "h-10")} value={line.transactionDate} onChange={(e) => setLine((f) => ({ ...f, transactionDate: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Reference" value={line.reference} onChange={(e) => setLine((f) => ({ ...f, reference: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Description" value={line.description} onChange={(e) => setLine((f) => ({ ...f, description: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Debit" value={line.debit} onChange={(e) => setLine((f) => ({ ...f, debit: e.target.value }))} />
            <input className={cn(inputClass, "h-10")} placeholder="Credit" value={line.credit} onChange={(e) => setLine((f) => ({ ...f, credit: e.target.value }))} />
          </div>
        </section>
      ) : null}

      {mode === "reconcile" && !noAccounts ? (
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {!accountsReady || pending ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={`${reconGlass} flex min-h-[92px] flex-col justify-center px-4 py-3.5`}>
                <ReconPulse className="h-3 w-24" />
                <ReconPulse className="mt-3 h-6 w-32" />
              </div>
            ))
          ) : (
            <>
          <div className={`${reconGlass} flex min-h-[92px] flex-col justify-center px-4 py-3.5`}>
            <MoneyField label="Statement Opening" value={opening} onChange={setOpening} compact />
          </div>
          <div className={`${reconGlass} flex min-h-[92px] flex-col justify-center px-4 py-3.5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">System Closing</p>
            <p className="mt-1.5 text-[18px] font-semibold tracking-[-0.03em] text-navy">
              {formatTzs(moneyToCents(record?.systemClosingBalance ?? "0") / 100)}
            </p>
          </div>
          <div className={`${reconGlass} flex min-h-[92px] flex-col justify-center px-4 py-3.5`}>
            <MoneyField label="Statement Closing" value={closing} onChange={setClosing} compact />
          </div>
          <div className={`${reconGlass} flex min-h-[92px] flex-col justify-center px-4 py-3.5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Difference</p>
            <p className="mt-1.5 text-[18px] font-semibold tracking-[-0.03em] text-navy">
              {formatTzs(moneyToCents(record?.difference ?? "0") / 100)}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">{unmatched} unmatched</p>
          </div>
            </>
          )}
        </section>
      ) : null}

      <section className={`${reconGlass} overflow-hidden`}>
        <div className={tableScrollClass}>
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Reference</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-right">Debit</th>
                <th className="px-4 py-2.5 text-right">Credit</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending && !ready ? <ReconTableSkeletonRows rows={5} cols={8} /> : null}
              {ready
                ? transactions.map((txn) => (
                <tr key={txn.id} className="border-t border-black/[0.04]">
                  <td className="whitespace-nowrap px-4 py-3 text-[13px] text-navy">{txn.transactionDate}</td>
                  <td className="px-4 py-3 text-[13px] text-navy">{txn.reference || "—"}</td>
                  <td className="max-w-[18rem] px-4 py-3 text-[13px] text-slate-600">{txn.description || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[13px] text-navy">{formatTzs(moneyToCents(txn.debit) / 100)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[13px] text-navy">{formatTzs(moneyToCents(txn.credit) / 100)}</td>
                  <td className="px-4 py-3 text-[12.5px] text-slate-500">{txn.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={
                        txn.status === "UNMATCHED"
                          ? "Unmatched"
                          : txn.status === "MANUALLY_MATCHED"
                            ? "Manually matched"
                            : txn.status === "EXCLUDED"
                              ? "Excluded"
                              : "Matched"
                      }
                      tone={txn.status === "UNMATCHED" ? "variance" : txn.status === "EXCLUDED" ? "neutral" : "ok"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {txn.status === "UNMATCHED" ? (
                      <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => toggle(txn.id)}>
                        {selected.includes(txn.id) ? "Selected" : "Select"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[12.5px] font-semibold text-navy"
                        onClick={async () => {
                          const result = await unmatchBankTransactionAction(txn.id);
                          if (!result.ok) setError(result.error);
                          else void reload(accountId);
                        }}
                      >
                        Unmatch
                      </button>
                    )}
                  </td>
                </tr>
              ))
                : null}
            </tbody>
          </table>
        </div>
        {ready && accountsReady && !noAccounts && transactions.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No bank transactions imported"
              description="Enter statement lines, import a PDF/CSV/Excel statement, or load system bank payments. Nothing is invented."
            />
          </div>
        ) : null}
      </section>

      {mode === "reconcile" && accountsReady && !noAccounts ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={selectedTxns.length !== 2}
            onClick={async () => {
              const result = await matchBankTransactionsAction({
                reconciliationId: record?.id,
                leftId: selectedTxns[0].id,
                rightId: selectedTxns[1].id,
              });
              if (!result.ok) setError(result.error);
              else {
                setSelected([]);
                void reload(accountId);
              }
            }}
          >
            Match
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={selectedTxns.length !== 2}
            onClick={async () => {
              const result = await matchBankTransactionsAction({
                reconciliationId: record?.id,
                leftId: selectedTxns[0].id,
                rightId: selectedTxns[1].id,
                manual: true,
              });
              if (!result.ok) setError(result.error);
              else {
                setSelected([]);
                void reload(accountId);
              }
            }}
          >
            Manual match
          </button>
          <ReconActions
            canCreate={caps.canCreate}
            canApprove={caps.canApprove}
            status={record?.status ?? null}
            saving={saving}
            onSave={() => {
              if (!accountId) return;
              setSaving(true);
              void saveBankReconciliationAction({
                id: record?.id,
                accountId,
                from: period.start,
                to: period.end,
                statementOpening: opening,
                statementClosing: closing,
                notes,
              }).then(async (result) => {
                setSaving(false);
                if (!result.ok) setError(result.error);
                else void reload(accountId);
              });
            }}
            onSubmit={() => {
              if (!accountId) return;
              setSaving(true);
              void saveBankReconciliationAction({
                id: record?.id,
                accountId,
                from: period.start,
                to: period.end,
                statementOpening: opening,
                statementClosing: closing,
                notes,
                submit: true,
              }).then(async (result) => {
                setSaving(false);
                if (!result.ok) setError(result.error);
                else void reload(accountId);
              });
            }}
            onApprove={() => {
              if (!record) return;
              setSaving(true);
              void approveBankReconciliationAction(record.id).then(async (result) => {
                setSaving(false);
                if (!result.ok) setError(result.error);
                else void reload(accountId);
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
