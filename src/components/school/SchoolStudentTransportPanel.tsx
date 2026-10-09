"use client";

import { useEffect, useState } from "react";
import { getStudentTransportWorkspaceAction, setStudentTransportAction } from "@/actions/school/transport-billing";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, secondaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import {
  isBillableTransportRoute,
  transportBillingFrequencyLabel,
  type StudentTransportWorkspace,
} from "@/lib/school/transport-types";

export function SchoolStudentTransportPanel({
  studentId,
  enrollmentId,
  initial,
}: {
  studentId: string;
  enrollmentId: string | null;
  initial: StudentTransportWorkspace | null;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [enabled, setEnabled] = useState(initial?.status === "active");
  const [routeId, setRouteId] = useState(initial?.assignment?.routeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initial || !enrollmentId) return;
    void getStudentTransportWorkspaceAction({ studentId, enrollmentId }).then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWorkspace(result.workspace);
      setEnabled(result.workspace.status === "active");
      setRouteId(result.workspace.assignment?.routeId ?? "");
    });
  }, [initial, studentId, enrollmentId]);

  if (!workspace || !enrollmentId) {
    return (
      <section className={`${glassPanel} space-y-2`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Transport</h2>
        <p className="text-[13.5px] text-slate-500">Transport can be assigned after the student has an active enrollment.</p>
      </section>
    );
  }

  const selected = workspace.routes.find((row) => row.id === routeId);
  const statusLabel = workspace.status === "active" ? "Active" : workspace.status === "inactive" ? "Inactive" : "Not Enrolled";

  function save(nextEnabled = enabled, nextRouteId = routeId) {
    setBusy(true);
    setSaved(false);
    void setStudentTransportAction({
      studentId,
      enrollmentId: enrollmentId!,
      enabled: nextEnabled,
      routeId: nextRouteId,
    }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setWorkspace(result.workspace);
      setEnabled(result.workspace.status === "active");
      setRouteId(result.workspace.assignment?.routeId ?? "");
      setSaved(true);
    });
  }

  return (
    <section className={`${glassPanel} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Transport</h2>
          <p className="mt-1 text-[13px] text-slate-500">Optional school bus service billed through the student fee account.</p>
        </div>
        <StatusPill value={statusLabel} />
      </div>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Assigned route" value={workspace.assignment?.routeName || "—"} />
        <Fact label="Route fare" value={workspace.assignment ? formatTzs(workspace.assignment.fare) : "—"} />
        <Fact label="Billing frequency" value={workspace.assignment ? transportBillingFrequencyLabel(workspace.assignment.billingFrequency) : "—"} />
        <Fact label="Current billing period" value={workspace.assignment?.billingPeriod || workspace.currentPeriod} />
        <Fact label="Transport billed" value={formatTzs(workspace.billed)} />
        <Fact label="Transport collected" value={formatTzs(workspace.collected)} />
        <Fact label="Outstanding transport" value={formatTzs(workspace.outstanding)} />
      </div>
      {workspace.canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-[13.5px] text-navy">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                const next = event.target.checked;
                setEnabled(next);
                setSaved(false);
                if (!next) save(false, routeId);
              }}
            />
            Enable School Transport
          </label>
          {enabled ? (
            <select
              className={`${inputClass} w-auto min-w-[14rem]`}
              value={routeId}
              onChange={(event) => {
                setRouteId(event.target.value);
                setSaved(false);
              }}
            >
              <option value="">Select route</option>
              {workspace.routes
                .filter((row) => row.billable || row.id === routeId)
                .map((row) => (
                  <option key={row.id} value={row.id} disabled={!isBillableTransportRoute(row) && row.id !== workspace.assignment?.routeId}>
                    {row.name} · {formatTzs(row.price)} · {transportBillingFrequencyLabel(row.billingFrequency)}
                  </option>
                ))}
            </select>
          ) : null}
          {enabled ? (
            <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save transport" onClick={() => save(true, routeId)} />
          ) : null}
        </div>
      ) : null}
      {selected && enabled ? (
        <p className="text-[13px] text-slate-500">
          Applicable charge: {formatTzs(selected.price)} {transportBillingFrequencyLabel(selected.billingFrequency).toLowerCase()}.
          {!selected.billable ? " This route cannot be billed until fare and frequency are configured." : ""}
        </p>
      ) : null}
      {workspace.charges.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] font-semibold text-slate-500">
                <th className="py-2 pr-3">Charge</th>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Billed</th>
                <th className="py-2 pr-3">Paid</th>
                <th className="py-2 pr-3">Outstanding</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {workspace.charges.map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="py-2 pr-3">{row.routeName}</td>
                  <td className="py-2 pr-3">{row.billingPeriod || transportBillingFrequencyLabel(row.billingFrequency)}</td>
                  <td className="py-2 pr-3">{formatTzs(row.amount)}</td>
                  <td className="py-2 pr-3">{formatTzs(row.paid)}</td>
                  <td className="py-2 pr-3">{formatTzs(row.outstanding)}</td>
                  <td className="py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13.5px] text-slate-500">No transport charges yet.</p>
      )}
      {workspace.history.length > 1 ? (
        <div>
          <p className="text-[12px] font-medium text-slate-500">Previous assignments</p>
          <ul className="mt-1 space-y-1 text-[13px] text-navy">
            {workspace.history
              .filter((row) => row.status !== "active")
              .map((row) => (
                <li key={row.id}>
                  {row.routeName} · {formatTzs(row.fare)} · {row.startedOn}
                  {row.endedOn ? ` – ${row.endedOn}` : ""}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {workspace.canManage && workspace.status === "active" ? (
        <button type="button" className={secondaryButton} onClick={() => save(false, routeId)}>
          Deactivate transport
        </button>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-navy">{value || "—"}</p>
    </div>
  );
}
