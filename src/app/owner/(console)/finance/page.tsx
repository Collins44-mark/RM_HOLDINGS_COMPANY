import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { FinancePlaceholder } from "@/components/finance/FinancePlaceholder";
import { FinanceSummaryCards } from "@/components/finance/FinanceSummaryCards";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { FinancialPerformanceCard } from "@/components/finance/FinancialPerformanceCard";
import { getConsolidatedFinance, parseFinanceTab } from "@/lib/data/finance";
import { parsePeriod } from "@/lib/data/period";

export const metadata = { title: "Finance (Consolidated)" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(typeof params.period === "string" ? params.period : undefined);
  const tab = parseFinanceTab(params.tab);
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const finance = await getConsolidatedFinance({ period, from, to });

  return (
    <div className="space-y-6">
      <FinanceHeader
        period={period}
        label={finance.label}
        rows={finance.rows}
        totals={finance.totals}
      />
      <FinanceSummaryCards
        totals={finance.totals}
        comparison={finance.comparison}
        comparisonLabel={finance.comparisonLabel}
      />
      <FinanceTabs active={tab} />
      {tab === "trend" ? (
        <FinancePlaceholder
          title="Trend Analysis"
          description="Period comparisons will appear here as additional history is recorded. The consolidated view stays focused on the current operating position by business unit."
        />
      ) : null}
      {tab === "category" ? (
        <FinancePlaceholder
          title="Category Breakdown"
          description="Ledger categories remain inside each business module. This view will summarise those categories without adding charts to the consolidated finance page."
        />
      ) : null}
      {tab === "units" ? (
        <FinancialPerformanceCard rows={finance.rows} totals={finance.totals} />
      ) : null}
    </div>
  );
}
