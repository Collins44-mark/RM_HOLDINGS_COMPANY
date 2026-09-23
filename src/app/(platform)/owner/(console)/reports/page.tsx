import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportSelectionBar } from "@/components/reports/ReportSelectionBar";
import { ReportResultRouter } from "@/components/reports/ReportResultRouter";
import { ReportSurface } from "@/components/reports/report-ui";
import {
  getConsolidatedReport,
  parseReportPeriod,
  reportPeriodRange,
} from "@/lib/data/reports";
import { formatHeroDate } from "@/lib/format/datetime";
import {
  parseReportId,
  parseReportModuleId,
} from "@/lib/reports/registry";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    module?: string;
    report?: string;
    period?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const moduleId = parseReportModuleId(params.module);
  const reportId = parseReportId(params.report, moduleId);
  const period = parseReportPeriod(params.period);
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const isDefaultLanding =
    params.module === undefined &&
    params.report === undefined &&
    params.view === undefined;
  const showResult = params.view === "1" || isDefaultLanding;

  const now = new Date();
  const periodMeta = reportPeriodRange(period, now, { from, to });
  const heroDate = formatHeroDate(now);

  const consolidated =
    showResult && moduleId === "group" && reportId
      ? await getConsolidatedReport({ period, from, to })
      : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Reports"
        description="Generate and download operational, financial and management reports for any business unit."
        action={
          <p className="rounded-full border border-white/70 bg-white/70 px-3.5 py-1.5 text-[12.5px] font-medium text-slate-500 shadow-[0_4px_14px_rgba(15,35,64,0.04)] backdrop-blur-xl">
            {heroDate.weekday}, {heroDate.date}
          </p>
        }
      />

      <Suspense
        fallback={
          <ReportSurface className="px-5 py-6 text-[13.5px] text-slate-500">
            Loading selectors…
          </ReportSurface>
        }
      >
        <ReportSelectionBar
          moduleId={moduleId}
          reportId={reportId}
          period={period}
          label={periodMeta.label}
        />
      </Suspense>

      <ReportResultRouter
        moduleId={moduleId}
        reportId={reportId}
        period={period}
        from={from}
        to={to}
        showResult={showResult}
        consolidated={consolidated}
      />
    </div>
  );
}
