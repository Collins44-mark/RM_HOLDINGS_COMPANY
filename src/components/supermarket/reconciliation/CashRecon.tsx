"use client";

import { useEffect, useState } from "react";
import {
  approveCashReconciliationAction,
  getCashReconciliationWorkspaceAction,
  saveCashReconciliationAction,
} from "@/actions/supermarket/reconciliation";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { moneyToCents } from "@/lib/supermarket/money";
import { displayStatus, type CashReconciliationRecord } from "@/lib/supermarket/reconciliation";
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
import { formatTzs } from "@/lib/format/currency";
import { MoneyField, reconGlass, ReconActions, StatusBadge, useReconPeriod } from "./shared";

export function CashReconciliationPage() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
  const [record, setRecord] = useState<CashReconciliationRecord | null>(null);
  const [live, setLive] = useState({
    openingBalance: "0.00",
    cashIn: "0.00",
    cashOut: "0.00",
    expectedClosing: "0.00",
    pettyCash: "0.00",
    totalCash: "0.00",
  });
  const [actual, setActual] = useState("0.00");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState({
    canCreate: false,
    canApprove: false,
    isOwner: false,
    userId: "",
    sodReconciliation: true,
  });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const periodKey = `${period.start}:${period.end}`;
  const pending = loadedKey !== periodKey;
  const ready = loadedKey !== null;

  useEffect(() => {
    let active = true;
    void getCashReconciliationWorkspaceAction({ from: period.start, to: period.end }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLoadedKey(`${period.start}:${period.end}`);
        return;
      }
      setError(null);
      setLive(result.live);
      setRecord(result.record);
      setActual(result.record?.actualCounted ?? "0.00");
      setReason(result.record?.varianceReason ?? "");
      setNotes(result.record?.notes ?? "");
      setCaps({
        canCreate: result.capabilities.canCreate,
        canApprove: result.capabilities.canApprove,
        isOwner: result.capabilities.isOwner,
        userId: result.capabilities.userId,
        sodReconciliation: result.capabilities.sodReconciliation,
      });
      setLoadedKey(`${period.start}:${period.end}`);
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end]);

  const variance = moneyToCents(actual) - moneyToCents(live.expectedClosing);
  const status = displayStatus(record?.status ?? null, moneyToCents(record?.variance ?? variance));

  async function persist(submit: boolean) {
    setSaving(true);
    const result = await saveCashReconciliationAction({
      id: record?.id,
      from: period.start,
      to: period.end,
      actualCounted: actual,
      varianceReason: reason,
      notes,
      submit,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getCashReconciliationWorkspaceAction({ from: period.start, to: period.end });
    if (refreshed.ok) {
      setRecord(refreshed.record);
      setLive(refreshed.live);
    }
  }

  async function approve() {
    if (!record) return;
    setSaving(true);
    const result = await approveCashReconciliationAction(record.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getCashReconciliationWorkspaceAction({ from: period.start, to: period.end });
    if (refreshed.ok) setRecord(refreshed.record);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <PageBackButton href="/supermarket/reconciliation" label="Reconciliation" />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Cash Reconciliation</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Opening cash plus cash in, less cash out, compared with the physical count.
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
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Opening main cash", live.openingBalance],
          ["Main cash in", live.cashIn],
          ["Main cash out", live.cashOut],
          ["Expected main cash", live.expectedClosing],
          ["Expected petty cash", live.pettyCash],
          ["Expected total cash", live.totalCash],
        ].map(([label, value]) => (
          <div key={label} className={`${reconGlass} min-h-[104px] px-5 py-5 ${pending && ready ? "opacity-80" : ""}`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-navy">
              {formatTzs(moneyToCents(value) / 100)}
            </p>
          </div>
        ))}
      </section>
      <section className={`${reconGlass} space-y-4 px-5 py-6`}>
        <MoneyField label="Actual main cash count" value={actual} onChange={setActual} large />
        <p className="text-[13px] text-slate-500">
          Main cash variance {formatTzs(variance / 100)}. Petty cash is counted separately on Petty Cash.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Variance reason
          </span>
          <input className="h-12 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 text-[14px] text-navy outline-none" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Notes
          </span>
          <textarea className="min-h-24 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 py-3 text-[14px] text-navy outline-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <ReconActions
          canCreate={caps.canCreate}
          canApprove={canApprovePreparedWork({
            canApprove: caps.canApprove,
            isOwner: caps.isOwner,
            sodEnabled: caps.sodReconciliation,
            preparerId: record?.preparedBy,
            userId: caps.userId,
          })}
          status={record?.status ?? null}
          saving={saving}
          onSave={() => void persist(false)}
          onSubmit={() => void persist(true)}
          onApprove={() => void approve()}
        />
      </section>
    </div>
  );
}
