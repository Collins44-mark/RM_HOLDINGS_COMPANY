"use client";

import { useRef, useState } from "react";
import { Bus } from "lucide-react";
import {
  archiveTransportBusAction,
  listTransportBusesAction,
  saveTransportBusAction,
  type TransportBusesWorkspace,
} from "@/actions/school/transport";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { transportInputClass, transportSelectClass } from "@/lib/school/transport-ui";
import type { TransportBusRow, TransportCaps } from "@/lib/school/transport-types";
import type { SchoolPageMeta } from "@/lib/school/pagination";
import { schoolPageMeta } from "@/lib/school/pagination";

const emptyForm = {
  id: "",
  registrationNumber: "",
  name: "",
  makeModel: "",
  capacity: "",
  modelYear: "",
  odometer: "",
  isActive: true,
};

export function SchoolTransportBusesPage({ initial }: { initial: TransportBusesWorkspace }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [rows, setRows] = useState<TransportBusRow[]>(ready ? initial.buses : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<TransportCaps | null>(ready ? initial.capabilities : null);
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState<"create" | "edit" | "view" | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);

  function load(nextPage: number, nextStatus = status, nextQ = q) {
    void listTransportBusesAction({ page: nextPage, status: nextStatus, q: nextQ }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.buses);
      setPage(result.page);
      setCaps(result.capabilities);
    });
  }

  function startCreate() {
    setForm(emptyForm);
    setSaved(false);
    setOpen("create");
  }

  function startEdit(row: TransportBusRow, mode: "edit" | "view") {
    setForm({
      id: row.id,
      registrationNumber: row.registrationNumber,
      name: row.name,
      makeModel: row.makeModel,
      capacity: String(row.capacity || ""),
      modelYear: row.modelYear ? String(row.modelYear) : "",
      odometer: String(row.odometer || ""),
      isActive: row.isActive,
    });
    setSaved(false);
    setOpen(mode);
  }

  function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void saveTransportBusAction({
      id: form.id || undefined,
      registrationNumber: form.registrationNumber,
      name: form.name,
      makeModel: form.makeModel,
      capacity: form.capacity,
      modelYear: form.modelYear,
      odometer: form.odometer,
      isActive: form.isActive,
    }).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      load(page.page);
    });
  }

  const selected = rows.find((row) => row.id === form.id);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Buses</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Register and manage school vehicles.</p>
        </div>
        {caps?.canManageBuses ? (
          <button type="button" className={primaryButton} onClick={startCreate}>
            + Add Bus
          </button>
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={transportSelectClass}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            load(1, event.target.value);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <form
          className="min-w-[220px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <input className={transportInputClass} value={q} placeholder="Search registration or bus" onChange={(event) => setQ(event.target.value)} />
        </form>
      </div>
      {rows.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Bus} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No school buses registered yet.</h2>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Bus", "Registration", "Driver", "Capacity", "Odometer", "Status", ""].map((heading) => (
                    <th key={heading || "actions"} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">{row.name || row.registrationNumber}</td>
                    <td className="px-4 py-3">{row.registrationNumber}</td>
                    <td className="px-4 py-3">{row.driverName || "—"}</td>
                    <td className="px-4 py-3">{row.capacity || "—"}</td>
                    <td className="px-4 py-3">{row.odometer ? `${row.odometer} km` : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.registrationNumber} actions`}
                        items={[
                          { label: "View", onSelect: () => startEdit(row, "view") },
                          ...(caps?.canManageBuses ? [{ label: "Edit", onSelect: () => startEdit(row, "edit") }] : []),
                          ...(caps?.canManageBuses
                            ? [
                                {
                                  label: row.isActive ? "Deactivate" : "Activate",
                                  onSelect: () => {
                                    void archiveTransportBusAction(row.id, !row.isActive).then((result) => {
                                      if (!result.ok) setError(result.error);
                                      else load(page.page);
                                    });
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next)} />
        </section>
      )}

      {open && (open === "create" || open === "edit") ? (
        <ContainedDrawer
          title={form.id ? "Edit bus" : "Add bus"}
          subtitle="Registration number must be unique."
          onClose={() => setOpen(null)}
          busy={busy}
          footer={
            <>
              <DrawerCancel disabled={busy} />
              <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save Bus" onClick={save} />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Registration number</span>
              <input className={inputClass} value={form.registrationNumber} onChange={(event) => setForm((p) => ({ ...p, registrationNumber: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bus name</span>
              <input className={inputClass} value={form.name} onChange={(event) => setForm((p) => ({ ...p, name: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Make / model</span>
              <input className={inputClass} value={form.makeModel} onChange={(event) => setForm((p) => ({ ...p, makeModel: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Capacity</span>
              <input className={inputClass} inputMode="numeric" value={form.capacity} onChange={(event) => setForm((p) => ({ ...p, capacity: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Year</span>
              <input className={inputClass} inputMode="numeric" value={form.modelYear} onChange={(event) => setForm((p) => ({ ...p, modelYear: event.target.value }))} />
            </label>
            {!form.id ? (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Current odometer</span>
                <input className={inputClass} inputMode="decimal" value={form.odometer} onChange={(event) => setForm((p) => ({ ...p, odometer: event.target.value }))} />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-[13.5px] text-navy">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((p) => ({ ...p, isActive: event.target.checked }))} />
              Active
            </label>
          </div>
        </ContainedDrawer>
      ) : null}

      {open === "view" && selected ? (
        <ContainedDrawer title={selected.registrationNumber} subtitle={selected.name || selected.makeModel} onClose={() => setOpen(null)}>
          <div className="grid grid-cols-2 gap-2 pb-4 text-[13.5px]">
            <p className="text-slate-500">Status</p>
            <p className="text-navy">{selected.isActive ? "Active" : "Inactive"}</p>
            <p className="text-slate-500">Driver</p>
            <p className="text-navy">{selected.driverName || "—"}</p>
            <p className="text-slate-500">Capacity</p>
            <p className="text-navy">{selected.capacity || "—"}</p>
            <p className="text-slate-500">Odometer</p>
            <p className="text-navy">{selected.odometer ? `${selected.odometer} km` : "—"}</p>
            <p className="text-slate-500">Fuel cost</p>
            <p className="text-navy">{formatTzs(selected.fuelCost)}</p>
            <p className="text-slate-500">Fuel litres</p>
            <p className="text-navy">{selected.fuelLitres || 0}</p>
            <p className="text-slate-500">Maintenance cost</p>
            <p className="text-navy">{formatTzs(selected.maintenanceCost)}</p>
            <p className="text-slate-500">Total transport cost</p>
            <p className="text-navy">{formatTzs(selected.fuelCost + selected.maintenanceCost)}</p>
          </div>
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
