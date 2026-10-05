import { BusinessPerformanceSection } from "@/components/dashboard/BusinessPerformanceSection";
import { BusinessSnapshot } from "@/components/dashboard/BusinessSnapshot";
import { GroupOverviewSection } from "@/components/dashboard/GroupOverviewSection";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import {
  getConsolidatedFinanceForReportPeriod,
  getExecutiveInsights,
} from "@/lib/data/finance";
import { parseReportPeriod } from "@/lib/data/report-period";
import { formatHeroDate, formatSnapshotUpdated } from "@/lib/format/datetime";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { getTranslator } from "@/lib/i18n/server";
import { greetingKeyForHour } from "@/lib/i18n";
import { getMorogoroWeather } from "@/lib/weather";

export const metadata = { title: "Owner Dashboard" };

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseReportPeriod(typeof params.period === "string" ? params.period : undefined);
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const [settings, t] = await Promise.all([getOrganizationSettings(), getTranslator()]);
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: settings.timezone,
    }).format(now),
  );
  const heroDate = formatHeroDate(now, settings.timezone);

  const [finance, weather] = await Promise.all([
    getConsolidatedFinanceForReportPeriod({ period, from, to, now }),
    getMorogoroWeather(),
  ]);

  const insights = getExecutiveInsights(finance.rows);

  return (
    <div className="space-y-6">
      <WelcomeBanner
        greeting={t(greetingKeyForHour(hour))}
        name="Owner"
        weekday={heroDate.weekday}
        date={heroDate.date}
        weather={weather}
      />
      <GroupOverviewSection
        totals={finance.totals}
        comparison={finance.comparison}
        comparisonLabel={finance.comparisonLabel}
        period={period}
        label={finance.label}
      />
      <BusinessPerformanceSection rows={finance.rows} />
      <BusinessSnapshot
        highestRevenue={insights.highestRevenue}
        highestMargin={insights.highestMargin}
        activeUnits={insights.activeUnits}
        configuredUnits={insights.configuredUnits}
        lastUpdated={formatSnapshotUpdated(now, settings.timezone)}
      />
    </div>
  );
}
