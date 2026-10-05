import { APP_CURRENCY, APP_NAME, APP_TIMEZONE } from "@/lib/config/app";

export const ORGANIZATION_SETTINGS_ID = 1;

export const CURRENCY_OPTIONS = [
  { code: "TZS", label: "TZS — Tanzanian Shilling (TSh)" },
  { code: "USD", label: "USD — US Dollar (USD)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "KES", label: "KES — Kenyan Shilling (KSh)" },
] as const;

export type SupportedCurrency = (typeof CURRENCY_OPTIONS)[number]["code"];

export const TIMEZONE_OPTIONS = [
  "Africa/Dar_es_Salaam",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Addis_Ababa",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "America/New_York",
] as const;

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return CURRENCY_OPTIONS.some((option) => option.code === value);
}

export function isValidIanaTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function timezoneOptionLabel(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const abbr = parts.find((part) => part.type === "timeZoneName")?.value;
    return abbr ? `${timeZone} (${abbr})` : timeZone;
  } catch {
    return timeZone;
  }
}

export function currencyOptionLabel(code: string) {
  return CURRENCY_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

export const DEFAULT_ORGANIZATION_SETTINGS = {
  organisationName: APP_NAME,
  timezone: APP_TIMEZONE,
  currency: APP_CURRENCY,
  language: "en" as const,
};
