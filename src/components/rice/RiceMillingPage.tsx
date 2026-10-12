"use client";

import { useMemo, useState } from "react";
import { Factory } from "lucide-react";
import { loadRiceMillingWorkspaceAction, type RiceMillingWorkspace } from "@/actions/rice/workspace";
import { recordRiceMillBatchAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { formatKg, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";

export function RiceMillingPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceMillingWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
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
    const result = await recordRiceMillBatchAction({
      requestId: crypto.randomUUID(),
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
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = await loadRiceMillingWorkspaceAction({ period });
    if (next.ok) setWorkspace(next.workspace);
    setForm((current) => ({ ...current, inputQtyKg: "", wastageKg: "", processingCost: "", notes: "", outputQty: Object.fromEntries(outputs.map((row) => [row.id, ""])) }));
  }

  const available = paddy.find((row) => row.id === (form.inputItemId || paddy[0]?.id))?.qtyKg ?? 0;

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={Factory}
        title="Milling & Production"
        subtitle="Enter actual output quantities. Conversion ratios are not assumed."
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      {workspace?.caps.canMill ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">Post milling batch</h2>
          <p className="mt-1 text-[13px] text-slate-500">Company paddy available: {formatKg(available)}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label="Production date">
              <input type="date" className={inputClass} value={form.producedOn} onChange={(event) => setForm({ ...form, producedOn: event.target.value })} />
            </RiceField>
            <RiceField label="Paddy input (kg)">
              <input className={inputClass} inputMode="decimal" value={form.inputQtyKg} onChange={(event) => setForm({ ...form, inputQtyKg: event.target.value })} />
            </RiceField>
            <RiceField label="Machine">
              <input className={inputClass} value={form.machine} onChange={(event) => setForm({ ...form, machine: event.target.value })} />
            </RiceField>
            <RiceField label="Shift">
              <input className={inputClass} value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} />
            </RiceField>
            <RiceField label="Wastage (kg)">
              <input className={inputClass} inputMode="decimal" value={form.wastageKg} onChange={(event) => setForm({ ...form, wastageKg: event.target.value })} />
            </RiceField>
            <RiceField label="Processing cost">
              <input className={inputClass} inputMode="decimal" value={form.processingCost} onChange={(event) => setForm({ ...form, processingCost: event.target.value })} />
            </RiceField>
            {outputs.map((row) => (
              <RiceField key={row.id} label={`${row.name} output (kg)`}>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={form.outputQty[row.id] ?? ""}
                  onChange={(event) => setForm({ ...form, outputQty: { ...form.outputQty, [row.id]: event.target.value } })}
                />
              </RiceField>
            ))}
            <RiceField label="Notes">
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Post batch" busyLabel="Posting…" onClick={() => void save()} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Posted batches</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Input</th>
                <th className="px-3 py-2">Outputs</th>
                <th className="px-3 py-2">Wastage</th>
                <th className="px-3 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.batches ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    No milling batches in this period.
                  </td>
                </tr>
              ) : (
                (workspace?.batches ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.producedOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{formatKg(row.inputQtyKg)}</td>
                    <td className="px-3 py-2.5">{row.outputs.map((item) => `${item.itemName} ${formatKg(item.qtyKg)}`).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5">{formatKg(row.wastageKg)}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.processingCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
