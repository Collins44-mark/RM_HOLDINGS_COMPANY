export type AuditPeriod = "today" | "week" | "month" | "year" | "custom";

export function parseAuditPeriod(value: string | undefined): AuditPeriod {
  if (value === "today" || value === "week" || value === "month" || value === "year" || value === "custom") {
    return value;
  }
  return "month";
}

function darDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(now);
}

function shift(iso: string, days: number) {
  const [year, month, date] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function auditPeriodWindow(period: AuditPeriod, from?: string, to?: string, now = new Date()) {
  const today = darDate(now);
  if (period === "today") return { from: today, to: today, label: "Today" };
  if (period === "week") {
    const [year, month, date] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
    const start = shift(today, -((weekday + 6) % 7));
    return { from: start, to: today, label: "This Week" };
  }
  if (period === "year") {
    return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "This Year" };
  }
  if (period === "custom" && from && to && from <= to) {
    return { from, to, label: "Custom range" };
  }
  return { from: `${today.slice(0, 8)}01`, to: today, label: "This Month" };
}
