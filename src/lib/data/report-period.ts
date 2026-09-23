export type ReportPeriod =
  | "today"
  | "yesterday"
  | "this-week"
  | "this-month"
  | "this-year"
  | "custom";

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

export function parseReportPeriod(value: string | string[] | undefined): ReportPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "today" ||
    raw === "yesterday" ||
    raw === "this-week" ||
    raw === "this-month" ||
    raw === "this-year" ||
    raw === "custom"
  ) {
    return raw;
  }
  return "this-year";
}

export function reportPeriodRange(
  period: ReportPeriod,
  now: Date,
  custom?: { from?: string; to?: string },
) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (period === "today") {
    return {
      from: new Date(year, month, day, 0, 0, 0, 0),
      to: new Date(year, month, day, 23, 59, 59, 999),
      label: "Today",
    };
  }

  if (period === "yesterday") {
    const y = new Date(year, month, day - 1);
    return {
      from: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0),
      to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
      label: "Yesterday",
    };
  }

  if (period === "this-week") {
    // Monday-start week (aligned with typical business reporting).
    const weekday = (now.getDay() + 6) % 7;
    const start = new Date(year, month, day - weekday, 0, 0, 0, 0);
    return {
      from: start,
      to: new Date(year, month, day, 23, 59, 59, 999),
      label: "This Week",
    };
  }

  if (period === "this-month") {
    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 0, 23, 59, 59, 999),
      label: `This Month (${now.toLocaleString("en-GB", { month: "long", year: "numeric" })})`,
    };
  }

  if (period === "custom" && custom?.from && custom?.to) {
    return {
      from: new Date(`${custom.from}T00:00:00`),
      to: new Date(`${custom.to}T23:59:59`),
      label: "Custom Range",
    };
  }

  return {
    from: new Date(year, 0, 1),
    to: new Date(year, 11, 31, 23, 59, 59, 999),
    label: `This Year (${year})`,
  };
}
