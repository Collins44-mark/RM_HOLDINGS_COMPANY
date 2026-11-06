export function businessDate(timeZone = "Africa/Dar_es_Salaam", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function stayLength(arrivedOn: string, today = businessDate()) {
  const start = parts(arrivedOn);
  const end = parts(today);
  if (!start || !end) return "";
  let years = end.year - start.year;
  let months = end.month - start.month;
  let days = end.day - start.day;
  if (days < 0) {
    months -= 1;
    days += daysInMonth(end.month === 1 ? end.year - 1 : end.year, end.month === 1 ? 12 : end.month - 1);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || (years === 0 && months === 0 && days < 0)) return "Not yet arrived";
  const labels: string[] = [];
  if (years) labels.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) labels.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (!years && !months) return days <= 0 ? "Arrived today" : `${days} ${days === 1 ? "day" : "days"}`;
  return labels.join(" ");
}
