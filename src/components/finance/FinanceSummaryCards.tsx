import { BarChart3, Coins, PieChart, Wallet } from "lucide-react";
import { FinanceSummaryCard } from "@/components/finance/FinanceSummaryCard";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { FinanceDelta } from "@/lib/data/finance";

export function FinanceSummaryCards({
  totals,
  comparison,
  comparisonLabel,
}: {
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
  comparison: FinanceDelta;
  comparisonLabel: string;
}) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4">
      <FinanceSummaryCard
        label="Total Revenue"
        value={formatTzs(totals.revenue)}
        delta={comparison.revenue}
        comparisonLabel={comparisonLabel}
        icon={BarChart3}
        surface="#f3f7fe"
        iconBg="#dce8fb"
        iconColor="#2f62c4"
      />
      <FinanceSummaryCard
        label="Total Expenses"
        value={formatTzs(totals.expenses)}
        delta={comparison.expenses}
        comparisonLabel={comparisonLabel}
        invertDelta
        icon={Wallet}
        surface="#fdf5f5"
        iconBg="#f8dfe0"
        iconColor="#c24646"
      />
      <FinanceSummaryCard
        label="Operating Position"
        value={formatTzs(totals.operatingPosition)}
        delta={comparison.operatingPosition}
        comparisonLabel={comparisonLabel}
        icon={Coins}
        surface="#f3f9f4"
        iconBg="#dcefe2"
        iconColor="#1f8a4c"
      />
      <FinanceSummaryCard
        label="Profit Margin"
        value={formatPercent(totals.margin)}
        delta={comparison.margin}
        comparisonLabel={comparisonLabel}
        icon={PieChart}
        surface="#f5f3fd"
        iconBg="#e6e1fb"
        iconColor="#6f5ee8"
      />
    </section>
  );
}
