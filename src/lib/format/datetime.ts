import { APP_TIMEZONE } from "@/lib/config/app";
import { getRuntimeTimezone } from "@/lib/config/runtime-settings";

function zone(timeZone?: string) {
  return timeZone ?? getRuntimeTimezone() ?? APP_TIMEZONE;
}

export function zonedNow(timeZone?: string) {
  return new Date(new Date().toLocaleString("en-US", { timeZone: zone(timeZone) }));
}

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatLongDate(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: zone(timeZone),
  }).format(date);
}

export function formatHeroDate(date: Date, timeZone?: string) {
  const tz = zone(timeZone);
  return {
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: tz }).format(date),
    date: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(date),
  };
}

export function formatDateTime(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone(timeZone),
  }).format(date);
}

export function formatSnapshotUpdated(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone(timeZone),
  })
    .format(date)
    .replace(/\bSept\b/, "Sep")
    .replace(" at ", ", ");
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}
