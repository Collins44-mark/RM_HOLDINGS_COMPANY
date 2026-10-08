"use client";

import { useRef, useState } from "react";
import { Fuel } from "lucide-react";
import {
  getTransportServiceWorkspaceAction,
  recordTransportFuelAction,
  recordTransportMaintenanceAction,
  type TransportServiceWorkspace,
} from "@/actions/school/transport";
import {
  glassPanel,
  inputClass,
  primaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { transportSelectClass } from "@/lib/school/transport-ui";
import type { TransportCaps, TransportPeriod } from "@/lib/school/transport-types";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";

const PERIODS: Array<[TransportPeriod, string]> = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["year", "This Year"],
];

export function SchoolTransportServicePage({ initial }: { initial: TransportServiceWorkspace }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [tab, setTab] = useState<"fuel" | "maintenance">(initial.ok && initial.tab === "maintenance" ? "maintenance" : "fuel");
  const [period, setPeriod] = useState<TransportPeriod>(ready ? initial.period : "month");
  const [busId, setBusId] = useState("");
  const [summary, setSummary] = useState(ready ? initial.summary : null);
  const buses = ready ? initial.buses : [];
  const [fuel, setFuel] = useState(ready ? initial.fuel : []);
  const [maintenance, setMaintenance] = useState(ready ? initial.maintenance : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<TransportCaps | null>(ready ? initial.capabilities : null);
  const [drawer, setDrawer] = useState<"fuel" | "maintenance" | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [fuelForm, setFuelForm] = useState({
    busId: "",
    recordedOn: new Date().toISOString().slice(0, 10),
    litres: "",
    unitPrice: "",
    odometer: "",
    station: "",
    reference: "",
    notes: "",
  });
  const [maintForm, setMaintForm] = useState({
    busId: "",
    recordedOn: new Date().toISOString().slice(0, 10),
    odometer: "",
    provider: "",
    workPerformed: "",
    parts: "",
    cost: "",
    reference: "",
    notes: "",
  });
  const lock = useRef(false);
  const fuelTotal = Number(fuelForm.litres) * Number(fuelForm.unitPrice);

  function load(next: { tab?: "fuel" | "maintenance"; period?: TransportPeriod; busId?: string; page?: number } = {}) {
    const nextTab = next.tab ?? tab;
    const nextPeriod = next.period ?? period;
    const nextBus = next.busId ?? busId;
    void getTransportServiceWorkspaceAction({
      tab: nextTab,
      period: nextPeriod,
      busId: nextBus,
      page: next.page ?? 1,
    }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setTab(result.tab === "maintenance" ? "maintenance" : "fuel");
      setPeriod(result.period);
      setSummary(result.summary);
      setFuel(result.fuel);
      setMaintenance(result.maintenance);
      setPage(result.page);
      setCaps(result.capabilities);
    });
  }

  function saveFuel() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void recordTransportFuelAction({ ...fuelForm, requestId }).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      load({ tab: "fuel" });
    });
  }

  function saveMaint() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void recordTransportMaintenanceAction({ ...maintForm, requestId }).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      load({ tab: "maintenance" });
    });
  }

  const activeBuses = buses.filter((row) => row.isActive);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Service</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Track fuel usage and vehicle maintenance.</p>
        </div>
        {tab === "fuel" && caps?.canRecordFuel ? (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setFuelForm({
                busId: busId || activeBuses[0]?.id || "",
                recordedOn: new Date().toISOString().slice(0, 10),
                litres: "",
                unitPrice: "",
                odometer: "",
                station: "",
                reference: "",
                notes: "",
              });
              setRequestId(crypto.randomUUID());
              setSaved(false);
              setDrawer("fuel");
            }}
          >
            + Record Fuel
          </button>
        ) : null}
        {tab === "maintenance" && caps?.canRecordMaintenance ? (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setMaintForm({
                busId: busId || activeBuses[0]?.id || "",
                recordedOn: new Date().toISOString().slice(0, 10),
                odometer: "",
                provider: "",
                workPerformed: "",
                parts: "",
                cost: "",
                reference: "",
                notes: "",
              });
              setRequestId(crypto.randomUUID());
              setSaved(false);
              setDrawer("maintenance");
            }}
          >
            + Record Maintenance
          </button>
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Fuel Cost", formatTzs(summary?.fuelCost ?? 0)],
          ["Fuel Used", `${summary?.fuelLitres ?? 0} L`],
          ["Maintenance Cost", formatTzs(summary?.maintenanceCost ?? 0)],
          ["Total Service Cost", formatTzs((summary?.fuelCost ?? 0) + (summary?.maintenanceCost ?? 0))],
        ].map(([label, value]) => (
          <section key={label} className={cn(glassPanel, "px-4 py-3")}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
          {(
            [
              ["fuel", "Fuel"],
              ["maintenance", "Maintenance"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                load({ tab: id, page: 1 });
              }}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                tab === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className={transportSelectClass}
          value={period}
          onChange={(event) => {
            const next = event.target.value as TransportPeriod;
            setPeriod(next);
            load({ period: next });
          }}
        >
          {PERIODS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={transportSelectClass}
          value={busId}
          onChange={(event) => {
            setBusId(event.target.value);
            load({ busId: event.target.value });
          }}
        >
          <option value="">All Buses</option>
          {buses.map((row) => (
            <option key={row.id} value={row.id}>
              {row.registrationNumber}
            </option>
          ))}
        </select>
      </div>

      {tab === "fuel" ? (
        fuel.length === 0 ? (
          <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
            <SchoolIconWell icon={Fuel} />
            <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No fuel records for this period.</h2>
          </section>
        ) : (
          <section className={glassPanel}>
            <div className={tableScrollClass}>
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className={tableHead}>
                    {["Date", "Bus", "Litres", "Unit Price", "Total", "Odometer", "Fuel Station"].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fuel.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                      <td className="px-4 py-3">{row.recordedOn}</td>
                      <td className="px-4 py-3">{row.busRegistration}</td>
                      <td className="px-4 py-3">{row.litres}</td>
                      <td className="px-4 py-3">{formatTzs(row.unitPrice)}</td>
                      <td className="px-4 py-3">{formatTzs(row.totalAmount)}</td>
                      <td className="px-4 py-3">{row.odometer ?? "—"}</td>
                      <td className="px-4 py-3">{row.station || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SchoolPagination page={page.page} total={page.total} onPage={(next) => load({ page: next })} />
          </section>
        )
      ) : maintenance.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Fuel} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No maintenance records for this period.</h2>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Date", "Bus", "Service Provider", "Odometer", "Work", "Cost"].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maintenance.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">{row.recordedOn}</td>
                    <td className="px-4 py-3">{row.busRegistration}</td>
                    <td className="px-4 py-3">{row.provider || "—"}</td>
                    <td className="px-4 py-3">{row.odometer ?? "—"}</td>
                    <td className="px-4 py-3">{row.workPerformed}</td>
                    <td className="px-4 py-3">{formatTzs(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load({ page: next })} />
        </section>
      )}

      {drawer === "fuel" ? (
        <ContainedDrawer
          title="Record Fuel"
          onClose={() => setDrawer(null)}
          busy={busy}
          footer={
            <>
              <DrawerCancel disabled={busy} />
              <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save Fuel" onClick={saveFuel} />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bus</span>
              <select className={inputClass} value={fuelForm.busId} onChange={(event) => setFuelForm((p) => ({ ...p, busId: event.target.value }))}>
                <option value="">Select bus</option>
                {activeBuses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.registrationNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span>
              <input type="date" className={inputClass} value={fuelForm.recordedOn} onChange={(event) => setFuelForm((p) => ({ ...p, recordedOn: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Litres</span>
              <input className={inputClass} inputMode="decimal" value={fuelForm.litres} onChange={(event) => setFuelForm((p) => ({ ...p, litres: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Price per litre</span>
              <input className={inputClass} inputMode="decimal" value={fuelForm.unitPrice} onChange={(event) => setFuelForm((p) => ({ ...p, unitPrice: event.target.value }))} />
            </label>
            <p className="text-[13.5px] text-navy">Total {Number.isFinite(fuelTotal) && fuelTotal > 0 ? formatTzs(fuelTotal) : "—"}</p>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Odometer</span>
              <input className={inputClass} inputMode="decimal" value={fuelForm.odometer} onChange={(event) => setFuelForm((p) => ({ ...p, odometer: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Fuel station / supplier</span>
              <input className={inputClass} value={fuelForm.station} onChange={(event) => setFuelForm((p) => ({ ...p, station: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
              <input className={inputClass} value={fuelForm.reference} onChange={(event) => setFuelForm((p) => ({ ...p, reference: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
              <input className={inputClass} value={fuelForm.notes} onChange={(event) => setFuelForm((p) => ({ ...p, notes: event.target.value }))} />
            </label>
          </div>
        </ContainedDrawer>
      ) : null}

      {drawer === "maintenance" ? (
        <ContainedDrawer
          title="Record Maintenance"
          onClose={() => setDrawer(null)}
          busy={busy}
          footer={
            <>
              <DrawerCancel disabled={busy} />
              <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save Maintenance" onClick={saveMaint} />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bus</span>
              <select className={inputClass} value={maintForm.busId} onChange={(event) => setMaintForm((p) => ({ ...p, busId: event.target.value }))}>
                <option value="">Select bus</option>
                {activeBuses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.registrationNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Service date</span>
              <input type="date" className={inputClass} value={maintForm.recordedOn} onChange={(event) => setMaintForm((p) => ({ ...p, recordedOn: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Odometer</span>
              <input className={inputClass} inputMode="decimal" value={maintForm.odometer} onChange={(event) => setMaintForm((p) => ({ ...p, odometer: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Service provider / garage</span>
              <input className={inputClass} value={maintForm.provider} onChange={(event) => setMaintForm((p) => ({ ...p, provider: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Work performed</span>
              <input className={inputClass} value={maintForm.workPerformed} onChange={(event) => setMaintForm((p) => ({ ...p, workPerformed: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Parts / repairs</span>
              <input className={inputClass} value={maintForm.parts} onChange={(event) => setMaintForm((p) => ({ ...p, parts: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Cost</span>
              <input className={inputClass} inputMode="decimal" value={maintForm.cost} onChange={(event) => setMaintForm((p) => ({ ...p, cost: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
              <input className={inputClass} value={maintForm.reference} onChange={(event) => setMaintForm((p) => ({ ...p, reference: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
              <input className={inputClass} value={maintForm.notes} onChange={(event) => setMaintForm((p) => ({ ...p, notes: event.target.value }))} />
            </label>
          </div>
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
