import { BarChart3, Link2, Wallet } from "lucide-react";
import { OverviewPeriodSelector } from "@/components/dashboard/OverviewPeriodSelector";
import { OverviewSummaryCard, PercentMark } from "@/components/dashboard/OverviewSummaryCard";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { FinanceDelta } from "@/lib/data/finance";
import type { ReportPeriod } from "@/lib/data/report-period";

export function GroupOverviewSection({
  totals,
  comparison,
  comparisonLabel,
  period,
  label,
}: {
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
  comparison: FinanceDelta;
  comparisonLabel: string;
  period: ReportPeriod;
  label: string;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">Group Overview</h2>
          <p className="mt-1 text-[13.5px] leading-5 text-slate-500">
            Consolidated performance across all RM Holdings business units.
          </p>
        </div>
        <OverviewPeriodSelector period={period} label={label} />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        <OverviewSummaryCard
          label="Total Revenue"
          value={formatTzs(totals.revenue)}
          delta={comparison.revenue}
          comparisonLabel={comparisonLabel}
          icon={BarChart3}
        />
        <OverviewSummaryCard
          label="Total Expenses"
          value={formatTzs(totals.expenses)}
          delta={comparison.expenses}
          comparisonLabel={comparisonLabel}
          invertDelta
          icon={Wallet}
        />
        <OverviewSummaryCard
          label="Operating Position"
          value={formatTzs(totals.operatingPosition)}
          delta={comparison.operatingPosition}
          comparisonLabel={comparisonLabel}
          icon={Link2}
        />
        <OverviewSummaryCard
          label="Profit Margin"
          value={formatPercent(totals.margin)}
          delta={comparison.margin}
          comparisonLabel={comparisonLabel}
          icon={PercentMark}
        />
      </div>
    </section>
  );
}
