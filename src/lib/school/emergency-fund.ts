import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import type { SchoolEmergencyFundEntry } from "@/lib/school/store-types";

export const EMERGENCY_FUND_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "custom", label: "Custom Date Range" },
];

export function parseEmergencyFundPeriod(value: string | undefined): ReportPeriod {
  const period = parseReportPeriod(value);
  if (period === "today" || period === "this-week" || period === "this-month" || period === "custom") return period;
  return "this-month";
}

export function emergencyFundPeriodBounds(input: { period?: string; from?: string; to?: string }) {
  const period = parseEmergencyFundPeriod(input.period);
  const custom = period === "custom" ? { from: String(input.from ?? "").trim(), to: String(input.to ?? "").trim() } : undefined;
  const range = reportPeriodRange(period === "custom" && (!custom?.from || !custom?.to) ? "this-month" : period, new Date(), custom);
  const resolved = period === "custom" && (!custom?.from || !custom?.to) ? ("this-month" as ReportPeriod) : period;
  const from = localDate(range.from);
  const to = localDate(range.to);
  return { period: resolved, from, to, label: range.label };
}

function localDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fundEntryKindLabel(kind: SchoolEmergencyFundEntry["kind"]) {
  if (kind === "OPENING") return "Opening balance";
  if (kind === "REPLENISH") return "Replenishment";
  return "Expenditure";
}

export function emergencyFundRunningBalances(entries: SchoolEmergencyFundEntry[]) {
  const chrono = [...entries].sort((a, b) => {
    const date = a.occurredOn.localeCompare(b.occurredOn);
    if (date) return date;
    return a.createdAt.localeCompare(b.createdAt);
  });
  let running = 0;
  const map = new Map<string, number>();
  for (const entry of chrono) {
    if (entry.isActive) {
      running += entry.kind === "SPEND" ? -entry.amount : entry.amount;
    }
    map.set(entry.id, running);
  }
  return map;
}

export function filterEmergencyFundHistory(entries: SchoolEmergencyFundEntry[], from: string, to: string) {
  return entries.filter((entry) => entry.kind === "OPENING" || (entry.occurredOn >= from && entry.occurredOn <= to));
}

export function emergencyFundPeriodTotals(entries: SchoolEmergencyFundEntry[], from: string, to: string) {
  let before = 0;
  let added = 0;
  let spent = 0;
  for (const entry of entries) {
    if (!entry.isActive) continue;
    const credit = entry.kind === "SPEND" ? 0 : entry.amount;
    const debit = entry.kind === "SPEND" ? entry.amount : 0;
    if (entry.occurredOn < from) {
      before += credit - debit;
    } else if (entry.occurredOn >= from && entry.occurredOn <= to) {
      added += credit;
      spent += debit;
    }
  }
  return { openingBalance: before, added, spent, closingBalance: before + added - spent };
}
