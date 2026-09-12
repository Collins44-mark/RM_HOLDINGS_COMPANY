export type RevenuePeriod =
  | "this-year"
  | "this-month"
  | "this-quarter"
  | "last-month"
  | "custom";

export const PERIOD_OPTIONS: { value: RevenuePeriod; label: string }[] = [
  { value: "this-year", label: "This Year" },
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "last-month", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

export const DASHBOARD_PERIOD_OPTIONS: { value: RevenuePeriod; label: string }[] = [
  { value: "this-year", label: "This Year" },
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "custom", label: "Custom Range" },
];

export function parsePeriod(value: string | string[] | undefined): RevenuePeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "this-month" ||
    raw === "this-quarter" ||
    raw === "last-month" ||
    raw === "custom" ||
    raw === "this-year"
  ) {
    return raw;
  }
  return "this-year";
}

export function periodRange(
  period: RevenuePeriod,
  now: Date,
  custom?: { from?: string; to?: string },
) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "this-month") {
    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 0, 23, 59, 59, 999),
      label: `This Month (${now.toLocaleString("en-GB", { month: "long", year: "numeric" })})`,
    };
  }

  if (period === "this-quarter") {
    const quarter = Math.floor(month / 3);
    return {
      from: new Date(year, quarter * 3, 1),
      to: new Date(year, quarter * 3 + 3, 0, 23, 59, 59, 999),
      label: `This Quarter (Q${quarter + 1} ${year})`,
    };
  }

  if (period === "last-month") {
    const last = new Date(year, month - 1, 1);
    return {
      from: last,
      to: new Date(last.getFullYear(), last.getMonth() + 1, 0, 23, 59, 59, 999),
      label: `Last Month (${last.toLocaleString("en-GB", { month: "long", year: "numeric" })})`,
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

export function previousPeriodRange(
  period: RevenuePeriod,
  now: Date,
  custom?: { from?: string; to?: string },
) {
  if (period === "this-year") {
    const year = now.getFullYear() - 1;
    return {
      from: new Date(year, 0, 1),
      to: new Date(year, 11, 31, 23, 59, 59, 999),
      label: "vs last year",
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

  if (period === "this-quarter") {
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);
    const from = new Date(now.getFullYear(), quarter * 3 - 3, 1);
    return {
      from,
      to: new Date(from.getFullYear(), from.getMonth() + 3, 0, 23, 59, 59, 999),
      label: "vs last quarter",
    };
  }

  if (period === "last-month") {
    const prior = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return {
      from: prior,
      to: new Date(prior.getFullYear(), prior.getMonth() + 1, 0, 23, 59, 59, 999),
      label: "vs prior month",
    };
  }

  const current = periodRange(period, now, custom);
  const duration = current.to.getTime() - current.from.getTime();
  return {
    from: new Date(current.from.getTime() - duration - 1),
    to: new Date(current.from.getTime() - 1),
    label: "vs prior period",
  };
}

