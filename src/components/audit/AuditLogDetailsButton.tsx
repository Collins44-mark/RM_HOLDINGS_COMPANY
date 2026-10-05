"use client";

import { useState } from "react";
import { formatAuditAction, auditModuleLabel, type AuditLogRecord } from "@/lib/data/audit-logs";
import { formatDateTime } from "@/lib/format/datetime";
import { cn } from "@/lib/cn";

function severityClass(severity: AuditLogRecord["severity"]) {
  if (severity === "high") return "bg-[#f8eaea] text-[#b42318]";
  if (severity === "medium") return "bg-[#f8efd8] text-[#b0892e]";
  return "bg-[#e7f4ea] text-[#3f8a5a]";
}

export function AuditLogDetailsButton({ event }: { event: AuditLogRecord }) {
  const [open, setOpen] = useState(false);
  const metadataEntries = Object.entries(event.metadata).filter(
    ([, value]) => value !== undefined && value !== "",
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-navy hover:underline"
      >
        View
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:max-w-[560px] sm:rounded-[24px] sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy">Audit event</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-medium text-slate-500">
                Close
              </button>
            </div>
            <dl className="space-y-2.5 text-[13.5px]">
              <Row label="Action" value={formatAuditAction(event.action)} />
              <Row label="Event code" value={event.action} muted />
              <Row label="User" value={event.actorName} />
              <Row label="Module" value={auditModuleLabel(event.module)} />
              <Row label="Entity" value={event.entityType ?? "—"} />
              <Row label="Details" value={event.description} />
              <Row label="Severity" value={event.severity} />
              <Row label="Timestamp" value={formatDateTime(new Date(event.createdAt))} />
              <Row label="IP address" value={event.ipAddress ?? "—"} />
            </dl>
            {metadataEntries.length ? (
              <div className="mt-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Metadata</p>
                <ul className="mt-2 space-y-1 text-[13px] text-slate-600">
                  {metadataEntries.map(([key, value]) => (
                    <li key={key}>
                      <span className="text-slate-400">{key}: </span>
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className={cn("mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", severityClass(event.severity))}>
              {event.severity}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[140px_1fr] sm:gap-3">
      <dt className={muted ? "text-[12px] text-slate-400" : "text-slate-500"}>{label}</dt>
      <dd className={muted ? "break-words text-[12px] font-normal text-slate-400" : "break-words font-medium text-navy"}>
        {value}
      </dd>
    </div>
  );
}
