import { getFarmOverviewAction } from "@/actions/farm/overview";
import { FarmOverviewPage } from "@/components/farm/FarmOverviewPage";
import { parseReportPeriod, reportPeriodRange } from "@/lib/data/report-period";

export const metadata = { title: "Farm & Tractor Services" };
export const dynamic = "force-dynamic";

export default async function FarmHomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(params.period ?? "this-month");
  const range = reportPeriodRange(period, new Date(), { from: params.from, to: params.to });
  const result = await getFarmOverviewAction({ period, from: params.from, to: params.to });
  return (
    <FarmOverviewPage
      overview={result.ok ? result.overview : null}
      period={period}
      periodLabel={range.label}
      error={result.ok ? null : result.error}
    />
  );
}
