import { parseReportPeriod, type ReportPeriod } from "@/lib/data/report-period";

/** First day of the imported Chita cash book. Opening Farm history starts here. */
export const FARM_HISTORY_FROM = "2025-12-01";

export function calendarToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function farmOpeningWindow(
  params: { period?: string; from?: string; to?: string },
  now = new Date(),
): { period: ReportPeriod; from: string; to: string; redirect: boolean } {
  if (!params.period) {
    return {
      period: "custom",
      from: params.from || FARM_HISTORY_FROM,
      to: params.to || calendarToday(now),
      redirect: true,
    };
  }
  return {
    period: parseReportPeriod(params.period),
    from: params.from ?? "",
    to: params.to ?? "",
    redirect: false,
  };
}

/** Text safe to place inside a PostgREST ilike filter. */
export function farmSearchNeedle(raw: string) {
  return raw.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").slice(0, 80).trim();
}
