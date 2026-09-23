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

/** Prior period for real comparison deltas (never invents values). */
export function previousReportPeriodRange(
  period: ReportPeriod,
  now: Date,
  custom?: { from?: string; to?: string },
) {
  if (period === "today") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return {
      from: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0),
      to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
      label: "vs yesterday",
    };
  }

  if (period === "yesterday") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    return {
      from: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0),
      to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
      label: "vs prior day",
    };
  }

  if (period === "this-week") {
    const weekday = (now.getDay() + 6) % 7;
    const thisStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday, 0, 0, 0, 0);
    const priorStart = new Date(thisStart);
    priorStart.setDate(priorStart.getDate() - 7);
    const priorEnd = new Date(thisStart);
    priorEnd.setMilliseconds(priorEnd.getMilliseconds() - 1);
    return {
      from: priorStart,
      to: priorEnd,
      label: "vs last week",
    };
  }

  if (period === "this-month") {
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from: last,
      to: new Date(last.getFullYear(), last.getMonth() + 1, 0, 23, 59, 59, 999),
      label: "vs last month",
    };
  }

  if (period === "this-year") {
    const year = now.getFullYear() - 1;
    return {
      from: new Date(year, 0, 1),
      to: new Date(year, 11, 31, 23, 59, 59, 999),
      label: "vs last year",
    };
  }

  const current = reportPeriodRange(period, now, custom);
  const duration = current.to.getTime() - current.from.getTime();
  return {
    from: new Date(current.from.getTime() - duration - 1),
    to: new Date(current.from.getTime() - 1),
    label: "vs prior period",
  };
}
