import {
  reportPeriodRange,
  type ReportPeriod,
} from "@/lib/data/report-period";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Map Group Reports period model onto supermarket report action presets. */
export function reportPeriodToSalesInput(
  period: ReportPeriod,
  custom?: { from?: string; to?: string },
  now = new Date(),
): { preset: SalesPeriodPreset; range: SalesDateRange; label: string } {
  const resolved = reportPeriodRange(period, now, custom);
  const range = {
    from: formatLocalDate(resolved.from),
    to: formatLocalDate(resolved.to),
  };

  if (period === "today") return { preset: "today", range, label: resolved.label };
  if (period === "yesterday") return { preset: "yesterday", range, label: resolved.label };
  if (period === "this-week") return { preset: "week", range, label: resolved.label };
  if (period === "this-month") return { preset: "month", range, label: resolved.label };
  return { preset: "range", range, label: resolved.label };
}
