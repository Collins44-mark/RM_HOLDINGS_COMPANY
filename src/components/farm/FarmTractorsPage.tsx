"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
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
  secondaryButton,
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
  const [savedOk, setSavedOk] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerTab, setDrawerTab] = useState<"overview" | "edit" | "history">("overview");
  const [selected, setSelected] = useState<
    FarmTractorsWorkspace["tractors"][0] | null
  >(null);
  const nextCode = useMemo(() => {
    const nums = (workspace?.tractors ?? [])
      .map((t: any) => {
        const m = t.code?.match(/TRC-(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(Boolean);
    const max = nums.length ? Math.max(...nums) : 0;
    return `TRC-${String(max + 1).padStart(3, "0")}`;
  }, [workspace?.tractors]);

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
                readOnly
                aria-label="Preview only — server generates final ID"
                className={inputClass + " bg-slate-50"}
                value={nextCode}
                placeholder="Auto-generated (preview)"
                title="Next available ID (preview only; server authoritative)"
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
              <select data-testid="status-removed"
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
            <FarmField label="Date of purchase">
              <input
                type="date"
                className={inputClass}
                value={form.acquiredOn}
                onChange={(event) =>
                  setForm({ ...form, acquiredOn: event.target.value })
                }
              />
            </FarmField>
            <FarmField label="Buying price (TZS)">
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
                {error && <div className="text-red-600 text-sm">{error}</div>}
            <button
              className={primaryButton + " flex items-center justify-center gap-2 min-w-[140px]" + (savedOk ? " bg-green-600" : "")}
              disabled={busy}
              aria-label={busy ? "Saving..." : savedOk ? "Saved" : "Save tractor"}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await saveFarmTractorAction({ ...form, code: nextCode || form.code || "" });
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
            >
              {busy ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : savedOk ? <span className="flex items-center gap-1"><span>✓</span> Saved</span> : <span className="flex items-center gap-2"><Tractor className="w-4 h-4" /> Save tractor</span>}
            </button>
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

                <th className="px-3 py-2">Buying Price (TZS)</th>
                <th className="px-3 py-2">Actions</th>
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
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-[13px]">{row.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {row.code}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-medium ${row.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : row.status === "IN_USE" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
                        {t(farmTractorStatusKey(row.status))}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">{row.hourMeter} h</td>
                    <td className="px-3 py-3.5">
                      {row.acquisitionCost != null
                        ? formatTzs(row.acquisitionCost)
                        : "—"}
                    </td>
                    <td className="px-3 py-3.5">
                      <button
                        onClick={() => setSelected(row)}
                        aria-label="View"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        
        {selected && createPortal(
          <>
            <aside className="fixed top-4 right-4 bottom-4 w-[480px] max-w-[92vw] bg-white rounded-[24px] shadow-2xl z-50 overflow-hidden flex flex-col border border-slate-200" role="dialog" aria-modal="true" aria-label="Tractor details">
              <div className="px-6 pt-6 pb-4 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-blue-700"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/><path d="M12 2v20"/></svg></span>
                      <h2 className="text-xl font-bold text-navy leading-none">Tractor details</h2>
                    </div>
                    <div className="text-sm text-slate-500 mt-1">{selected.code || selected.id} · {selected.name}</div>
                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${selected?.status === "IN_USE" ? "bg-amber-50 text-amber-700" : selected?.status === "UNDER_SERVICE" ? "bg-rose-50 text-rose-700" : selected?.status === "INACTIVE" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>{selected?.status === "AVAILABLE" ? "● Available" : selected?.status === "IN_USE" ? "● In use" : selected?.status === "UNDER_SERVICE" ? "● Service" : selected?.status === "INACTIVE" ? "● Inactive" : "● Available"}</div>
                  </div>
                  <button onClick={() => setSelected(null)} aria-label="Close" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-navy"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div className="flex gap-6 mt-4 text-[13px] font-medium text-slate-600">
                  <button onClick={()=>setDrawerTab("overview")} className={`pb-3 -mb-3.5 border-b-2 transition ${drawerTab==="overview"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>Overview</button>
                  <button onClick={()=>setDrawerTab("edit")} className={`pb-3 -mb-3.5 border-b-2 transition ${drawerTab==="edit"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>Edit</button>
                  <button onClick={()=>setDrawerTab("history")} className={`pb-3 -mb-3.5 border-b-2 transition ${drawerTab==="history"?"text-navy border-navy":"text-slate-500 border-transparent hover:text-navy hover:border-slate-300"}`}>History</button>
                </div>
              </div>
              <div className="px-6 overflow-y-auto flex-1 min-h-0">
                {/* drawer content */}
                <TractorDrawer selected={selected} drawerTab={drawerTab} setDrawerTab={setDrawerTab} />
              </div>
            </aside>
          </>,
          document.body
        )}
        <PaginationBar page={meta.page} total={rows.length} pageSize={pageSize} onPage={setPage} onPageSize={(size)=>{setPageSize(size);setPage(1)}} />
      </section>
    </div>
  );
}
function TractorDrawer({ selected, drawerTab, setDrawerTab }: any) {
  if (!selected) return null;
  if (drawerTab === "edit") {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Name</label>
          <input className={inputClass} defaultValue={selected?.name || ""} />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Manufacturer</label>
          <input className={inputClass} defaultValue={selected?.manufacturer || ""} />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Model</label>
          <input className={inputClass} defaultValue={selected?.model || ""} />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">Status</label>
          <select className={inputClass} defaultValue={selected?.status || "AVAILABLE"}>
            <option>Available</option><option>In use</option><option>Under service</option><option>Inactive</option>
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => setDrawerTab("overview")} className={secondaryButton}>Cancel</button>
          <button className={primaryButton}>Save changes</button>
        </div>
      </div>
    );
  }
  if (drawerTab === "history") {
    return <div className="text-sm text-slate-500">No activity history available yet.</div>;
  }
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 mb-3">Basic information</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <div><div className="text-slate-400 text-[11px]">Name</div><div className="font-medium text-navy">{selected?.name}</div></div>
          <div><div className="text-slate-400 text-[11px]">ID</div><div className="font-medium text-navy">{selected?.code}</div></div>
          <div><div className="text-slate-400 text-[11px]">Reg</div><div className="font-medium text-navy">{selected?.registrationNumber}</div></div>
          <div><div className="text-slate-400 text-[11px]">Manufacturer</div><div className="font-medium text-navy">{selected?.manufacturer}</div></div>
          <div><div className="text-slate-400 text-[11px]">Model</div><div className="font-medium text-navy">{selected?.model}</div></div>
          <div><div className="text-slate-400 text-[11px]">Hours</div><div className="font-medium text-navy">{selected?.hourMeter}h</div></div>
          <div><div className="text-slate-400 text-[11px]">Purchase</div><div className="font-medium text-navy">{selected?.acquiredOn}</div></div>
          <div><div className="text-slate-400 text-[11px]">Price</div><div className="font-medium text-navy">{selected?.acquisitionCost}</div></div>
        </div>
      </section>
    </div>
  );
}