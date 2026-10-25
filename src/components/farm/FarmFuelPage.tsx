"use client";

import { useState } from "react";
import { Fuel } from "lucide-react";
import { loadFarmFuelWorkspaceAction, type FarmFuelWorkspace } from "@/actions/farm/workspace";
import { recordFarmFuelAction, recordFarmMaintenanceAction } from "@/actions/farm/posting";
import { saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useT } from "@/components/i18n/LocaleProvider";
import { FARM_METHODS, FarmField, FarmNotice, FarmPageHeader, farmMethodKey, todayIso } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";

export function FarmFuelPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmFuelWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [isSavingFuel, setIsSavingFuel] = useState(false);
  const [savedFuel, setSavedFuel] = useState(false);
  const [savedFuel, setSavedFuel] = useState(false);
  const [isSavingMaint, setIsSavingMaint] = useState(false);
  const [fuelFilter, setFuelFilter] = useState("week");
  const [fuelCustomFrom, setFuelCustomFrom] = useState("");
  const [fuelCustomTo, setFuelCustomTo] = useState("");
  const [maintFilter, setMaintFilter] = useState("week");
  const [maintCustomFrom, setMaintCustomFrom] = useState("");
  const [maintCustomTo, setMaintCustomTo] = useState("");
  const [fuelError, setFuelError] = useState("");
  const [maintError, setMaintError] = useState("");
  const [fuel, setFuel] = useState({
    tractorId: "",
    supplierId: "",
    supplierName: "",
    occurredOn: todayIso(),
    litres: "",
    unitPrice: "",
    fuelType: "Diesel",
    stationName: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });
  const [maint, setMaint] = useState({
    tractorId: "",
    supplierId: "",
    supplierName: "",
    occurredOn: todayIso(),
    category: "SERVICE",
    description: "",
    partsCost: "",
    labourCost: "",
    fuelType: "Diesel",
    paymentMethod: "CASH",
    paymentReference: "",
    markUnderService: false,
    notes: "",
  });

  async function refresh(page = workspace?.listPage.page ?? 1, pageSize = workspace?.listPage.pageSize ?? 10) {
    const next = await loadFarmFuelWorkspaceAction({ period, page, pageSize });
    if (next.ok) setWorkspace(next.workspace);
    else setError(next.error);
  }

  const tractors = workspace?.tractors ?? [];

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Fuel} title={t("farm.fuel.title")} subtitle={t("farm.fuel.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {workspace?.caps.canFuel ? (
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.fuel.record")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FarmField label={t("farm.tractor.singular")}>
                <select className={inputClass} value={fuel.tractorId} onChange={(event) => setFuel({ ...fuel, tractorId: event.target.value })}>
                  <option value="">{t("common.selectItem")}</option>
                  {tractors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </FarmField>
              <FarmField label={t("common.date")}>
                <input type="date" className={inputClass} value={fuel.occurredOn} onChange={(event) => setFuel({ ...fuel, occurredOn: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.fuel.litres")}>
                <input className={inputClass} value={fuel.litres} onChange={(event) => setFuel({ ...fuel, litres: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.fuel.unitPrice")}>
                <input className={inputClass} value={fuel.unitPrice} onChange={(event) => setFuel({ ...fuel, unitPrice: event.target.value })} />
              </FarmField>
              <FarmField label="Fuel type">
                <select className={inputClass} value={fuel.fuelType} onChange={(event) => setFuel({ ...fuel, fuelType: event.target.value })}>
                  <option>Diesel</option>
                  <option>Petrol</option>
                  <option>Other</option>
                </select>
              </FarmField>
              <FarmField label={t("rice.purchases.method")}>
                <select className={inputClass} value={fuel.paymentMethod} onChange={(event) => setFuel({ ...fuel, paymentMethod: event.target.value })}>
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
                busy={isSavingFuel || savedFuel}
                idleLabel={savedFuel ? "Saved" : (isSavingFuel ? "Saving..." : t("farm.fuel.post"))}
                busyLabel={savedFuel ? "Saved" : (isSavingFuel ? "Saving..." : t("farm.fuel.post"))}
                onClick={async () => {
                  setIsSavingFuel(true);
                  setSavedFuel(false);
                  setFuelError("");
                  const requestId = crypto.randomUUID();
                  const payload = { requestId, ...fuel, fuelType: fuel.fuelType || "Diesel" };
                  try {
                    const saved = await saveWithOutbox(
                      { id: requestId, type: "farm.record_fuel", businessUnitCode: "farm", payload, entityId: fuel.tractorId ?? "" },
                      () => recordFarmFuelAction({ ...payload }),
                    );
                    setIsSavingFuel(false);
                    if (saved.error) { setFuelError(saved.error); } else { setSavedFuel(true); setTimeout(() => setSavedFuel(false), 2000); setFuel({ ...fuel, litres: "", unitPrice: "", notes: "", occurredOn: todayIso(), fuelType: fuel.fuelType || "Diesel", paymentMethod: "CASH" }); if (!saved.queued) await refresh(); }
                  } catch (e: any) {
                    setIsSavingFuel(false);
                    setFuelError((e as Error)?.message || "Save failed");
                  }
                }}
              />
            </div>
          </div>
        ) : null}

        {workspace?.caps.canMaintenance ? (
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.maint.record")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FarmField label={t("farm.tractor.singular")}>
                <select className={inputClass} value={maint.tractorId} onChange={(event) => setMaint({ ...maint, tractorId: event.target.value })}>
                  <option value="">{t("common.selectItem")}</option>
                  {tractors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </FarmField>
              <FarmField label={t("farm.maint.category")}>
                <select className={inputClass} value={maint.category} onChange={(event) => setMaint({ ...maint, category: event.target.value })}>
                  <option value="SERVICE">{t("farm.maint.service")}</option>
                  <option value="PARTS">{t("farm.maint.parts")}</option>
                  <option value="REPAIR">{t("farm.maint.repair")}</option>
                  <option value="OTHER">{t("rice.finance.expense.OTHER")}</option>
                </select>
              </FarmField>
              <FarmField label={t("farm.maint.description")}>
                <input className={inputClass} value={maint.description} onChange={(event) => setMaint({ ...maint, description: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.maint.partsCost")}>
                <input className={inputClass} value={maint.partsCost} onChange={(event) => setMaint({ ...maint, partsCost: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.maint.labourCost")}>
                <input className={inputClass} value={maint.labourCost} onChange={(event) => setMaint({ ...maint, labourCost: event.target.value })} />
              </FarmField>
              <FarmField label={t("common.date")}>
                <input type="date" className={inputClass} value={maint.occurredOn} onChange={(event) => setMaint({ ...maint, occurredOn: event.target.value })} />
              </FarmField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={isSavingMaint}
                idleLabel={isSavingMaint ? "Saving..." : t("farm.maint.post")}
                busyLabel="Saving..."
                onClick={async () => {
                  setIsSavingMaint(true);
                  setMaintError("");
                  const requestId = crypto.randomUUID();
                  const payload = { requestId, ...maint };
                  const saved = await saveWithOutbox(
                    { id: requestId, type: "farm.record_maintenance", businessUnitCode: "farm", payload },
                    () => recordFarmMaintenanceAction(payload),
                  );
                  setIsSavingMaint(false);
                  if (saved.error) setMaintError(saved.error);
                  else {
                    setMaint((current) => ({ ...current, description: "", partsCost: "", labourCost: "" }));
                    if (!saved.queued) await refresh();
                  }
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className={glassPanel}>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.fuel.list")}</h2>
          <select className={inputClass + " h-8 w-32 text-[12px]"} value={fuelFilter} onChange={e=>setFuelFilter(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Custom</option>
          </select>
          {fuelFilter==="custom" && <><input type="date" className={inputClass+" h-8 w-32 text-[12px]"} value={fuelCustomFrom} onChange={e=>setFuelCustomFrom(e.target.value)} /><input type="date" className={inputClass+" h-8 w-32 text-[12px]"} value={fuelCustomTo} onChange={e=>setFuelCustomTo(e.target.value)} /></>}
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("farm.tractor.singular")}</th>
                <th className="px-3 py-2">{t("farm.fuel.litres")}</th>
                <th className="px-3 py-2">{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.fuel ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    {t("farm.fuel.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.fuel ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.tractorName}</td>
                    <td className="px-3 py-2.5">{row.litres} L</td>
                    <td className="px-3 py-2.5">{formatTzs(row.totalCost)}</td>
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
          onPage={(page) => void refresh(page, workspace?.listPage.pageSize)}
          onPageSize={(pageSize) => void refresh(1, pageSize)}
        />
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("farm.maint.list")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("farm.tractor.singular")}</th>
                <th className="px-3 py-2">{t("farm.maint.description")}</th>
                <th className="px-3 py-2">{t("common.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.maintenance ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={4}>
                    {t("farm.maint.empty")}
                  </td>
                </tr>
              ) : (
                (workspace?.maintenance ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.tractorName}</td>
                    <td className="px-3 py-2.5">{row.description}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.totalCost)}</td>
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
