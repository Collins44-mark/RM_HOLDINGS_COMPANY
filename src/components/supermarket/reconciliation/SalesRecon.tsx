"use client";

import { useEffect, useMemo, useState } from "react";
import {
  approveSalesReconciliationAction,
  getSalesReconciliationWorkspaceAction,
  saveSalesReconciliationAction,
} from "@/actions/supermarket/reconciliation";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { addCents, centsToMoney, moneyToCents, variancePercent } from "@/lib/supermarket/money";
import { displayStatus, type SalesReconciliationRecord } from "@/lib/supermarket/reconciliation";
import { formatTzs } from "@/lib/format/currency";
import { MoneyField, reconGlass, ReconActions, StatusBadge, useReconPeriod } from "./shared";

export function SalesReconciliationPage() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
  const [record, setRecord] = useState<SalesReconciliationRecord | null>(null);
  const [liveExpected, setLiveExpected] = useState(record?.expected ?? null);
  const [actualCash, setActualCash] = useState("0.00");
  const [actualCard, setActualCard] = useState("0.00");
  const [actualMobile, setActualMobile] = useState("0.00");
  const [actualOther, setActualOther] = useState("0.00");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [caps, setCaps] = useState({ canCreate: false, canApprove: false, canPost: false });

  useEffect(() => {
    let active = true;
    void getSalesReconciliationWorkspaceAction({ from: period.start, to: period.end }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setLiveExpected(result.live.expected);
      setRecord(result.record);
      setActualCash(result.record?.actual.cash ?? "0.00");
      setActualCard(result.record?.actual.card ?? "0.00");
      setActualMobile(result.record?.actual.mobile ?? "0.00");
      setActualOther(result.record?.actual.other ?? "0.00");
      setReason(result.record?.varianceReason ?? "");
      setNotes(result.record?.notes ?? "");
      setCaps({
        canCreate: result.capabilities.canCreate,
        canApprove: result.capabilities.canApprove,
        canPost: false,
      });
    });
    return () => {
      active = false;
    };
  }, [period.start, period.end]);

  const expected = liveExpected;
  const actualTotal = useMemo(
    () =>
      addCents(
        moneyToCents(actualCash),
        moneyToCents(actualCard),
        moneyToCents(actualMobile),
        moneyToCents(actualOther),
      ),
    [actualCash, actualCard, actualMobile, actualOther],
  );
  const expectedTotal = moneyToCents(expected?.total);
  const variance = actualTotal - expectedTotal;
  const status = displayStatus(record?.status ?? null, moneyToCents(record?.variance ?? variance));

  async function persist(submit: boolean) {
    setSaving(true);
    const result = await saveSalesReconciliationAction({
      id: record?.id,
      from: period.start,
      to: period.end,
      actualCash,
      actualCard,
      actualMobile,
      actualOther,
      varianceReason: reason,
      notes,
      submit,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getSalesReconciliationWorkspaceAction({ from: period.start, to: period.end });
    if (refreshed.ok) {
      setRecord(refreshed.record);
      setLiveExpected(refreshed.live.expected);
    }
  }

  async function approve() {
    if (!record) return;
    setSaving(true);
    const result = await approveSalesReconciliationAction(record.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getSalesReconciliationWorkspaceAction({ from: period.start, to: period.end });
    if (refreshed.ok) setRecord(refreshed.record);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <PageBackButton href="/supermarket/reconciliation" label="Reconciliation" />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Sales Reconciliation</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Compare recorded sales collections with amounts confirmed for this period.
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

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: "Expected", value: expected?.total ?? "0.00" },
          { label: "Actual", value: centsToMoney(actualTotal) },
          { label: "Variance", value: centsToMoney(variance) },
        ].map((item) => (
          <div key={item.label} className={`${reconGlass} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-navy">
              {formatTzs(moneyToCents(item.value) / 100)}
            </p>
          </div>
        ))}
      </section>

      <section className={`grid grid-cols-1 gap-5 lg:grid-cols-2 ${reconGlass} px-5 py-6`}>
        <div className="space-y-3">
          <h2 className="text-[15px] font-semibold text-navy">Expected collections</h2>
          <p className="text-[12.5px] text-slate-500">
            From completed sales and sale payments. Expected sales {formatTzs(moneyToCents(record?.expectedSales ?? expected?.total ?? "0") / 100)}.
          </p>
          {(["cash", "card", "mobile", "other"] as const).map((key) => (
            <MoneyField key={key} label={key} value={expected?.[key] ?? "0.00"} readOnly />
          ))}
        </div>
        <div className="space-y-3">
          <h2 className="text-[15px] font-semibold text-navy">Actual collections</h2>
          <MoneyField label="Cash" value={actualCash} onChange={setActualCash} />
          <MoneyField label="Card" value={actualCard} onChange={setActualCard} />
          <MoneyField label="Mobile" value={actualMobile} onChange={setActualMobile} />
          <MoneyField label="Other" value={actualOther} onChange={setActualOther} />
        </div>
      </section>

      <section className={`${reconGlass} space-y-3 px-5 py-6`}>
        <p className="text-[13px] text-slate-500">
          Variance % {variancePercent(actualTotal, expectedTotal).toFixed(2)}
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
          canApprove={caps.canApprove}
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
