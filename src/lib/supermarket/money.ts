/** Integer-cent helpers so reconciliation never uses floating-point money. */

const CENTS_SCALE = 100;

export function moneyToCents(value: unknown): number {
  if (value == null || value === "") return 0;
  const raw = String(value).trim().replace(/,/g, "");
  if (!raw || raw === "-" || raw === "." || raw === "-.") return 0;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart = "0", fractionPart = ""] = unsigned.split(".");
  const whole = Number.parseInt(wholePart || "0", 10);
  const frac = Number.parseInt((fractionPart + "00").slice(0, 2), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return 0;
  const cents = whole * CENTS_SCALE + frac;
  return negative ? -cents : cents;
}

export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.trunc(abs / CENTS_SCALE);
  const frac = abs % CENTS_SCALE;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

export function addCents(...values: number[]) {
  return values.reduce((sum, value) => sum + Math.trunc(value), 0);
}

export function variancePercent(actualCents: number, expectedCents: number) {
  if (expectedCents === 0) return actualCents === 0 ? 0 : 100;
  return Number(((actualCents - expectedCents) * 10000) / expectedCents) / 100;
}
