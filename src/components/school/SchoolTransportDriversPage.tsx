"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import {
  assignTransportDriverAction,
  endTransportDriverAssignmentAction,
  listTransportDriversAction,
  type TransportDriversWorkspace,
} from "@/actions/school/transport";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import type { TransportCaps, TransportDriverRow } from "@/lib/school/transport-types";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { formatCompactStaffNumber } from "@/lib/school/student-number";

export function SchoolTransportDriversPage({ initial }: { initial: TransportDriversWorkspace }) {
  const ready = initial.ok;
  const [error, setError] = useState<string | null>(ready ? null : initial.error);
  const [rows, setRows] = useState<TransportDriverRow[]>(ready ? initial.drivers : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready ? initial.page : schoolPageMeta(1, 0));
  const [caps, setCaps] = useState<TransportCaps | null>(ready ? initial.capabilities : null);
  const buses = ready ? initial.buses : [];
  const staff = ready ? initial.staff : [];
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [busId, setBusId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);

  function load(nextPage: number) {
    void listTransportDriversAction({ page: nextPage }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.drivers);
      setPage(result.page);
      setCaps(result.capabilities);
    });
  }

  function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    void assignTransportDriverAction({ staffId, busId }).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      load(1);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Drivers</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Assign school staff to buses.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps?.canManageStaff ? (
            <Link href="/school/staff/new" className={secondaryButton}>
              + Add Staff
            </Link>
          ) : null}
          {caps?.canManageDrivers ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setStaffId("");
                setBusId("");
                setSaved(false);
                setOpen(true);
              }}
            >
              + Assign Driver
            </button>
          ) : null}
        </div>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {rows.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={User} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No drivers assigned yet.</h2>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Driver", "Assigned Bus", "Status", ""].map((heading) => (
                    <th key={heading || "actions"} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.assignmentId} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-semibold">
                      {row.staffName}
                      <span className="block text-[12px] font-normal text-slate-500">{formatCompactStaffNumber(row.staffNumber)}</span>
                    </td>
                    <td className="px-4 py-3">{row.busRegistration}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      {caps?.canManageDrivers && row.isActive ? (
                        <CompactActionsMenu
                          ariaLabel={`${row.staffName} actions`}
                          items={[
                            {
                              label: "End assignment",
                              onSelect: () => {
                                void endTransportDriverAssignmentAction(row.assignmentId).then((result) => {
                                  if (!result.ok) setError(result.error);
                                  else load(page.page);
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
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next)} />
        </section>
      )}
      {open ? (
        <ContainedDrawer
          title="Assign driver"
          subtitle="Select an existing staff record and an active bus."
          onClose={() => setOpen(false)}
          busy={busy}
          footer={
            <>
              <DrawerCancel disabled={busy} />
              <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Assign" onClick={save} />
            </>
          }
        >
          <div className="space-y-3 pb-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Staff</span>
              <select className={inputClass} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                <option value="">Select staff</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {formatCompactStaffNumber(row.staffNumber)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Bus</span>
              <select className={inputClass} value={busId} onChange={(event) => setBusId(event.target.value)}>
                <option value="">Select bus</option>
                {buses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.registrationNumber}
                    {row.name ? ` · ${row.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </ContainedDrawer>
      ) : null}
    </div>
  );
}
