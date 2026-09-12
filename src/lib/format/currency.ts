import { APP_CURRENCY } from "@/lib/config/app";

const formatter = new Intl.NumberFormat("en-TZ", {
  maximumFractionDigits: 0,
});

export function formatTzs(amount: number) {
  return `${APP_CURRENCY} ${formatter.format(Math.round(amount))}`;
}

export function asNumber(value: { toString(): string } | number | string | null | undefined) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}
