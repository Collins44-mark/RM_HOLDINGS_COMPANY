"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { loadFarmJobsWorkspaceAction, type FarmJobsWorkspace } from "@/actions/farm/workspace";
import { recordFarmJobAction, recordFarmJobPaymentAction } from "@/actions/farm/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useT } from "@/components/i18n/LocaleProvider";
import { FARM_METHODS, FarmField, FarmNotice, FarmPageHeader, farmJobStatusKey, farmMethodKey, todayIso } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";
import { jobBalance } from "@/lib/farm/accounting";
import { JobDrawer } from "./job-drawer";
import { loadWorkspaceWithCache, saveWithOutbox, writeOfflineSnapshot } from "@/lib/offline";

export function FarmJobsPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmJobsWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "payments" | "edit">("overview");
  const [form, setForm] = useState({
    partyId: "",
    partyName: "",
    partyPhone: "",
    serviceTypeId: "",
    tractorId: "",
    operatorId: "",
    location: "",
    areaHa: "",
    occurredOn: todayIso(),
    agreedPrice: "",
    amountPaid: "",
    paymentMethod: "CASH",
    status: "PENDING",
    duration: "",
    notes: "",
  });

  useEffect(() => {
    if (workspace) {
      void writeOfflineSnapshot({ kind: "farm.jobs", businessUnitCode: "farm", payload: workspace });
    }
  }, [workspace]);

  async function refresh(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const next = await loadWorkspaceWithCache({
      kind: "farm.jobs",
      businessUnitCode: "farm",
      load: () => loadFarmJobsWorkspaceAction({ period, page, pageSize }),
    });
    if (next.ok) setWorkspace(next.workspace);
    else setError(next.error);
  }

  const services = workspace?.services ?? [];
  const serviceId = form.serviceTypeId || services[0]?.id || "";

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Wrench} title={t("farm.job.title")} subtitle={t("farm.job.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}

      {workspace?.caps.canJobs ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.job.record")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("farm.job.customer")}>
              <select className={inputClass} value={form.partyId} onChange={(event) => setForm({ ...form, partyId: event.target.value })}>
                <option value="">{t("farm.job.newCustomer")}</option>
                {(workspace?.parties ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </FarmField>
            {!form.partyId ? (
              <>
                <FarmField label={t("farm.job.customerName")}>
                  <input className={inputClass} value={form.partyName} onChange={(event) => setForm({ ...form, partyName: event.target.value })} />
                </FarmField>
                <FarmField label={t("common.phone")}>
                  <input className={inputClass} value={form.partyPhone} onChange={(event) => setForm({ ...form, partyPhone: event.target.value })} />
                </FarmField>
              </>
            ) : null}
            <FarmField label={t("farm.job.service")}>
              <select className={inputClass} value={serviceId} onChange={(event) => setForm({ ...form, serviceTypeId: event.target.value })}>
                {services.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </FarmField>
            <FarmField label="Duration (Hours / Days)">
              <input className={inputClass} value={form.duration || ""} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="Hours / Days" />
            </FarmField>
            <FarmField label={t("farm.job.location")}>
              <input className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.job.area")}>
              <input className={inputClass} value={form.areaHa} onChange={(event) => setForm({ ...form, areaHa: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.tractor.singular")}>
              <select className={inputClass} value={form.tractorId} onChange={(event) => setForm({ ...form, tractorId: event.target.value })}>
                <option value="">{t("common.selectItem")}</option>
                {(workspace?.tractors ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </FarmField>
            <FarmField label={t("farm.job.operator")}>
              <select className={inputClass} value={form.operatorId} onChange={(event) => setForm({ ...form, operatorId: event.target.value })}>
                <option value="">{t("common.none")}</option>
                {(workspace?.staff ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </FarmField>
            <FarmField label={t("common.date")}>
              <input type="date" className={inputClass} value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.tractor.hours")}><input className={inputClass} value={form.duration || ""} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="Hours / Days" /></FarmField>
            <FarmField label={t("farm.job.price")}>
              <input className={inputClass} value={form.agreedPrice} onChange={(event) => setForm({ ...form, agreedPrice: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.job.status")}>
              <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="PENDING">{t("farm.job.pending")}</option>
                <option value="IN_PROGRESS">{t("farm.job.inProgress")}</option>
                <option value="COMPLETED">{t("farm.job.completed")}</option>
                <option value="CANCELLED">{t("farm.job.cancelled")}</option>
              </select>
            </FarmField>
            <FarmField label={t("rice.purchases.amountPaid")}>
              <input className={inputClass} value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} />
            </FarmField>
            <FarmField label={t("rice.purchases.method")}>
              <select className={inputClass} value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                {FARM_METHODS.map((row) => (
                  <option key={row.value} value={row.value}>
                    {t(farmMethodKey(row.value))}
                  </option>
                ))}
              </select>
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={t("farm.job.post")}
              busyLabel={t("common.posting")}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const requestId = crypto.randomUUID();
                const payload = { requestId, ...form, serviceTypeId: serviceId };
                const saved = await saveWithOutbox(
                  { id: requestId, type: "farm.record_job", businessUnitCode: "farm", payload: { ...payload } },
                  () => recordFarmJobAction(payload),
                );
                setBusy(false);
                if (saved.error) setError(saved.error);
                else {
                  if (!saved.queued) await refresh(1, workspace?.listPage.pageSize);
                  setForm({
                    partyId: "",
                    partyName: "",
                    partyPhone: "",
                    serviceTypeId: serviceId,
                    tractorId: "",
                    operatorId: "",
                    location: "",
                    areaHa: "",
                    occurredOn: todayIso(),
                    agreedPrice: "",
                    amountPaid: "",
                    paymentMethod: "CASH",
                    status: "PENDING",
                    duration: "",
                    notes: "",
                  });
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("farm.job.list")}</h2>
        <div className="flex items-center gap-3 mb-3">
          <input type="text" className={inputClass + " h-10 w-72"} placeholder="Search jobs..." />
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("farm.job.customer")}</th>
                <th className="px-3 py-2">{t("farm.job.service")}</th>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("common.total")}</th>
                <th className="px-3 py-2">{t("common.balance")}</th>
                <th className="px-3 py-2">{t("common.status")}</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.jobs ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={7}>
                    {t("farm.job.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.jobs ?? []).map((row) => {
                  const bal = jobBalance(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-3">{row.partyName}</td>
                      <td className="px-3 py-3">{row.serviceName}</td>
                      <td className="px-3 py-3">{row.occurredOn}</td>
                      <td className="px-3 py-2.5">{formatTzs(row.agreedPrice)}</td>
                      <td className="px-3 py-2.5">{formatTzs(bal.receivable)}</td>
                      <td className="px-3 py-2.5">
                        {t(farmJobStatusKey(row.status))} · {t(bal.status === "Paid" ? "status.paid" : bal.status === "Partial" ? "status.partial" : "status.unpaid")}
                        {bal.receivable > 0 && workspace?.caps.canJobs ? (
                          <JobPay
                            onPay={async (amount) => {
                              const requestId = crypto.randomUUID();
                              const payload = { requestId, jobId: row.id, amount };
                              const saved = await saveWithOutbox(
                                { id: requestId, type: "farm.record_job_payment", businessUnitCode: "farm", payload, entityId: row.id, dependsOn: [] },
                                () => recordFarmJobPaymentAction(payload),
                              );
                              if (saved.error) setError(saved.error);
                              else if (!saved.queued) await refresh();
                            }}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {selectedJob && <JobDrawer job={selectedJob} tab={drawerTab} setTab={setDrawerTab} onClose={() => { setSelectedJob(null); setDrawerTab("overview"); }} />}
        <PaginationBar
          page={workspace?.listPage.page ?? 1}
          total={workspace?.listPage.total ?? 0}
          pageSize={workspace?.listPage.pageSize ?? 10}
          onPage={(page) => void refresh(page, workspace?.listPage.pageSize)}
          onPageSize={(pageSize) => void refresh(1, pageSize)}
        />
      </section>
    </div>
  );
}

function JobPay({ onPay }: { onPay: (amount: string) => Promise<void> }) {
  const t = useT();
  const [amount, setAmount] = useState("");
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      <input className="h-8 w-24 rounded-full border border-[#dbe4ef] px-2 text-[12px]" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t("common.pay")} />
      <button type="button" className="text-[12px] font-semibold text-navy" onClick={() => void onPay(amount).then(() => setAmount(""))}>
        {t("common.record")}
      </button>
    </span>
  );
}
