"use client";

import { useCallback, useEffect, useState } from "react";
import { FinanceCategoryTable } from "@/components/finance/FinanceCategoryTable";
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { FinanceSummaryCards } from "@/components/finance/FinanceSummaryCards";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { FinanceTrendTable } from "@/components/finance/FinanceTrendTable";
import { FinancialPerformanceCard } from "@/components/finance/FinancialPerformanceCard";
import type {
  FinanceCategoryRow,
  FinanceDelta,
  FinanceTab,
  FinanceTrendRow,
  UnitFinanceRow,
} from "@/lib/data/finance";
import type { ReportPeriod } from "@/lib/data/report-period";

export function FinanceWorkspace({
  period,
  label,
  initialTab,
  rows,
  totals,
  comparison,
  comparisonLabel,
  trend,
  trendGrain,
  categories,
}: {
  period: ReportPeriod;
  label: string;
  initialTab: FinanceTab;
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
  comparison: FinanceDelta;
  comparisonLabel: string;
  trend: FinanceTrendRow[];
  trendGrain: "month" | "day";
  categories: FinanceCategoryRow[];
}) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);

  const syncTab = useCallback((next: FinanceTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "units") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    const href = query ? `/owner/finance?${query}` : "/owner/finance";
    window.history.replaceState(window.history.state, "", href);
  }, []);

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("tab");
      setTab(raw === "trend" || raw === "category" ? raw : "units");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="space-y-6">
      <FinanceHeader period={period} label={label} tab={tab} rows={rows} totals={totals} />
      <FinanceSummaryCards
        totals={totals}
        comparison={comparison}
        comparisonLabel={comparisonLabel}
      />
      <FinanceTabs active={tab} onChange={syncTab} />
      {tab === "trend" ? <FinanceTrendTable rows={trend} grain={trendGrain} /> : null}
      {tab === "category" ? <FinanceCategoryTable rows={categories} /> : null}
      {tab === "units" ? <FinancialPerformanceCard rows={rows} totals={totals} /> : null}
    </div>
  );
}
