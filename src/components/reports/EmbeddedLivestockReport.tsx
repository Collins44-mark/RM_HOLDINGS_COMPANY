import Link from "next/link";
import { listLivestockDirectory } from "@/lib/livestock/directory";
import { buildLivestockReport } from "@/lib/livestock/reports";
import { reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { PagedReportTable } from "@/components/ui/PagedReportTable";
import { ReportResultHeader, ReportSurface } from "@/components/reports/report-ui";

export async function EmbeddedLivestockReport({ reportId, period, from, to }: { reportId: string; period: ReportPeriod; from?: string; to?: string }) {
  const range = reportPeriodRange(period, new Date(), { from, to });
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const start = iso(range.from);
  const end = iso(range.to);
  const directory = await listLivestockDirectory();
  const report = buildLivestockReport(reportId, directory, start, end);
  const pdf = `/api/livestock/reports/pdf?report=${encodeURIComponent(reportId)}&from=${start}&to=${end}&period=${encodeURIComponent(range.label)}`;
  return (
    <ReportSurface className="space-y-4 p-5">
      <ReportResultHeader moduleLabel="Livestock Farm" title={report.title} description={`${range.label}: ${start} to ${end}`} />
      {directory.error ? <p className="text-sm text-rose-700">{directory.error}</p> : null}
      <div className="flex flex-wrap gap-3 text-sm">
        {report.totals.map((total) => <span key={total.label} className="rounded-full bg-slate-50 px-3 py-1">{total.label}: {total.value}</span>)}
        <Link href={pdf} className="rounded-full bg-[#0b2244] px-3 py-1 font-semibold text-white">Download PDF</Link>
        <Link href={`/livestock/reports`} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-[#0b2244]">Open livestock reports</Link>
      </div>
      <PagedReportTable columns={report.columns} rows={report.rows} resetKey={`${reportId}|${start}|${end}`} />
    </ReportSurface>
  );
}
