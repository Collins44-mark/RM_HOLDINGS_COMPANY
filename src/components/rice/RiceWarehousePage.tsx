"use client";

import { useState } from "react";
import { Warehouse } from "lucide-react";
import { loadRiceWarehouseWorkspaceAction, type RiceWarehouseWorkspace } from "@/actions/rice/workspace";
import { adjustRiceStockAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import { formatKg, RiceField, RiceNotice, RicePageHeader, todayIso } from "@/components/rice/rice-ui";

const KIND_LABEL: Record<string, string> = {
  PADDY: "Company paddy",
  RICE: "Finished rice",
  BROKEN: "Broken rice",
  BYPRODUCT: "By-products",
};

export function RiceWarehousePage({
  initial,
}: {
  initial: { ok: true; workspace: RiceWarehouseWorkspace } | { ok: false; error: string };
}) {
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ itemId: "", qtyKg: "", reason: "", occurredOn: todayIso() });

  async function save() {
    setBusy(true);
    setError(null);
    const result = await adjustRiceStockAction({
      requestId: crypto.randomUUID(),
      itemId: form.itemId,
      qtyKg: form.qtyKg,
      reason: form.reason,
      occurredOn: form.occurredOn,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = await loadRiceWarehouseWorkspaceAction();
    if (next.ok) setWorkspace(next.workspace);
    setForm({ itemId: form.itemId, qtyKg: "", reason: "", occurredOn: todayIso() });
  }

  const items = workspace?.items ?? [];
  const groups = ["PADDY", "RICE", "BROKEN", "BYPRODUCT"];

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Warehouse} title="Warehouse" subtitle="Company-owned inventory from posted stock movements. Customer storage is not included." />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((kind) => {
          const rows = items.filter((row) => row.kind === kind);
          const qty = rows.reduce((sum, row) => sum + row.qtyKg, 0);
          const value = rows.reduce((sum, row) => sum + row.valueTzs, 0);
          return (
            <article key={kind} className={`${glassCard} px-5 py-5`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{KIND_LABEL[kind]}</p>
              <p className="mt-2 text-[22px] font-semibold text-navy">{formatKg(qty)}</p>
              <p className="mt-1 text-[13px] text-slate-500">{formatTzs(value)}</p>
              <ul className="mt-3 space-y-1 text-[13px] text-slate-600">
                {rows.length ? rows.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2">
                    <span>{row.name}</span>
                    <span className="text-right">
                      {formatKg(row.qtyKg)}
                      <span className="block text-[12px] text-slate-400">{formatTzs(row.valueTzs)}</span>
                    </span>
                  </li>
                )) : <li>None on hand.</li>}
              </ul>
            </article>
          );
        })}
      </section>

      {workspace?.caps.canAdjust ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">Stock correction</h2>
          <p className="mt-1 text-[13px] text-slate-500">Use a positive quantity to add and a negative quantity to reduce. Stock cannot go below zero.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <RiceField label="Item">
              <select className={inputClass} value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
                <option value="">Select item</option>
                {items.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label="Quantity (kg)">
              <input className={inputClass} value={form.qtyKg} onChange={(event) => setForm({ ...form, qtyKg: event.target.value })} />
            </RiceField>
            <RiceField label="Date">
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label="Reason">
              <input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Post correction" busyLabel="Posting…" onClick={() => void save()} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Stock movements</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.movements ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    No posted stock movements yet.
                  </td>
                </tr>
              ) : (
                (workspace?.movements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.itemName}</td>
                    <td className="px-3 py-2.5">{row.sourceType.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{row.notes ?? "—"}</td>
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
