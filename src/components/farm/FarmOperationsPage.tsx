"use client";

import { useState } from "react";
import { Wheat } from "lucide-react";
import { loadFarmOperationsWorkspaceAction, type FarmOperationsWorkspace } from "@/actions/farm/workspace";
import { recordFarmHarvestAction, recordFarmOperationAction, saveFarmPlotAction, saveFarmSeasonAction } from "@/actions/farm/posting";
import { isLikelyOffline, saveWithOutbox } from "@/lib/offline";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { useT } from "@/components/i18n/LocaleProvider";
import { FarmField, FarmNotice, FarmPageHeader, todayIso } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";

export function FarmOperationsPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmOperationsWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [plot, setPlot] = useState({ name: "", hectares: "", crop: "" });
  const [season, setSeason] = useState({ plotId: "", name: "", year: String(new Date().getFullYear()), crop: "" });
  const [op, setOp] = useState({ plotId: "", seasonId: "", tractorId: "", activity: "", occurredOn: todayIso(), areaHa: "", cost: "" });
  const [harvest, setHarvest] = useState({ seasonId: "", quantity: "", unit: "kg", harvestedOn: todayIso() });

  async function refresh() {
    const next = await loadFarmOperationsWorkspaceAction({ period });
    if (next.ok) setWorkspace(next.workspace);
    else setError(next.error);
  }

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Wheat} title={t("farm.ops.title")} subtitle={t("farm.ops.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}

      {workspace?.caps.canOperations ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.ops.plot")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FarmField label={t("farm.ops.plotName")}>
                <input className={inputClass} value={plot.name} onChange={(event) => setPlot({ ...plot, name: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.ops.hectares")}>
                <input className={inputClass} value={plot.hectares} onChange={(event) => setPlot({ ...plot, hectares: event.target.value })} />
              </FarmField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("farm.ops.savePlot")} busyLabel={t("common.posting")} onClick={async () => {
                setBusy(true); setError(null);
                if (isLikelyOffline()) { setBusy(false); setError(t("offline.onlineOnly")); return; }
                const result = await saveFarmPlotAction(plot);
                setBusy(false);
                if (!result.ok) setError(result.error); else { setPlot({ name: "", hectares: "", crop: "" }); await refresh(); }
              }} />
            </div>
          </div>
          <div className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.ops.season")}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FarmField label={t("farm.ops.plot")}>
                <select className={inputClass} value={season.plotId} onChange={(event) => setSeason({ ...season, plotId: event.target.value })}>
                  <option value="">{t("common.selectItem")}</option>
                  {(workspace?.plots ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </FarmField>
              <FarmField label={t("farm.ops.seasonName")}>
                <input className={inputClass} value={season.name} onChange={(event) => setSeason({ ...season, name: event.target.value })} />
              </FarmField>
              <FarmField label={t("farm.ops.year")}>
                <input className={inputClass} value={season.year} onChange={(event) => setSeason({ ...season, year: event.target.value })} />
              </FarmField>
            </div>
            <div className="mt-4">
              <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("farm.ops.saveSeason")} busyLabel={t("common.posting")} onClick={async () => {
                setBusy(true); setError(null);
                if (isLikelyOffline()) { setBusy(false); setError(t("offline.onlineOnly")); return; }
                const result = await saveFarmSeasonAction(season);
                setBusy(false);
                if (!result.ok) setError(result.error); else await refresh();
              }} />
            </div>
          </div>
        </section>
      ) : null}

      {workspace?.caps.canOperations ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.ops.record")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("farm.ops.activity")}>
              <input className={inputClass} value={op.activity} onChange={(event) => setOp({ ...op, activity: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.ops.plot")}>
              <select className={inputClass} value={op.plotId} onChange={(event) => setOp({ ...op, plotId: event.target.value })}>
                <option value="">{t("common.selectItem")}</option>
                {(workspace?.plots ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </FarmField>
            <FarmField label={t("common.date")}>
              <input type="date" className={inputClass} value={op.occurredOn} onChange={(event) => setOp({ ...op, occurredOn: event.target.value })} />
            </FarmField>
            <FarmField label={t("farm.ops.cost")}>
              <input className={inputClass} value={op.cost} onChange={(event) => setOp({ ...op, cost: event.target.value })} />
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("farm.ops.post")} busyLabel={t("common.posting")} onClick={async () => {
              setBusy(true); setError(null);
              const requestId = crypto.randomUUID();
              const payload = { requestId, ...op };
              const saved = await saveWithOutbox(
                { id: requestId, type: "farm.record_operation", businessUnitCode: "farm", payload },
                () => recordFarmOperationAction(payload),
              );
              setBusy(false);
              if (saved.error) setError(saved.error);
              else { setOp((current) => ({ ...current, activity: "", cost: "" })); if (!saved.queued) await refresh(); }
            }} />
          </div>
        </section>
      ) : null}

      {workspace?.caps.canOperations ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.ops.harvest")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("farm.ops.season")}>
              <select className={inputClass} value={harvest.seasonId} onChange={(event) => setHarvest({ ...harvest, seasonId: event.target.value })}>
                <option value="">{t("common.selectItem")}</option>
                {(workspace?.seasons ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </FarmField>
            <FarmField label={t("farm.ops.quantity")}>
              <input className={inputClass} value={harvest.quantity} onChange={(event) => setHarvest({ ...harvest, quantity: event.target.value })} />
            </FarmField>
            <FarmField label={t("common.date")}>
              <input type="date" className={inputClass} value={harvest.harvestedOn} onChange={(event) => setHarvest({ ...harvest, harvestedOn: event.target.value })} />
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("farm.ops.postHarvest")} busyLabel={t("common.posting")} onClick={async () => {
              setBusy(true); setError(null);
              const requestId = crypto.randomUUID();
              const payload = { requestId, ...harvest };
              const saved = await saveWithOutbox(
                { id: requestId, type: "farm.record_harvest", businessUnitCode: "farm", payload },
                () => recordFarmHarvestAction(payload),
              );
              setBusy(false);
              if (saved.error) setError(saved.error);
              else { setHarvest((current) => ({ ...current, quantity: "" })); if (!saved.queued) await refresh(); }
            }} />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("farm.ops.list")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("farm.ops.activity")}</th>
                <th className="px-3 py-2">{t("farm.ops.plot")}</th>
                <th className="px-3 py-2">{t("farm.ops.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.operations ?? []).length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>{t("farm.ops.empty")}</td></tr>
              ) : (workspace?.operations ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.occurredOn}</td>
                  <td className="px-3 py-2.5">{row.activity}</td>
                  <td className="px-3 py-2.5">{row.plotName ?? "—"}</td>
                  <td className="px-3 py-2.5">{formatTzs(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
