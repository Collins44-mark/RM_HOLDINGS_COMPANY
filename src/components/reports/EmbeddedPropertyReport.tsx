import Link from "next/link";
import { ReportDataTable, ReportEmptyState, ReportResultHeader, ReportSurface } from "@/components/reports/report-ui";
import { requireAuth } from "@/lib/auth/session";
import { reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { buildPropertyReport } from "@/lib/property/report-query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function EmbeddedPropertyReport({
  reportId,
  period,
  from,
  to,
}: {
  reportId: string;
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const [, moduleId, typeId] = reportId.split(":");
  const range = reportPeriodRange(period, new Date(), { from, to });
  const start = iso(range.from);
  const end = iso(range.to);
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin || !moduleId || !typeId) {
    return <ReportEmptyState title="Report could not be loaded" description="Property reports are temporarily unavailable." />;
  }
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) {
    return <ReportEmptyState title="Report could not be loaded" description={String(resolved.error || "Property reports are temporarily unavailable.")} />;
  }
  const result = await buildPropertyReport(
    admin,
    resolved.buId,
    { module: moduleId, report: typeId, from: start, to: end },
    user.name || "RM Holdings",
  );
  if ("error" in result) {
    return <ReportEmptyState title="Report could not be loaded" description={result.error} />;
  }
  const report = result.data;
  const pdf = `/api/property/reports/pdf?module=${encodeURIComponent(moduleId)}&report=${encodeURIComponent(typeId)}&from=${start}&to=${end}`;
  return (
    <ReportSurface className="space-y-4 p-5">
      <ReportResultHeader moduleLabel="Properties & Rentals" title={report.title} description={`${report.period}. ${report.filters}`} />
      <div className="flex flex-wrap gap-3 text-sm">
        {report.summary.map((total) => (
          <span key={total.label} className="rounded-full bg-slate-50 px-3 py-1">
            {total.label}: {total.value}
          </span>
        ))}
        <Link href={pdf} className="rounded-full bg-[#0b2244] px-3 py-1 font-semibold text-white">
          Download PDF
        </Link>
      </div>
      <ReportDataTable columns={report.columns} rows={report.rows} />
    </ReportSurface>
  );
}
