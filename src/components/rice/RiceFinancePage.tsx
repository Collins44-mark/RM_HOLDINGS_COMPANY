"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { loadRiceFinanceWorkspaceAction, type RiceFinanceWorkspace } from "@/actions/rice/workspace";
import { recordRiceExpenseAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { RiceField, RiceNotice, RicePageHeader, RICE_METHODS, todayIso } from "@/components/rice/rice-ui";

export function RiceFinancePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceFinanceWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kind: "OPERATING",
    occurredOn: todayIso(),
    amount: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });
  const summary = workspace?.summary;

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={Landmark}
        title="Finance"
        subtitle="Rice Mill & Warehouse only. Unsold inventory is not treated as an expense."
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Sales" value={formatTzs(summary?.salesTotal ?? 0)} />
        <Stat label="Service income" value={formatTzs(summary?.serviceIncome ?? 0)} />
        <Stat label="Cost of goods sold" value={formatTzs(summary?.cogs ?? 0)} />
        <Stat label="Production loss" value={formatTzs(summary?.productionLoss ?? 0)} />
        <Stat label="Operating expenses" value={formatTzs(summary?.expenses ?? 0)} />
        <Stat label="Inventory value" value={formatTzs(summary?.inventoryValue ?? 0)} />
        <Stat label="Payables" value={formatTzs(summary?.payables ?? 0)} />
        <Stat label="Receivables" value={formatTzs(summary?.receivables ?? 0)} />
        <Stat label="Net profit" value={formatTzs(summary?.netProfit ?? 0)} />
      </section>

      {workspace?.caps.canExpense ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">Record operating expense</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label="Type">
              <select className={inputClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="OPERATING">Operating</option>
                <option value="UTILITIES">Utilities</option>
                <option value="LABOUR">Labour</option>
                <option value="MILLING">Milling</option>
                <option value="OTHER">Other</option>
              </select>
            </RiceField>
            <RiceField label="Date">
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label="Amount">
              <input className={inputClass} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </RiceField>
            <RiceField label="Payment method">
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {RICE_METHODS.filter((row) => row.value !== "CREDIT").map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label="Reference">
              <input className={inputClass} value={form.paymentReference} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} />
            </RiceField>
            <RiceField label="Notes">
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Post expense"
              busyLabel="Posting…"
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await recordRiceExpenseAction({
                  requestId: crypto.randomUUID(),
                  ...form,
                });
                setBusy(false);
                if (!result.ok) setError(result.error);
                else {
                  const next = await loadRiceFinanceWorkspaceAction({ period });
                  if (next.ok) setWorkspace(next.workspace);
                  setForm((current) => ({ ...current, amount: "", notes: "" }));
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Expenses</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.expenses ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    No expenses in this period.
                  </td>
                </tr>
              ) : (
                (workspace?.expenses ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{row.kind}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className={`${glassCard} px-5 py-4`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold text-navy">{value}</p>
    </article>
  );
}
