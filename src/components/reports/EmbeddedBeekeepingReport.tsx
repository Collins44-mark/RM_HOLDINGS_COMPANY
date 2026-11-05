import Link from "next/link";
import { listBeekeepingDirectory } from "@/lib/beekeeping/directory";
import { buildBeeReport } from "@/lib/beekeeping/reports";
import { reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { PagedReportTable } from "@/components/ui/PagedReportTable";
import { ReportResultHeader, ReportSurface } from "@/components/reports/report-ui";

export async function EmbeddedBeekeepingReport({
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
  const range = reportPeriodRange(period, new Date(), { from, to });
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const start = iso(range.from);
  const end = iso(range.to);
  const directory = await listBeekeepingDirectory();
  const report = buildBeeReport(reportId, directory, start, end);
  const pdf = `/api/beekeeping/reports/pdf?report=${encodeURIComponent(reportId)}&from=${start}&to=${end}&period=${encodeURIComponent(range.label)}`;
  return (
    <ReportSurface className="space-y-4 p-5">
      <ReportResultHeader moduleLabel="Beekeeping" title={report.title} description={`${range.label}: ${start} to ${end}`} />
      <div className="flex flex-wrap gap-3 text-sm">
        {report.totals.map((total) => <span key={total.label} className="rounded-full bg-slate-50 px-3 py-1">{total.label}: {total.value}</span>)}
        <Link href={pdf} className="rounded-full bg-[#0b2244] px-3 py-1 font-semibold text-white">Download PDF</Link>
      </div>
      <PagedReportTable columns={report.columns} rows={report.rows} resetKey={`${reportId}|${start}|${end}`} />
    </ReportSurface>
  );
}
