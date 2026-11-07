"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import { loadFarmFinanceWorkspaceAction, type FarmFinanceWorkspace } from "@/actions/farm/workspace";
import { recordFarmExpenseAction } from "@/actions/farm/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { filterClass, glassCard, glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { RiceListPeriodFilter } from "@/components/rice/RiceListPeriodFilter";
import { ContainedDrawer } from "@/components/ui/ContainedDrawer";
import { formatTzs } from "@/lib/format/currency";
import { reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { useT } from "@/components/i18n/LocaleProvider";
import { FARM_METHODS, FarmField, FarmNotice, FarmPageHeader, farmMethodKey, todayIso } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";
import { jobBalance } from "@/lib/farm/accounting";
import type { FarmJob } from "@/lib/farm/types";

function calendarIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function periodBounds(period: ReportPeriod, from?: string, to?: string) {
  if (period === "custom" && (!from || !to)) return null;
  const range = reportPeriodRange(period, new Date(), { from, to });
  return { from: calendarIso(range.from), to: calendarIso(range.to) };
}

type CustomerDebt = {
  key: string;
  name: string;
  total: number;
  paid: number;
  balance: number;
  jobs: FarmJob[];
};

function groupReceivables(jobs: FarmJob[]): CustomerDebt[] {
  const grouped = new Map<string, CustomerDebt>();
  for (const job of jobs) {
    const balance = jobBalance(job);
    if (balance.receivable <= 0) continue;
    const key = job.partyId || job.partyName;
    const current = grouped.get(key) ?? { key, name: job.partyName, total: 0, paid: 0, balance: 0, jobs: [] };
    current.total += balance.total;
    current.paid += balance.paid;
    current.balance += balance.receivable;
    current.jobs.push(job);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function FarmFinancePage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmFinanceWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const [dateFilter, setDateFilter] = useState("This Month");
  const [page, setPage] = useState(1);
  const [expensePeriod, setExpensePeriod] = useState<ReportPeriod>(period);
  const [expenseKind, setExpenseKind] = useState<"ALL" | "FUEL" | "MAINTENANCE">("ALL");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");
  const [viewing, setViewing] = useState<CustomerDebt | null>(null);
  const expenseBounds = useRef<{ from: string; to: string } | null>(null);
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "OPERATING", occurredOn: todayIso(), amount: "", paymentMethod: "CASH", paymentReference: "", notes: "" });
  const summary = workspace?.summary;
  const customers = useMemo(() => groupReceivables(workspace?.jobs ?? []), [workspace?.jobs]);
  const customerPage = useListPage(customers, String(customers.length));

  async function reloadExpenses(pageNumber = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const range = expenseBounds.current;
    const next = await loadFarmFinanceWorkspaceAction({
      period: range ? "custom" : expensePeriod,
      from: range?.from,
      to: range?.to,
      page: pageNumber,
      pageSize,
      expenseKind,
    });
    if (!next.ok) {
      setError(next.error);
      return;
    }
    setWorkspace((current) =>
      current ? { ...current, expenses: next.workspace.expenses, listPage: next.workspace.listPage } : next.workspace,
    );
  }

  useEffect(() => {
    const range = periodBounds(expensePeriod, expenseFrom, expenseTo);
    if (!range) return;
    expenseBounds.current = range;
    void reloadExpenses(1, workspace?.listPage.pageSize ?? 10);
    // Reload the expense list only when its date or type filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expensePeriod, expenseFrom, expenseTo, expenseKind]);

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Landmark} title={t("farm.finance.title")} subtitle={t("farm.finance.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
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
              const requestId = crypto.randomUUID();
              const payload = { requestId, ...form };
              const saved = await saveWithOutbox(
                { id: requestId, type: "farm.record_expense", businessUnitCode: "farm", payload },
                () => recordFarmExpenseAction(payload),
              );
              setBusy(false);
              if (saved.error) setError(saved.error);
              else {
                setForm((current) => ({ ...current, amount: "", notes: "" }));
                if (!saved.queued) {
                  const next = await loadFarmFinanceWorkspaceAction({ period, page: 1, pageSize: workspace?.listPage.pageSize });
                  if (next.ok) setWorkspace(next.workspace);
                }
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
                <th className="px-3 py-2">{t("common.paid")}</th>
                <th className="px-3 py-2">{t("common.balance")}</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>{t("farm.finance.noReceivables")}</td></tr>
              ) : customerPage.rows.map((row) => (
                <tr key={row.key} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.name}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.total)}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.paid)}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.balance)}</td>
                  <td className="px-3 py-2.5">
                    <CompactActionsMenu
                      ariaLabel="Actions"
                      items={[{ label: t("rice.storage.view"), onSelect: () => setViewing(row) }]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar
          showWhenEmpty
          page={customerPage.page}
          total={customers.length}
          pageSize={customerPage.pageSize}
          onPage={customerPage.setPage}
          onPageSize={customerPage.setPageSize}
        />
        {viewing ? (
          <ContainedDrawer title={viewing.name} subtitle={t("farm.finance.customerDebt")} onClose={() => setViewing(null)}>
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{t("common.total")}</dt>
                <dd className="mt-1 font-semibold text-navy">{formatTzs(viewing.total)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{t("common.paid")}</dt>
                <dd className="mt-1 font-semibold text-navy">{formatTzs(viewing.paid)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{t("common.balance")}</dt>
                <dd className="mt-1 font-semibold text-navy">{formatTzs(viewing.balance)}</dd>
              </div>
            </dl>
            <ul className="mt-5 space-y-2">
              {viewing.jobs.map((job) => {
                const balance = jobBalance(job);
                return (
                  <li key={job.id} className="rounded-[16px] border border-navy/10 px-3 py-3 text-[13px]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-navy">{job.serviceName}</p>
                        <p className="mt-0.5 text-[12px] text-slate-500">{job.occurredOn}</p>
                      </div>
                      <p className="font-semibold text-navy">{formatTzs(balance.receivable)}</p>
                    </div>
                    <p className="mt-2 text-[12px] text-slate-500">
                      {t("common.total")} {formatTzs(balance.total)} · {t("common.paid")} {formatTzs(balance.paid)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </ContainedDrawer>
        ) : null}
      </section>
            <section className={glassPanel}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[16px] font-semibold text-navy">Customer Payment Transactions</h2>
          <span className="text-[11px] text-slate-400">Transactions</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3 items-end text-[12px]">
          <select className="px-2 py-1 rounded-md bg-slate-100 text-slate-600" value={dateFilter} onChange={e=>{setDateFilter(e.target.value); setPage(1);}}><option>Today</option><option>Yesterday</option><option>This Week</option><option>This Month</option><option>This Year</option><option>Custom Range</option><option>All Time</option></select>
          <select className="px-2 py-1 rounded-md bg-slate-100 text-[12px] text-slate-600"><option>All methods</option><option>Cash</option><option>Bank</option><option>Mobile Money</option></select>
        </div>
        <div className={`${tableScrollClass} mt-2`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Job / Service</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th></tr></thead>
            <tbody>
              {(workspace?.jobs ?? []).flatMap(j => (j.payments ?? []).map(p => ({ ...p, customer: j.partyName, jobName: j.serviceName, jobId: j.id }))).slice(0, 10).map((p: any) => (
                <tr key={p.id || p.occurredOn + p.amount} className="border-t border-navy/5 text-navy"><td className="px-3 py-2.5">{p.occurredOn ? new Date(p.occurredOn).toLocaleDateString("en-GB") : "—"}</td><td className="px-3 py-2.5">{p.customer || "—"}</td><td className="px-3 py-2.5">{p.jobName || "—"}</td><td className="px-3 py-2.5">{(typeof p.amount === "number" || typeof p.amount === "string") ? (Number(p.amount)).toLocaleString("en-TZ") + " TZS" : "—"}</td><td className="px-3 py-2.5">{p.paymentMethod || p.method || "—"}</td><td className="px-3 py-2.5">{p.reference || p.paymentReference || "—"}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-3 text-[12px] text-slate-500"><span>Showing 1-10 of 18 example</span><div className="flex gap-1"><button className="px-2 py-0.5 rounded bg-slate-100">Prev</button><button className="px-2 py-0.5 rounded bg-navy text-white">1</button><button className="px-2 py-0.5 rounded bg-slate-100">Next</button></div></div>
        </div>
      </section>
<section className={glassPanel}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.finance.expense")}</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-40">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("common.type")}</span>
              <select
                className={filterClass}
                value={expenseKind}
                onChange={(event) => setExpenseKind(event.target.value as "ALL" | "FUEL" | "MAINTENANCE")}
              >
                <option value="ALL">{t("farm.finance.kindAll")}</option>
                <option value="FUEL">{t("farm.finance.kindFuel")}</option>
                <option value="MAINTENANCE">{t("farm.finance.kindMaintenance")}</option>
              </select>
            </label>
            <RiceListPeriodFilter
              period={expensePeriod}
              from={expenseFrom}
              to={expenseTo}
              onChange={(next) => {
                setExpensePeriod(next.period);
                setExpenseFrom(next.from);
                setExpenseTo(next.to);
              }}
            />
          </div>
        </div>
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
                  <td className="px-3 py-2.5">{expenseKindLabel(t, row.kind)}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar
          showWhenEmpty
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(nextPage) => { void reloadExpenses(nextPage, workspace?.listPage.pageSize ?? 10); }}
          onPageSize={(pageSize) => { void reloadExpenses(1, pageSize); }}
        />
      </section>
    </div>
  );
}

function expenseKindLabel(t: ReturnType<typeof useT>, kind: string) {
  if (kind === "FUEL") return t("farm.finance.kindFuel");
  if (kind === "MAINTENANCE") return t("farm.finance.kindMaintenance");
  if (kind === "OPERATING") return t("rice.finance.expense.OPERATING");
  if (kind === "LABOUR") return t("rice.finance.expense.LABOUR");
  if (kind === "OTHER") return t("rice.finance.expense.OTHER");
  return kind;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className={`${glassCard} min-w-0 px-3 py-3`}>
      <p className="break-words text-[10.5px] font-medium uppercase leading-4 tracking-[0.04em] text-slate-400 md:tracking-[0.08em]">{label}</p>
      <p className="mt-1 break-words text-[16px] font-semibold leading-snug tracking-[-0.03em] text-navy md:truncate">{value}</p>
    </article>
  );
}
