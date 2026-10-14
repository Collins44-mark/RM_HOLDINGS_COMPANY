"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ConsoleLoading } from "@/components/layout/ConsoleLoading";
import { RiceOverviewPage } from "@/components/rice/RiceOverviewPage";
import { parseReportPeriod, reportPeriodRange } from "@/lib/data/report-period";
import { peekRiceOverview } from "@/lib/rice/overview-flash";

export default function Loading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === "/rice") {
    const snapshot = peekRiceOverview();
    const period = parseReportPeriod(searchParams.get("period") ?? snapshot?.period ?? "this-month");
    const range = reportPeriodRange(period, new Date(), {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    return (
      <RiceOverviewPage
        overview={snapshot?.overview ?? null}
        period={period}
        periodLabel={range.label}
        error={null}
        pending
      />
    );
  }
  return <ConsoleLoading />;
}
