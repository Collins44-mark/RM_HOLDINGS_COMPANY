export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function ratioPercent(part: number, whole: number) {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}
