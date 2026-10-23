"use client";

import { useState } from "react";
import { Tractor } from "lucide-react";
import {
  loadFarmTractorsWorkspaceAction,
  type FarmTractorsWorkspace,
} from "@/actions/farm/workspace";
import { saveFarmTractorAction } from "@/actions/farm/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import {
  glassPanel,
  inputClass,
  primaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import { useT } from "@/components/i18n/LocaleProvider";
import {
  FarmField,
  FarmNotice,
  FarmPageHeader,
  farmTractorStatusKey,
} from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { pageMeta, parsePageSize } from "@/lib/pagination";

export function FarmTractorsPage({
  initial,
}: {
  initial:
    | { ok: true; workspace: FarmTractorsWorkspace }
    | { ok: false; error: string };
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(
    initial.ok ? initial.workspace : null,
  );
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<
    FarmTractorsWorkspace["tractors"][0] | null
  >(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    registrationNumber: "",
    manufacturer: "",
    model: "",
    acquiredOn: "",
    acquisitionCost: "",
    status: "AVAILABLE",
    hourMeter: "0",
    notes: "",
  });

  const rows = workspace?.tractors ?? [];
  const meta = pageMeta(page, rows.length, parsePageSize(pageSize));
  const slice = rows.slice(meta.from ? meta.from - 1 : 0, meta.to);

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader
        icon={Tractor}
        title={t("farm.tractor.title")}
        subtitle={t("farm.tractor.subtitle")}
      />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}

      {workspace?.caps.canTractors ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">
            {t("farm.tractor.register")}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("farm.tractor.code")}>
              <input
                className={inputClass}
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.name")}>
              <input
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.reg")}>
              <input
                className={inputClass}
                value={form.registrationNumber}
                onChange={(event) =>
                  setForm({ ...form, registrationNumber: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.maker")}>
              <input
                className={inputClass}
                value={form.manufacturer}
                onChange={(event) =>
                  setForm({ ...form, manufacturer: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.model")}>
              <input
                className={inputClass}
                value={form.model}
                onChange={(event) =>
                  setForm({ ...form, model: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.status")}>
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
              >
                <option value="AVAILABLE">{t("farm.status.available")}</option>
                <option value="IN_USE">{t("farm.status.inUse")}</option>
                <option value="UNDER_SERVICE">
                  {t("farm.status.service")}
                </option>
                <option value="INACTIVE">{t("farm.status.inactive")}</option>
              </select>
            </FarmField>
            <FarmField label={t("farm.tractor.hours")}>
              <input
                className={inputClass}
                value={form.hourMeter}
                onChange={(event) =>
                  setForm({ ...form, hourMeter: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.acquired")}>
              <input
                type="date"
                className={inputClass}
                value={form.acquiredOn}
                onChange={(event) =>
                  setForm({ ...form, acquiredOn: event.target.value })
                }
              />
            </FarmField>
            <FarmField label={t("farm.tractor.cost")}>
              <input
                className={inputClass}
                value={form.acquisitionCost}
                onChange={(event) =>
                  setForm({ ...form, acquisitionCost: event.target.value })
                }
              />
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={t("farm.tractor.save")}
              busyLabel={t("common.posting")}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await saveFarmTractorAction(form);
                setBusy(false);
                if (!result.ok) setError(result.error);
                else {
                  const next = await loadFarmTractorsWorkspaceAction();
                  if (next.ok) setWorkspace(next.workspace);
                  setForm({
                    code: "",
                    name: "",
                    registrationNumber: "",
                    manufacturer: "",
                    model: "",
                    acquiredOn: "",
                    acquisitionCost: "",
                    status: "AVAILABLE",
                    hourMeter: "0",
                    notes: "",
                  });
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">
          {t("farm.tractor.list")}
        </h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Tractor</th>
                <th className="px-3 py-2">{t("common.status")}</th>
                <th className="px-3 py-2">{t("farm.tractor.hours")}</th>

                <th className="px-3 py-2">{t("farm.tractor.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("farm.tractor.empty")}
                  </td>
                </tr>
              ) : (
                slice.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {row.code}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t(farmTractorStatusKey(row.status))}
                    </td>
                    <td className="px-3 py-2.5">{row.hourMeter} h</td>
                    <td className="px-3 py-2.5">
                      {row.acquisitionCost != null
                        ? formatTzs(row.acquisitionCost)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setSelected(row)}
                        aria-label="View"
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={meta.page}
          total={rows.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </section>
    </div>
  );
}
