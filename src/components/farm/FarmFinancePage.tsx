"use client";

import { useState, useMemo } from "react";
import { Landmark } from "lucide-react";
import { loadFarmFinanceWorkspaceAction, type FarmFinanceWorkspace } from "@/actions/farm/workspace";
import { recordFarmExpenseAction } from "@/actions/farm/posting";
import { saveWithOutbox } from "@/lib/offline";
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
  const [dateFilter, setDateFilter] = useState("This Month");
  const [methodFilter, setMethodFilter] = useState("All history");
  const [methodFilter, setMethodFilter] = useState("All history");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
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

      <section className={glassPanel}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div><h2 className="text-[16px] font-semibold text-navy">Fuel & Maintenance History</h2></div>
          <span className="text-[11px] text-slate-400">13 records</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3 items-end text-[12px]">
          <select className="px-2 py-1 rounded-md bg-slate-100 text-slate-600" defaultValue="This Month"><option>Today</option><option>Yesterday</option><option>This Week</option><option>This Month</option><option>This Year</option><option>Custom Range</option><option>All Time</option></select>
          <select className="px-2 py-1 rounded-md bg-slate-100 text-[12px] text-slate-600"><option>All history</option><option>Fuel history</option><option>Maintenance history</option></select>
        </div>
        <div className={`${tableScrollClass} mt-2`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}><tr><th className="px-3 py-2">TYPE</th><th className="px-3 py-2">AMOUNT</th><th className="px-3 py-2">NOTES</th></tr></thead>
            <tbody>{useMemo(() => [{type:"MAINTENANCE",amount:3600,notes:"Tire repair",d:new Date("2026-10-27")},{type:"FUEL",amount:14400,notes:"Tractor refueling",d:new Date("2026-10-27")},{type:"MAINTENANCE",amount:112000,notes:"Oil change",d:new Date("2026-10-27")},{type:"FUEL",amount:14400,notes:"Tractor refueling",d:new Date("2026-10-26")},{type:"MAINTENANCE",amount:90000,notes:"Service",d:new Date("2026-10-25")}],[]).filter((r:any)=>{if(dateFilter==="Today"){const n=new Date();return r.d&&r.d.toDateString()===n.toDateString();}else if(dateFilter==="Yesterday"){const y=new Date();y.setDate(y.getDate()-1);return r.d&&r.d.toDateString()===y.toDateString();}else if(dateFilter==="This Week"){const s=new Date();s.setDate(s.getDate()-s.getDay());return r.d&&r.d>=s;}else if(dateFilter==="This Month"){return r.d&&r.d.getMonth()===new Date().getMonth()&&r.d.getFullYear()===new Date().getFullYear();}else if(dateFilter==="This Year"){return r.d&&r.d.getFullYear()===new Date().getFullYear();}else if(dateFilter==="Custom Range"){if(startDate&&!r.d>=new Date(startDate))return false;if(endDate&&!r.d<=new Date(endDate))return false;return true;}return true;}).filter((r:any)=>methodFilter==="All history"||((methodFilter==="All history"||r.type===methodFilter.replace(" history","").toUpperCase())).slice(0, 10).map((r:any)=>(<tr key={r.type+r.amount+String(r.d)} className="border-t border-navy/5 text-navy"><td className="px-3 py-2.5">{r.type}</td><td className="px-3 py-2.5">{"TZS "+r.amount.toLocaleString("en-TZ")}</td><td className="px-3 py-2.5">{r.notes}</td></tr>))}</tbody>
          </table>
          <div className="flex items-center justify-between mt-3 text-[12px] text-slate-500"><span>Showing 1-5 of 13</span><div className="flex gap-1"><button className="px-2 py-0.5 rounded bg-slate-100">Prev</button><button className="px-2 py-0.5 rounded bg-navy text-white">1</button><button className="px-2 py-0.5 rounded bg-slate-100">Next</button></div></div>
        </div>
      </section>
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className={`${glassCard} px-5 py-4`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold text-navy">{value}</p>
    </article>
  );
}
