"use client";

import { useRef, useState } from "react";
import { Route } from "lucide-react";
import {
  archiveTransportRouteAction,
  getTransportRoutesWorkspaceAction,
  saveTransportRouteAction,
  type TransportRoutesWorkspace,
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
import type { TransportCaps, TransportRouteRow } from "@/lib/school/transport-types";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";

const empty = { id: "", name: "", details: "", price: "", busId: "", isActive: true };

export function SchoolTransportRoutesPage({ initial }: { initial: TransportRoutesWorkspace }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [rows, setRows] = useState<TransportRouteRow[]>(ready ? initial.routes : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<TransportCaps | null>(ready ? initial.capabilities : null);
  const buses = ready ? initial.buses : [];
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);

  function load() {
    void getTransportRoutesWorkspaceAction().then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.routes);
      setPage(result.page);
      setCaps(result.capabilities);
    });
  }

  function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void saveTransportRouteAction(form).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      load();
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Routes</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Configure school transport routes and prices.</p>
        </div>
        {caps?.canManageRoutes ? (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setForm(empty);
              setSaved(false);
              setOpen(true);
            }}
          >
            + Add Route
          </button>
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {rows.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Route} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No transport routes configured yet.</h2>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Route", "Price", "Bus", "Driver", "Status", ""].map((heading) => (
                    <th key={heading || "actions"} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">
                      {row.name}
                      {row.details ? <span className="block text-[12px] font-normal text-slate-500">{row.details}</span> : null}
                    </td>
                    <td className="px-4 py-3">{formatTzs(row.price)}</td>
                    <td className="px-4 py-3">{row.busRegistration || "—"}</td>
                    <td className="px-4 py-3">{row.driverName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      {caps?.canManageRoutes ? (
                        <CompactActionsMenu
                          ariaLabel={`${row.name} actions`}
                          items={[
                            {
                              label: "Edit",
                              onSelect: () => {
                                setForm({
                                  id: row.id,
                                  name: row.name,
                                  details: row.details,
                                  price: String(row.price),
                                  busId: row.busId ?? "",
                                  isActive: row.isActive,
                                });
                                setSaved(false);
                                setOpen(true);
                              },
                            },
                            {
                              label: row.isActive ? "Deactivate" : "Activate",
                              onSelect: () => {
                                void archiveTransportRouteAction(row.id, !row.isActive).then((result) => {
                                  if (!result.ok) setError(result.error);
                                  else load();
                                });
                              },
                            },
                          ]}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={() => load()} />
        </section>
      )}
      {open ? (
        <ContainedDrawer
          title={form.id ? "Edit route" : "Add route"}
          onClose={() => setOpen(false)}
          busy={busy}
          footer={
            <>
              <DrawerCancel disabled={busy} />
              <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save Route" onClick={save} />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Route name</span>
              <input className={inputClass} value={form.name} onChange={(event) => setForm((p) => ({ ...p, name: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Pickup / drop-off details</span>
              <input className={inputClass} value={form.details} onChange={(event) => setForm((p) => ({ ...p, details: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Price</span>
              <input className={inputClass} inputMode="decimal" value={form.price} onChange={(event) => setForm((p) => ({ ...p, price: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Assigned bus</span>
              <select className={inputClass} value={form.busId} onChange={(event) => setForm((p) => ({ ...p, busId: event.target.value }))}>
                <option value="">None</option>
                {buses.filter((row) => row.isActive || row.id === form.busId).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.registrationNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13.5px] text-navy">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((p) => ({ ...p, isActive: event.target.checked }))} />
              Active
            </label>
          </div>
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
