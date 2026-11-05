"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auditPeriodWindow, type AuditPeriod } from "@/lib/audit-period";

type Option = { value: string; label: string };

export function AuditLogFiltersBar({
  query,
  module,
  action,
  user,
  severity,
  period,
  from,
  to,
  pageSize,
  modules,
  actions,
  actors,
}: {
  query: string;
  module: string;
  action: string;
  user: string;
  severity: string;
  period: AuditPeriod;
  from: string;
  to: string;
  pageSize: number;
  modules: Option[];
  actions: Option[];
  actors: Option[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  useEffect(() => {
    setSearch(query);
  }, [query]);

  function push(next: {
    q?: string;
    module?: string;
    action?: string;
    user?: string;
    severity?: string;
    period?: AuditPeriod;
    from?: string;
    to?: string;
  }) {
    const nextPeriod = next.period ?? period;
    const params = new URLSearchParams();
    const q = (next.q ?? search).trim();
    const moduleValue = next.module ?? module;
    const actionValue = next.action ?? action;
    const userValue = next.user ?? user;
    const severityValue = next.severity ?? severity;
    if (q) params.set("q", q);
    if (moduleValue) params.set("module", moduleValue);
    if (actionValue) params.set("action", actionValue);
    if (userValue) params.set("user", userValue);
    if (severityValue) params.set("severity", severityValue);
    params.set("period", nextPeriod);
    if (nextPeriod === "custom") {
      const start = next.from ?? customFrom;
      const end = next.to ?? customTo;
      if (start && end && start <= end) {
        params.set("from", start);
        params.set("to", end);
      }
    }
    if (pageSize && pageSize !== 25) params.set("pageSize", String(pageSize));
    router.replace(`/owner/audit-logs?${params.toString()}`);
  }

  useEffect(() => {
    if (search.trim() === query) return;
    const timer = window.setTimeout(() => push({ q: search }), 300);
    return () => window.clearTimeout(timer);
    // push reads the latest filter values on each keystroke pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const field = "h-10 w-[11.75rem] max-w-full rounded-[12px] border border-black/[0.06] bg-white px-3 text-[13px] text-navy outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search"
        className={field}
        aria-label="Search audit logs"
      />
      <select value={module} onChange={(event) => push({ module: event.target.value })} className={field} aria-label="Module">
        <option value="">All modules</option>
        {modules.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select value={action} onChange={(event) => push({ action: event.target.value })} className={field} aria-label="Action">
        <option value="">All actions</option>
        {actions.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select value={user} onChange={(event) => push({ user: event.target.value })} className={field} aria-label="User">
        <option value="">All users</option>
        {actors.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select value={severity} onChange={(event) => push({ severity: event.target.value })} className={field} aria-label="Severity">
        <option value="">All severities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <select
        value={period}
        onChange={(event) => {
          const next = event.target.value as AuditPeriod;
          if (next !== "custom") {
            const window = auditPeriodWindow(next);
            push({ period: next, from: window.from, to: window.to });
            return;
          }
          push({ period: "custom", from: customFrom, to: customTo });
        }}
        className={field}
        aria-label="Period"
      >
        <option value="today">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="year">This Year</option>
        <option value="custom">Custom range</option>
      </select>
      {period === "custom" ? (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(event) => {
              setCustomFrom(event.target.value);
              push({ period: "custom", from: event.target.value, to: customTo });
            }}
            className={field}
            aria-label="From date"
          />
          <input
            type="date"
            value={customTo}
            onChange={(event) => {
              setCustomTo(event.target.value);
              push({ period: "custom", from: customFrom, to: event.target.value });
            }}
            className={field}
            aria-label="To date"
          />
        </>
      ) : null}
    </div>
  );
}
