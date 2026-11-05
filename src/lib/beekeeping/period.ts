import { businessToday } from "@/lib/beekeeping/constants";

export type BeePeriod = "month" | "week" | "year" | "custom";

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function beePeriodWindow(period: string, from?: string, to?: string) {
  const today = businessToday();
  const [year, month, day] = today.split("-").map(Number);
  if (period === "today") return { from: today, to: today, label: "Today" };
  if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: "This Year" };
  if (period === "week") {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const back = weekday === 0 ? 6 : weekday - 1;
    const start = shift(today, -back);
    return { from: start, to: shift(start, 6), label: "This Week" };
  }
  if (period === "custom" && from && to && from <= to) return { from, to, label: "Custom range" };
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = shift(`${year}-${String(month).padStart(2, "0")}-01`, new Date(Date.UTC(year, month, 0)).getUTCDate() - 1);
  return { from: start, to: end, label: "This Month" };
}

export function inWindow(date: string, from: string, to: string) {
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}
