"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { loadFarmFinanceWorkspaceAction, type FarmFinanceWorkspace } from "@/actions/farm/workspace";
import { recordFarmExpenseAction } from "@/actions/farm/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useT } from "@/components/i18n/LocaleProvider";
import { FARM_METHODS, FarmField, FarmNotice, FarmPageHeader, farmMethodKey, todayIso } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";
import { jobBalance } from "@/lib/farm/accounting";

export function FarmFinancePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmFinanceWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "OPERATING", occurredOn: todayIso(), amount: "", paymentMethod: "CASH", paymentReference: "", notes: "" });
  const summary = workspace?.summary;

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Landmark} title={t("farm.finance.title")} subtitle={t("farm.finance.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("farm.kpi.income")} value={formatTzs(summary?.serviceIncome ?? 0)} />
        <Stat label={t("farm.finance.received")} value={formatTzs(summary?.received ?? 0)} />
        <Stat label={t("farm.finance.receivables")} value={formatTzs(summary?.receivables ?? 0)} />
        <Stat label={t("farm.kpi.spend")} value={formatTzs(summary?.tractorExpense ?? 0)} />
        <Stat label={t("rice.finance.expenses")} value={formatTzs(summary?.expenses ?? 0)} />
        <Stat label={t("rice.finance.net")} value={formatTzs(summary?.netProfit ?? 0)} />
      </section>
      {workspace?.caps.canExpense ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.finance.recordExpense")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("common.type")}>
              <select className={inputClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="OPERATING">{t("rice.finance.expense.OPERATING")}</option>
                <option value="LABOUR">{t("rice.finance.expense.LABOUR")}</option>
                <option value="OTHER">{t("rice.finance.expense.OTHER")}</option>
              </select>
            </FarmField>
            <FarmField label={t("common.date")}>
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </FarmField>
            <FarmField label={t("common.amount")}>
              <input className={inputClass} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </FarmField>
            <FarmField label={t("rice.purchases.method")}>
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {FARM_METHODS.map((row) => <option key={row.value} value={row.value}>{t(farmMethodKey(row.value))}</option>)}
              </select>
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("rice.finance.postExpense")} busyLabel={t("common.posting")} onClick={async () => {
              setBusy(true); setError(null);
              const result = await recordFarmExpenseAction({ requestId: crypto.randomUUID(), ...form });
              setBusy(false);
              if (!result.ok) setError(result.error);
              else {
                const next = await loadFarmFinanceWorkspaceAction({ period, page: 1, pageSize: workspace?.listPage.pageSize });
                if (next.ok) setWorkspace(next.workspace);
                setForm((current) => ({ ...current, amount: "", notes: "" }));
              }
            }} />
          </div>
        </section>
      ) : null}
      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("farm.finance.receivables")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("farm.job.customer")}</th>
                <th className="px-3 py-2">{t("common.total")}</th>
                <th className="px-3 py-2">{t("common.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.jobs ?? []).filter((row) => jobBalance(row).receivable > 0).length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={3}>{t("farm.finance.noReceivables")}</td></tr>
              ) : (workspace?.jobs ?? []).filter((row) => jobBalance(row).receivable > 0).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.partyName}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.agreedPrice)}</td>
                  <td className="px-3 py-2.5">{formatTzs(jobBalance(row).receivable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.finance.expenseList")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("common.type")}</th>
                <th className="px-3 py-2">{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.expenses ?? []).length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={3}>{t("rice.finance.empty")}</td></tr>
              ) : (workspace?.expenses ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.occurredOn}</td>
                  <td className="px-3 py-2.5">{row.kind}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => { void loadFarmFinanceWorkspaceAction({ period, page, pageSize: workspace?.listPage.pageSize }).then((next) => { if (next.ok) setWorkspace(next.workspace); }); }}
          onPageSize={(pageSize) => { void loadFarmFinanceWorkspaceAction({ period, page: 1, pageSize }).then((next) => { if (next.ok) setWorkspace(next.workspace); }); }}
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
