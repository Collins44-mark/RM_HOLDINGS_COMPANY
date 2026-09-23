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
  // Freeze "now" to the calendar day so this-year / this-month bounds stay stable
  // across re-renders (avoids request-key churn from `new Date()`).
  const daySeed = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const controlledPeriod = useMemo(() => {
    const input = reportPeriodToSalesInput(period, { from, to }, new Date(`${daySeed}T12:00:00`));
    return { preset: input.preset, range: input.range };
  }, [period, from, to, daySeed]);

  // Stable key so React remounts only when the selected report/period changes —
  // not when the parent RSC re-renders with equivalent props.
  const mountKey = `${reportId}|${controlledPeriod.preset}|${controlledPeriod.range.from}|${controlledPeriod.range.to}`;

  if (reportId === "sm-sales") {
    return <SalesReportDetail key={mountKey} embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-purchases") {
    return <PurchaseReportDetail key={mountKey} embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-inventory") {
    return <InventoryReportDetail key={mountKey} embedded controlledPeriod={controlledPeriod} />;
  }
  if (reportId === "sm-profit-loss") {
    return <ProfitLossReportDetail key={mountKey} embedded controlledPeriod={controlledPeriod} />;
  }

  return null;
}
