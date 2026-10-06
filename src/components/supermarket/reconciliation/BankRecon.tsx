"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addBankStatementLineAction,
  approveBankReconciliationAction,
  getBankWorkspaceAction,
  importBankStatementCsvAction,
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
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";
import type { BankAccountRecord, BankReconciliationRecord, BankTransactionRecord } from "@/lib/supermarket/reconciliation";
import { displayStatus } from "@/lib/supermarket/reconciliation";
import { MoneyField, primaryButton, reconGlass, ReconActions, secondaryButton, StatusBadge, useReconPeriod } from "./shared";
import { BankMovementsPage, BankingTabs } from "./BankMovements";

export function BankingPage() {
  return <BankMovementsPage />;
}

export function BankReconciliationPage() {
  return <BankWorkspace mode="reconcile" />;
}

function BankWorkspace({ mode }: { mode: "accounts" | "reconcile" }) {
  const { preset, setPreset, range, setRange, period, asOf } = useReconPeriod();
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BankTransactionRecord[]>([]);
  const [record, setRecord] = useState<BankReconciliationRecord | null>(null);
  const [opening, setOpening] = useState("0.00");
  const [closing, setClosing] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false });
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
  }

  useEffect(() => {
    let active = true;
    void getBankWorkspaceAction({ accountId, from: period.start, to: period.end }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
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

      <section className={`${reconGlass} space-y-3 px-5 py-5`}>
        <div className="flex flex-wrap gap-2">
          <select className={filterClass} value={accountId ?? ""} onChange={(e) => void reload(e.target.value || null)}>
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} · {account.accountName}
              </option>
            ))}
          </select>
        </div>
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

      {accountId && caps.canCreate ? (
        <section className={`${reconGlass} space-y-3 px-5 py-5`}>
          <h2 className="text-[15px] font-semibold text-navy">Statement line</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <input type="date" className={inputClass} value={line.transactionDate} onChange={(e) => setLine((f) => ({ ...f, transactionDate: e.target.value }))} />
            <input className={inputClass} placeholder="Reference" value={line.reference} onChange={(e) => setLine((f) => ({ ...f, reference: e.target.value }))} />
            <input className={inputClass} placeholder="Description" value={line.description} onChange={(e) => setLine((f) => ({ ...f, description: e.target.value }))} />
            <input className={inputClass} placeholder="Debit" value={line.debit} onChange={(e) => setLine((f) => ({ ...f, debit: e.target.value }))} />
            <input className={inputClass} placeholder="Credit" value={line.credit} onChange={(e) => setLine((f) => ({ ...f, credit: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-2">
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
            <label className={secondaryButton}>
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const csv = await file.text();
                  const result = await importBankStatementCsvAction({ accountId, csv });
                  if (!result.ok) setError(result.error);
                  else void reload(accountId);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className={primaryButton}
              onClick={async () => {
                const result = await loadSystemBankPaymentsAction({ accountId, from: period.start, to: period.end });
                if (!result.ok) setError(result.error);
                else void reload(accountId);
              }}
            >
              Load system bank payments
            </button>
          </div>
        </section>
      ) : null}

      {mode === "reconcile" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MoneyField label="Statement opening" value={opening} onChange={setOpening} />
          <div className={`${reconGlass} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">System closing</p>
            <p className="mt-2 text-[20px] font-semibold text-navy">
              {formatTzs(moneyToCents(record?.systemClosingBalance ?? "0") / 100)}
            </p>
          </div>
          <MoneyField label="Statement closing" value={closing} onChange={setClosing} />
          <div className={`${reconGlass} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Difference</p>
            <p className="mt-2 text-[20px] font-semibold text-navy">
              {formatTzs(moneyToCents(record?.difference ?? "0") / 100)}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">{unmatched} unmatched</p>
          </div>
        </section>
      ) : null}

      <section className={`${reconGlass} overflow-hidden`}>
        <div className={tableScrollClass}>
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Debit</th>
                <th className="px-4 py-3">Credit</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} className="border-t border-black/[0.04]">
                  <td className="px-4 py-2.5">{txn.transactionDate}</td>
                  <td className="px-4 py-2.5">{txn.reference || "—"}</td>
                  <td className="px-4 py-2.5">{txn.description || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(txn.debit) / 100)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatTzs(moneyToCents(txn.credit) / 100)}</td>
                  <td className="px-4 py-2.5">{txn.source}</td>
                  <td className="px-4 py-2.5">{txn.status}</td>
                  <td className="px-4 py-2.5">
                    {txn.status === "UNMATCHED" ? (
                      <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={() => toggle(txn.id)}>
                        {selected.includes(txn.id) ? "Selected" : "Select"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[12.5px] font-semibold text-slate-500"
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
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No bank transactions imported"
              description="Enter statement lines or import a CSV. System bank payments load from recorded BANK method payments — nothing is invented."
            />
          </div>
        ) : null}
      </section>

      {mode === "reconcile" ? (
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
