"use client";

import { useRef, useState } from "react";
import { Landmark } from "lucide-react";
import { loadRiceFinanceWorkspaceAction, type RiceFinanceWorkspace } from "@/actions/rice/workspace";
import { recordRiceExpenseAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { RiceField, RiceNotice, RicePageHeader, RICE_METHODS, riceExpenseKindKey, riceMethodKey, todayIso } from "@/components/rice/rice-ui";

export function RiceFinancePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceFinanceWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const requestId = useRef(0);
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
        title={t("rice.finance.title")}
        subtitle={t("rice.finance.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("rice.finance.sales")} value={formatTzs(summary?.salesTotal ?? 0)} />
        <Stat label={t("rice.finance.service")} value={formatTzs(summary?.serviceIncome ?? 0)} />
        <Stat label={t("rice.finance.cogs")} value={formatTzs(summary?.cogs ?? 0)} />
        <Stat label={t("rice.finance.loss")} value={formatTzs(summary?.productionLoss ?? 0)} />
        <Stat label={t("rice.finance.expenses")} value={formatTzs(summary?.expenses ?? 0)} />
        <Stat label={t("rice.finance.inventory")} value={formatTzs(summary?.inventoryValue ?? 0)} />
        <Stat label={t("rice.finance.payables")} value={formatTzs(summary?.payables ?? 0)} />
        <Stat label={t("rice.finance.receivables")} value={formatTzs(summary?.receivables ?? 0)} />
        <Stat label={t("rice.finance.net")} value={formatTzs(summary?.netProfit ?? 0)} />
      </section>

      {workspace?.caps.canExpense ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.finance.recordExpense")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label={t("rice.finance.expenseType")}>
              <select className={inputClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="OPERATING">{t("rice.finance.expense.OPERATING")}</option>
                <option value="UTILITIES">{t("rice.finance.expense.UTILITIES")}</option>
                <option value="LABOUR">{t("rice.finance.expense.LABOUR")}</option>
                <option value="MILLING">{t("rice.finance.expense.MILLING")}</option>
                <option value="OTHER">{t("rice.finance.expense.OTHER")}</option>
              </select>
            </RiceField>
            <RiceField label={t("common.date")}>
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </RiceField>
            <RiceField label={t("common.amount")}>
              <input className={inputClass} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.purchases.method")}>
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {RICE_METHODS.filter((row) => row.value !== "CREDIT").map((row) => (
                  <option key={row.value} value={row.value}>
                    {t(riceMethodKey(row.value))}
                  </option>
                ))}
              </select>
            </RiceField>
            <RiceField label={t("common.reference")}>
              <input className={inputClass} value={form.paymentReference} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} />
            </RiceField>
            <RiceField label={t("common.notes")}>
              <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={t("rice.finance.postExpense")}
              busyLabel={t("common.posting")}
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
                  const id = ++requestId.current;
                  const next = await loadRiceFinanceWorkspaceAction({ period, page: 1, pageSize: workspace?.listPage.pageSize });
                  if (id !== requestId.current) return;
                  if (next.ok) setWorkspace(next.workspace);
                  setForm((current) => ({ ...current, amount: "", notes: "" }));
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.finance.expenseList")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("rice.purchases.no")}</th>
                <th className="px-3 py-2">{t("common.type")}</th>
                <th className="px-3 py-2">{t("common.amount")}</th>
                <th className="px-3 py-2">{t("common.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.expenses ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("rice.finance.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.expenses ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.number}</td>
                    <td className="px-3 py-2.5">{t(riceExpenseKindKey(row.kind))}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{row.notes ?? "—"}</td>
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
            const id = ++requestId.current;
            void loadRiceFinanceWorkspaceAction({ period, page, pageSize: workspace?.listPage.pageSize }).then((next) => {
              if (id !== requestId.current) return;
              if (next.ok) setWorkspace(next.workspace);
            });
          }}
          onPageSize={(pageSize) => {
            const id = ++requestId.current;
            void loadRiceFinanceWorkspaceAction({ period, page: 1, pageSize }).then((next) => {
              if (id !== requestId.current) return;
              if (next.ok) setWorkspace(next.workspace);
            });
          }}
        />
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
