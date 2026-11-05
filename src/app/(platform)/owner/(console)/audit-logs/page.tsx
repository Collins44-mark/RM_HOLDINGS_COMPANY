import Link from "next/link";
import { AuditLogFiltersBar } from "@/components/audit/AuditLogFilters";
import { AuditLogDetailsButton } from "@/components/audit/AuditLogDetailsButton";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { requirePermission } from "@/lib/auth/session";
import { auditPeriodWindow, parseAuditPeriod } from "@/lib/audit-period";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_PAGE_SIZES,
  formatAuditAction,
  auditModuleLabel,
  listAuditLogs,
  parseAuditPageSize,
  type AuditLogFilters,
  type AuditSeverity,
} from "@/lib/data/audit-logs";
import { formatDateTime } from "@/lib/format/datetime";
import { getTranslator } from "@/lib/i18n/server";
import { cn } from "@/lib/cn";

export const metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

function severityClass(severity: AuditSeverity) {
  if (severity === "high") return "bg-[#f8eaea] text-[#b42318]";
  if (severity === "medium") return "bg-[#f8efd8] text-[#b0892e]";
  return "bg-[#e7f4ea] text-[#3f8a5a]";
}

function hrefWith(params: Record<string, string | undefined>, page?: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page && page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/owner/audit-logs?${qs}` : "/owner/audit-logs";
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    module?: string;
    action?: string;
    user?: string;
    severity?: string;
    period?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  await requirePermission("platform.audit.view");
  const t = await getTranslator();
  const params = await searchParams;
  const severity =
    params.severity === "low" || params.severity === "medium" || params.severity === "high"
      ? params.severity
      : undefined;
  const period = parseAuditPeriod(params.period);
  const window = auditPeriodWindow(period, params.from, params.to);
  const page = Math.max(1, Number(params.page || "1") || 1);
  const pageSize = parseAuditPageSize(params.pageSize);
  const filters: AuditLogFilters = {
    query: params.q?.trim() || undefined,
    module: params.module || undefined,
    action: params.action || undefined,
    actorUserId: params.user || undefined,
    severity,
    from: period === "custom" && !(params.from && params.to && params.from <= params.to) ? undefined : window.from,
    to: period === "custom" && !(params.from && params.to && params.from <= params.to) ? undefined : window.to,
    page,
    pageSize,
  };
  const data = await listAuditLogs(filters);
  const base = {
    q: filters.query,
    module: filters.module,
    action: filters.action,
    user: filters.actorUserId,
    severity: filters.severity,
    period,
    from: params.from,
    to: params.to,
    pageSize: pageSize === AUDIT_PAGE_SIZE ? undefined : String(pageSize),
  };
  const pageCount = Math.max(1, Math.ceil(data.total / pageSize));
  const pages = pageNumbers(page, pageCount);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.description")}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryCard label="Total Events" value={String(data.total)} />
        <SummaryCard label="Unique Users" value={String(data.uniqueActors)} />
        <SummaryCard label="Modules" value={String(data.uniqueModules)} />
        <SummaryCard
          label="Latest Event"
          value={data.latestAt ? formatDateTime(new Date(data.latestAt)) : "—"}
        />
      </div>

      <AuditLogFiltersBar
        query={filters.query ?? ""}
        module={filters.module ?? ""}
        action={filters.action ?? ""}
        user={filters.actorUserId ?? ""}
        severity={filters.severity ?? ""}
        period={period}
        from={params.from ?? ""}
        to={params.to ?? ""}
        pageSize={pageSize}
        modules={data.modules.map((module) => ({ value: module, label: auditModuleLabel(module) }))}
        actions={data.actions.map((action) => ({ value: action, label: formatAuditAction(action) }))}
        actors={data.actors.map((actor) => ({ value: actor.id, label: actor.name }))}
      />

      <Surface className="overflow-x-auto">
        {data.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/5 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Module</th>
                <th className="px-5 py-3 font-medium">Details</th>
                <th className="px-5 py-3 font-medium">Severity</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((log) => (
                <tr key={log.id} className="border-b border-black/4 last:border-0">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-navy">{log.actorName}</p>
                    {log.actorEmail ? <p className="text-[12px] text-slate-500">{log.actorEmail}</p> : null}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{formatAuditAction(log.action)}</td>
                  <td className="px-5 py-3.5 text-slate-600">{auditModuleLabel(log.module)}</td>
                  <td className="max-w-sm px-5 py-3.5 text-slate-600">{log.description}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize",
                        severityClass(log.severity),
                      )}
                    >
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <AuditLogDetailsButton event={log} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      {data.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
          <p>
            Page {Math.min(data.page, pageCount)} of {pageCount}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-medium text-slate-400">Rows</span>
            {AUDIT_PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={hrefWith({ ...base, pageSize: size === AUDIT_PAGE_SIZE ? undefined : String(size) })}
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] px-2 font-medium",
                  size === pageSize ? "bg-[#0b2244] text-white" : "text-navy hover:bg-white",
                )}
              >
                {size}
              </Link>
            ))}
            {pageCount > 1 && data.page > 1 ? (
              <Link href={hrefWith(base, data.page - 1)} className="rounded-[10px] px-3 py-1.5 font-medium text-navy hover:bg-white">
                Previous
              </Link>
            ) : null}
            {pages.map((item, index) =>
              item === "gap" ? (
                <span key={`gap-${index}`} className="px-1">
                  …
                </span>
              ) : (
                <Link
                  key={item}
                  href={hrefWith(base, item)}
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] px-2 font-medium",
                    item === data.page ? "bg-[#0b2244] text-white" : "text-navy hover:bg-white",
                  )}
                >
                  {item}
                </Link>
              ),
            )}
            {pageCount > 1 && data.page < pageCount ? (
              <Link href={hrefWith(base, data.page + 1)} className="rounded-[10px] px-3 py-1.5 font-medium text-navy hover:bg-white">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pageNumbers(current: number, count: number) {
  const pages = new Set([1, count, current - 1, current, current + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);
  const items: Array<number | "gap"> = [];
  for (const page of ordered) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) items.push("gap");
    items.push(page);
  }
  return items;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-3">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
    </div>
  );
}
