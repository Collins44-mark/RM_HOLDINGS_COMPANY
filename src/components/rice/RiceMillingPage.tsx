"use client";

import { useMemo, useState } from "react";
import { Factory } from "lucide-react";
import { loadRiceMillingWorkspaceAction, type RiceMillingWorkspace } from "@/actions/rice/workspace";
import { recordRiceMillBatchAction } from "@/actions/rice/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { filterClass, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { ContainedDrawer } from "@/components/ui/ContainedDrawer";
import { formatTzs } from "@/lib/format/currency";
import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import type { MessageKey, Translator } from "@/lib/i18n";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import type { RiceMillBatch } from "@/lib/rice/types";
import { formatKg, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";

const SHIFTS = ["MORNING", "AFTERNOON", "NIGHT"] as const;

function shiftLabel(t: Translator, shift: string | null) {
  const code = shift?.trim().toUpperCase();
  if (code === "MORNING" || code === "AFTERNOON" || code === "NIGHT") return t(`rice.milling.shift.${code}`);
  return shift || "—";
}

function batchDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function outputTotal(row: RiceMillBatch) {
  return Math.round(row.outputs.reduce((sum, item) => sum + item.qtyKg, 0) * 100) / 100;
}

export function RiceMillingPage({
  initial,
  period,
  from = "",
  to = "",
}: {
  initial: { ok: true; workspace: RiceMillingWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [listPeriod, setListPeriod] = useState<ReportPeriod>(period);
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);
  const [viewing, setViewing] = useState<RiceMillBatch | null>(null);
  const paddy = useMemo(() => (workspace?.items ?? []).filter((row) => row.kind === "PADDY"), [workspace]);
  const outputs = useMemo(() => (workspace?.items ?? []).filter((row) => row.kind !== "PADDY"), [workspace]);
  const [form, setForm] = useState({
    producedOn: todayIso(),
    inputItemId: paddy[0]?.id ?? "",
    inputQtyKg: "",
    shift: "",
    wastageKg: "",
    processingCost: "",
    notes: "",
    outputQty: Object.fromEntries(outputs.map((row) => [row.id, ""])),
  });

  function reload(
    page: number,
    pageSize = workspace?.listPage.pageSize,
    next: { period: ReportPeriod; from: string; to: string } = { period: listPeriod, from: rangeFrom, to: rangeTo },
  ) {
    if (next.period === "custom" && (!next.from || !next.to)) return Promise.resolve();
    return loadRiceMillingWorkspaceAction({
      period: next.period,
      from: next.period === "custom" ? next.from : undefined,
      to: next.period === "custom" ? next.to : undefined,
      page,
      pageSize,
    }).then((loaded) => {
      if (loaded.ok) setWorkspace(loaded.workspace);
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const requestId = crypto.randomUUID();
    const payload = {
      requestId,
      inputItemId: form.inputItemId || paddy[0]?.id || "",
      producedOn: form.producedOn,
      shift: form.shift,
      inputQtyKg: form.inputQtyKg,
      wastageKg: form.wastageKg,
      processingCost: form.processingCost,
      notes: form.notes,
      outputs: outputs
        .map((row) => ({ itemId: row.id, qtyKg: form.outputQty[row.id] ?? "" }))
        .filter((row) => Number(row.qtyKg) > 0),
    };
    const saved = await saveWithOutbox(
      { id: requestId, type: "rice.record_mill_batch", businessUnitCode: "rice", payload },
      () => recordRiceMillBatchAction(payload),
    );
    setBusy(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    setForm((current) => ({
      ...current,
      shift: "",
      inputQtyKg: "",
      wastageKg: "",
      processingCost: "",
      notes: "",
      outputQty: Object.fromEntries(outputs.map((row) => [row.id, ""])),
    }));
    if (!saved.queued) await reload(1);
  }

  const available = paddy.find((row) => row.id === (form.inputItemId || paddy[0]?.id))?.qtyKg ?? 0;

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Factory} title={t("rice.milling.title")} subtitle={t("rice.milling.subtitle")} />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      {workspace?.caps.canMill ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.milling.post")}</h2>
          <p className="mt-1 text-[13px] text-slate-500">{t("rice.milling.available", { qty: formatKg(available, locale) })}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label={t("rice.milling.productionDate")}>
              <input type="date" className={inputClass} value={form.producedOn} onChange={(event) => setForm({ ...form, producedOn: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.milling.paddyInput")}>
              <input className={inputClass} inputMode="decimal" value={form.inputQtyKg} onChange={(event) => setForm({ ...form, inputQtyKg: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.milling.shift")}>
              <select className={inputClass} value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })}>
                <option value="">{t("rice.milling.shift.choose")}</option>
                {SHIFTS.map((shift) => (
                  <option key={shift} value={shift}>
                    {t(`rice.milling.shift.${shift}`)}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label={t("rice.milling.wastage")}>
              <input className={inputClass} inputMode="decimal" value={form.wastageKg} onChange={(event) => setForm({ ...form, wastageKg: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.milling.processingCost")}>
              <input className={inputClass} inputMode="decimal" value={form.processingCost} onChange={(event) => setForm({ ...form, processingCost: event.target.value })} />
            </RiceField>
            {outputs.map((row) => (
              <RiceField key={row.id} label={t("rice.milling.outputKg", { name: row.name })}>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={form.outputQty[row.id] ?? ""}
                  onChange={(event) => setForm({ ...form, outputQty: { ...form.outputQty, [row.id]: event.target.value } })}
                />
              </RiceField>
            ))}
            <RiceField label={t("common.notes")}>
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("rice.milling.postBatch")} busyLabel={t("common.posting")} onClick={() => void save()} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.milling.posted")}</h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            <label className="block w-full sm:w-48">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("rice.milling.filterDate")}</span>
              <select
                className={filterClass}
                value={listPeriod}
                onChange={(event) => {
                  const next = event.target.value as ReportPeriod;
                  setListPeriod(next);
                  void reload(1, workspace?.listPage.pageSize, { period: next, from: rangeFrom, to: rangeTo });
                }}
              >
                {REPORT_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === "custom" ? t("rice.milling.customRange") : t(`period.${option.value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            {listPeriod === "custom" ? (
              <>
                <label className="block w-full sm:w-40">
                  <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("period.from")}</span>
                  <input
                    type="date"
                    className={filterClass}
                    value={rangeFrom}
                    onChange={(event) => {
                      const next = event.target.value;
                      setRangeFrom(next);
                      void reload(1, workspace?.listPage.pageSize, { period: "custom", from: next, to: rangeTo });
                    }}
                  />
                </label>
                <label className="block w-full sm:w-40">
                  <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("period.to")}</span>
                  <input
                    type="date"
                    className={filterClass}
                    value={rangeTo}
                    onChange={(event) => {
                      const next = event.target.value;
                      setRangeTo(next);
                      void reload(1, workspace?.listPage.pageSize, { period: "custom", from: rangeFrom, to: next });
                    }}
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.milling.batch")}</th>
                <th className="px-3 py-2">{t("rice.milling.shift")}</th>
                <th className="px-3 py-2">{t("rice.milling.input")}</th>
                <th className="px-3 py-2">{t("rice.milling.totalOutput")}</th>
                <th className="px-3 py-2">{t("rice.milling.wastage")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(workspace?.batches ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    {t("rice.milling.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.batches ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5 font-medium">{row.number}</td>
                    <td className="px-3 py-2.5">{shiftLabel(t, row.shift)}</td>
                    <td className="px-3 py-2.5">{formatKg(row.inputQtyKg, locale)}</td>
                    <td className="px-3 py-2.5">{formatKg(outputTotal(row), locale)}</td>
                    <td className="px-3 py-2.5">{formatKg(row.wastageKg, locale)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <CompactActionsMenu
                        ariaLabel={`${t("rice.milling.view")} ${row.number}`}
                        items={[{ label: t("rice.milling.view"), onSelect: () => setViewing(row) }]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          showWhenEmpty
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => void reload(page)}
          onPageSize={(pageSize) => void reload(1, pageSize)}
        />
      </section>
      {viewing ? <BatchDrawer batch={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function BatchDrawer({ batch, onClose }: { batch: RiceMillBatch; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const total = outputTotal(batch);
  const facts = [
    [t("rice.milling.filterDate"), batchDate(batch.producedOn)],
    [t("rice.milling.shift"), shiftLabel(t, batch.shift)],
    [t("rice.milling.input"), formatKg(batch.inputQtyKg, locale)],
    [t("rice.milling.totalOutput"), formatKg(total, locale)],
    [t("rice.milling.wastage"), formatKg(batch.wastageKg, locale)],
    [t("rice.milling.cost"), formatTzs(batch.processingCost)],
  ];
  return (
    <ContainedDrawer title={batch.number} subtitle={t("rice.milling.details")} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[#f4f7fb] px-3 py-3">
            <dt className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-5 text-[14px] font-semibold text-navy">{t("rice.milling.byGrade")}</h3>
      <ul className="mt-2 divide-y divide-navy/5 rounded-2xl border border-navy/5">
        {batch.outputs.length === 0 ? (
          <li className="px-3 py-3 text-[13.5px] text-slate-500">—</li>
        ) : (
          batch.outputs.map((item) => (
            <li key={item.itemId} className="flex items-center justify-between px-3 py-2.5 text-[13.5px] text-navy">
              <span>{item.itemName}</span>
              <span className="font-semibold">{formatKg(item.qtyKg, locale)}</span>
            </li>
          ))
        )}
      </ul>
      {batch.notes ? <p className="mt-4 text-[13.5px] leading-5 text-slate-600">{batch.notes}</p> : null}
    </ContainedDrawer>
  );
}
