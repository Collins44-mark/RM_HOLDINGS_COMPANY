import Link from "next/link";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { AuditLogDetailsButton } from "@/components/audit/AuditLogDetailsButton";
import { requirePermission } from "@/lib/auth/session";
import {
  AUDIT_PAGE_SIZE,
  formatAuditAction,
  auditModuleLabel,
  listAuditLogs,
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
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requirePermission("platform.audit.view");
  const t = await getTranslator();
  const params = await searchParams;
  const severity =
    params.severity === "low" || params.severity === "medium" || params.severity === "high"
      ? params.severity
      : undefined;
  const page = Math.max(1, Number(params.page || "1") || 1);
  const filters: AuditLogFilters = {
    query: params.q?.trim() || undefined,
    module: params.module || undefined,
    action: params.action || undefined,
    actorUserId: params.user || undefined,
    severity,
    from: params.from || undefined,
    to: params.to || undefined,
    page,
  };
  const data = await listAuditLogs(filters);
  const base = {
    q: filters.query,
    module: filters.module,
    action: filters.action,
    user: filters.actorUserId,
    severity: filters.severity,
    from: filters.from,
    to: filters.to,
  };
  const pageCount = Math.max(1, Math.ceil(data.total / AUDIT_PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.description")}
      />

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <SummaryCard label="Total Events" value={String(data.total)} />
        <SummaryCard label="Unique Users" value={String(data.uniqueActors)} />
        <SummaryCard label="Modules" value={String(data.uniqueModules)} />
        <SummaryCard
          label="Latest Event"
          value={data.latestAt ? formatDateTime(new Date(data.latestAt)) : "—"}
        />
      </div>

      <form className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6" method="get">
        <input
          name="q"
          defaultValue={filters.query ?? ""}
          placeholder="Search"
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none"
        />
        <select
          name="module"
          defaultValue={filters.module ?? ""}
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
        >
          <option value="">All modules</option>
          {data.modules.map((module) => (
            <option key={module} value={module}>
              {auditModuleLabel(module)}
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={filters.action ?? ""}
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
        >
          <option value="">All actions</option>
          {data.actions.map((action) => (
            <option key={action} value={action}>
              {formatAuditAction(action)}
            </option>
          ))}
        </select>
        <select
          name="user"
          defaultValue={filters.actorUserId ?? ""}
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
        >
          <option value="">All users</option>
          {data.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={filters.severity ?? ""}
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] text-navy"
          />
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] text-navy"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white xl:col-span-6 xl:w-auto xl:justify-self-start"
        >
          Apply filters
        </button>
      </form>

      <Surface className="overflow-x-auto">
        {data.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/5 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Date & Time</th>
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
                  <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">
                    {formatDateTime(new Date(log.createdAt))}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-navy">{log.actorName}</td>
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

      {data.total > AUDIT_PAGE_SIZE ? (
        <div className="flex items-center justify-between text-[13px] text-slate-500">
          <p>
            Page {data.page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link href={hrefWith(base, data.page - 1)} className="font-medium text-navy hover:underline">
                Previous
              </Link>
            ) : null}
            {data.page < pageCount ? (
              <Link href={hrefWith(base, data.page + 1)} className="font-medium text-navy hover:underline">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-card px-4 py-4">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
    </div>
  );
}
