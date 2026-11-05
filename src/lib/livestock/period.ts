function shiftMonth(iso: string, months: number) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

export function livestockPeriod(period: string, from?: string, to?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  if (period === "year") return { from: `${year}-01-01`, to: today, label: "This Year" };
  if (period === "quarter") return { from: shiftMonth(`${today.slice(0, 8)}01`, -2), to: today, label: "Last 3 Months" };
  if (period === "custom" && from && to && from <= to) return { from, to, label: "Custom range" };
  return { from: `${today.slice(0, 8)}01`, to: today, label: "This Month" };
}

export function inLivestockWindow(date: string, from: string, to: string) {
  const day = String(date || "").slice(0, 10);
  return day >= from && day <= to;
}
