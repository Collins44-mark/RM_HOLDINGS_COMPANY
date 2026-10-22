"use client";

import { useMemo, useState } from "react";
import { Factory } from "lucide-react";
import { loadRiceMillingWorkspaceAction, type RiceMillingWorkspace } from "@/actions/rice/workspace";
import { recordRiceMillBatchAction } from "@/actions/rice/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { formatKg, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";

export function RiceMillingPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceMillingWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const paddy = useMemo(() => (workspace?.items ?? []).filter((row) => row.kind === "PADDY"), [workspace]);
  const outputs = useMemo(() => (workspace?.items ?? []).filter((row) => row.kind !== "PADDY"), [workspace]);
  const [form, setForm] = useState({
    producedOn: todayIso(),
    inputItemId: paddy[0]?.id ?? "",
    inputQtyKg: "",
    machine: "",
    shift: "",
    wastageKg: "",
    processingCost: "",
    notes: "",
    outputQty: Object.fromEntries(outputs.map((row) => [row.id, ""])),
  });

  async function save() {
    setBusy(true);
    setError(null);
    const requestId = crypto.randomUUID();
    const payload = {
      requestId,
      inputItemId: form.inputItemId || paddy[0]?.id || "",
      producedOn: form.producedOn,
      machine: form.machine,
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
    setForm((current) => ({ ...current, inputQtyKg: "", wastageKg: "", processingCost: "", notes: "", outputQty: Object.fromEntries(outputs.map((row) => [row.id, ""])) }));
    if (!saved.queued) {
      const next = await loadRiceMillingWorkspaceAction({ period, page: 1, pageSize: workspace?.listPage.pageSize });
      if (next.ok) setWorkspace(next.workspace);
    }
  }

  const available = paddy.find((row) => row.id === (form.inputItemId || paddy[0]?.id))?.qtyKg ?? 0;

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={Factory}
        title={t("rice.milling.title")}
        subtitle={t("rice.milling.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
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
            <RiceField label={t("rice.milling.machine")}>
              <input className={inputClass} value={form.machine} onChange={(event) => setForm({ ...form, machine: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.milling.shift")}>
              <input className={inputClass} value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} />
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
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.milling.posted")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("rice.milling.batch")}</th>
                <th className="px-3 py-2">{t("rice.milling.input")}</th>
                <th className="px-3 py-2">{t("rice.milling.outputs")}</th>
                <th className="px-3 py-2">{t("rice.milling.wastage")}</th>
                <th className="px-3 py-2">{t("rice.milling.cost")}</th>
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
                    <td className="px-3 py-2.5">{row.producedOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{formatKg(row.inputQtyKg, locale)}</td>
                    <td className="px-3 py-2.5">{row.outputs.map((item) => `${item.itemName} ${formatKg(item.qtyKg, locale)}`).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5">{formatKg(row.wastageKg, locale)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.processingCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => {
            void loadRiceMillingWorkspaceAction({ period, page, pageSize: workspace?.listPage.pageSize }).then((next) => {
              if (next.ok) setWorkspace(next.workspace);
            });
          }}
          onPageSize={(pageSize) => {
            void loadRiceMillingWorkspaceAction({ period, page: 1, pageSize }).then((next) => {
              if (next.ok) setWorkspace(next.workspace);
            });
          }}
        />
      </section>
    </div>
  );
}
