"use client";

import { useMemo } from "react";
import { SalesReportDetail } from "@/components/supermarket/SalesReportDetail";
import { PurchaseReportDetail } from "@/components/supermarket/PurchaseReportDetail";
import { InventoryReportDetail } from "@/components/supermarket/InventoryReportDetail";
import { ProfitLossReportDetail } from "@/components/supermarket/ProfitLossReportDetail";
import type { ReportPeriod } from "@/lib/data/report-period";
import { reportPeriodToSalesInput } from "@/lib/reports/period-bridge";

/**
 * Client host that memoizes the workspace period and mounts the existing
 * Supermarket report detail components (no duplicate report implementations).
 */
export function EmbeddedSupermarketReport({
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
  const controlledPeriod = useMemo(() => {
    const input = reportPeriodToSalesInput(period, { from, to });
    return { preset: input.preset, range: input.range };
  }, [period, from, to]);

  if (reportId === "sm-sales") {
    return <SalesReportDetail embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-purchases") {
    return <PurchaseReportDetail embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-inventory") {
    return <InventoryReportDetail embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-profit-loss") {
    return <ProfitLossReportDetail embedded controlledPeriod={controlledPeriod} />;
  }

  return null;
}
