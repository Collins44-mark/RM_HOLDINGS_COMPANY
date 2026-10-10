import { getRiceOverviewAction } from "@/actions/rice/overview";
import { RiceOverviewPage } from "@/components/rice/RiceOverviewPage";
import { parseReportPeriod, reportPeriodRange } from "@/lib/data/report-period";

export const metadata = { title: "Rice Mill & Warehouse" };
export const dynamic = "force-dynamic";

export default async function RiceHomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const range = reportPeriodRange(period, new Date(), { from: params.from, to: params.to });
  const result = await getRiceOverviewAction({ period, from: params.from, to: params.to });
  return (
    <RiceOverviewPage
      overview={result.ok ? result.overview : null}
      period={period}
      periodLabel={range.label}
      error={result.ok ? null : result.error}
    />
  );
}
