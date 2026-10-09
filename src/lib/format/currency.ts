import { APP_CURRENCY } from "@/lib/config/app";
import { getRuntimeCurrency } from "@/lib/config/runtime-settings";

const formatter = new Intl.NumberFormat("en-TZ", {
  maximumFractionDigits: 0,
});

export function formatTzs(amount: number) {
  const currency = getRuntimeCurrency() || APP_CURRENCY;
  return `${currency} ${formatter.format(Math.round(amount))}`;
}

export function formatAmount(amount: number) {
  return formatter.format(Math.round(amount));
}

export function asNumber(value: { toString(): string } | number | string | null | undefined) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}
