import { businessToday } from "@/lib/beekeeping/constants";

export type BeePeriod = "month" | "last" | "year" | "custom";

export function beePeriodWindow(period: string, from?: string, to?: string) {
  const today = businessToday();
  const [year, month] = today.split("-").map(Number);
  if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: "This Year" };
  if (period === "last") {
    const start = new Date(Date.UTC(year, month - 2, 1));
    const end = new Date(Date.UTC(year, month - 1, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: "Last Month" };
  }
  if (period === "custom" && from && to && from <= to) return { from, to, label: "Custom range" };
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from: start, to: end, label: "This Month" };
}

export function inWindow(date: string, from: string, to: string) {
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}
