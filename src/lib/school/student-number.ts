/** Display compact document numbers such as STU-002 or STF-003 without changing stored values. */
export function formatCompactDocumentNumber(value: string) {
  const next = String(value ?? "").trim();
  const match = next.match(/^([A-Za-z]+)-0*(\d+)$/);
  if (!match) return next;
  return `${match[1].toUpperCase()}-${match[2].padStart(3, "0")}`;
}

export function formatCompactStudentNumber(value: string) {
  return formatCompactDocumentNumber(value);
}

export function formatCompactStaffNumber(value: string) {
  return formatCompactDocumentNumber(value);
}
