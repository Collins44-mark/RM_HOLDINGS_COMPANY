/** Display compact student numbers such as STU-002 without changing stored values. */
export function formatCompactStudentNumber(value: string) {
  const next = String(value ?? "").trim();
  const match = next.match(/^([A-Za-z]+)-0*(\d+)$/);
  if (!match) return next;
  return `${match[1].toUpperCase()}-${match[2].padStart(3, "0")}`;
}
