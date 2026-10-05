import { homePathForModule } from "@/lib/config/app";
import { percentChange, ratioPercent } from "@/lib/format/percent";
import {
  periodRange,
  previousPeriodRange,
  type RevenuePeriod,
} from "@/lib/data/period";
import {
  previousReportPeriodRange,
  reportPeriodRange,
  type ReportPeriod,
} from "@/lib/data/report-period";
import { listBusinessUnits, type BusinessUnitView } from "@/lib/data/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const FINANCE_DETAIL_HREF: Record<string, string> = {
  rice: "/rice/sales",
  farm: "/farm/reports",
  supermarket: "/supermarket/sales",
  property: "/property/invoices",
  livestock: "/livestock/sales",
  school: "/school/fees",
  beekeeping: "/beekeeping/sales",
};

export type PerformanceStatus = "strong" | "healthy" | "watch" | "idle";

export type UnitFinanceRow = {
  code: string;
  name: string;
  location: string;
  subtitle?: string;
  accent: string;
  tint: string;
  revenue: number;
  expenses: number;
  operatingPosition: number;
  margin: number;
  status: PerformanceStatus;
  href: string;
  moduleHref: string;
  revenueChange: number;
  marginChange: number;
};

/** Factual status — idle when the unit has no operational activity in the period. */
export function unitStatus(margin: number, hasActivity = true): PerformanceStatus {
  if (!hasActivity) return "idle";
  if (margin >= 50) return "strong";
  if (margin >= 30) return "healthy";
  return "watch";
}

export function getExecutiveInsights(rows: UnitFinanceRow[]) {
  if (rows.length === 0) {
    return {
      highestRevenue: undefined,
      highestMargin: undefined,
      activeUnits: 0,
      configuredUnits: 0,
    };
  }
  const activeRows = rows.filter(
    (row) => row.revenue !== 0 || row.expenses !== 0 || row.operatingPosition !== 0,
  );
  if (activeRows.length === 0) {
    return {
      highestRevenue: undefined,
      highestMargin: undefined,
      activeUnits: 0,
      configuredUnits: rows.length,
    };
  }
  const highestRevenue = activeRows.reduce(
    (best, row) => (row.revenue > best.revenue ? row : best),
    activeRows[0],
  );
  const highestMargin = activeRows.reduce(
    (best, row) => (row.margin > best.margin ? row : best),
    activeRows[0],
  );
  return {
    highestRevenue,
    highestMargin,
    activeUnits: activeRows.length,
    configuredUnits: rows.length,
  };
}

export type FinanceDelta = {
  revenue: number;
  expenses: number;
  operatingPosition: number;
  margin: number;
};

export type FinanceTab = "units" | "trend" | "category";

export type FinanceTrendRow = {
  period: string;
  revenue: number;
  cogs: number;
  expenses: number;
  operatingPosition: number;
  margin: number;
};

export type FinanceCategoryRow = {
  category: string;
  type: "Revenue" | "Cost" | "Expense";
  amount: number;
  share: number;
};

export function parseFinanceTab(value: string | string[] | undefined): FinanceTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "trend" || raw === "category" || raw === "units") return raw;
  return "units";
}

/** Shared Phase 1 supermarket ledger — reused by Group Finance and Group Reports. */
export type SupermarketPeriodLedger = {
  revenue: number;
  cogs: number;
  expenses: number;
  productProfit: number;
  netProfit: number;
  /** Count of sm_sales rows in the period (zeros when empty). */
  salesCount: number;
};

type SalePoint = { saleDate: string; total: number; cogs: number };
type ExpensePoint = { expenseDate: string; amount: number; category: string };
type PeriodPoints = { sales: SalePoint[]; expenses: ExpensePoint[] };

const EMPTY_POINTS: PeriodPoints = { sales: [], expenses: [] };

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function snapshot(revenue: number, expenses: number, netProfit: number) {
  return {
    revenue,
    expenses,
    operatingPosition: netProfit,
    margin: ratioPercent(netProfit, revenue),
  };
}

function deltaOrZero(current: number, previous: number) {
  return percentChange(current, previous) ?? 0;
}

function dayKey(value: string) {
  return String(value).slice(0, 10);
}

function monthKey(value: string) {
  return String(value).slice(0, 7);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function enumerateDays(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(formatLocalDate(cursor));
  }
  return days;
}

function enumerateMonths(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const months: { key: string; label: string }[] = [];
  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: cursor.toLocaleString("en-GB", { month: "short", year: "numeric" }),
    });
  }
  return months;
}

function formatDayLabel(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function trendGrainForSpan(from: Date, to: Date, preferMonth: boolean): "month" | "day" {
  if (preferMonth) return "month";
  const days =
    Math.round(
      (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
        new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
        86_400_000,
    ) + 1;
  return days > 62 ? "month" : "day";
}

function ledgerFromPoints(points: PeriodPoints): SupermarketPeriodLedger {
  const revenue = points.sales.reduce((sum, row) => sum + row.total, 0);
  const cogs = points.sales.reduce((sum, row) => sum + row.cogs, 0);
  const expenses = points.expenses.reduce((sum, row) => sum + row.amount, 0);
  const productProfit = revenue - cogs;
  return {
    revenue,
    cogs,
    expenses,
    productProfit,
    netProfit: productProfit - expenses,
    salesCount: points.sales.length,
  };
}

function buildTrendRows(
  points: PeriodPoints,
  range: { from: Date; to: Date },
  grain: "month" | "day",
): FinanceTrendRow[] {
  const buckets = new Map<string, { label: string; revenue: number; cogs: number; expenses: number }>();

  if (grain === "month") {
    for (const month of enumerateMonths(range.from, range.to)) {
      buckets.set(month.key, { label: month.label, revenue: 0, cogs: 0, expenses: 0 });
    }
    for (const sale of points.sales) {
      const bucket = buckets.get(monthKey(sale.saleDate));
      if (!bucket) continue;
      bucket.revenue += sale.total;
      bucket.cogs += sale.cogs;
    }
    for (const expense of points.expenses) {
      const bucket = buckets.get(monthKey(expense.expenseDate));
      if (!bucket) continue;
      bucket.expenses += expense.amount;
    }
  } else {
    for (const day of enumerateDays(range.from, range.to)) {
      buckets.set(day, { label: formatDayLabel(day), revenue: 0, cogs: 0, expenses: 0 });
    }
    for (const sale of points.sales) {
      const bucket = buckets.get(dayKey(sale.saleDate));
      if (!bucket) continue;
      bucket.revenue += sale.total;
      bucket.cogs += sale.cogs;
    }
    for (const expense of points.expenses) {
      const bucket = buckets.get(dayKey(expense.expenseDate));
      if (!bucket) continue;
      bucket.expenses += expense.amount;
    }
  }

  return [...buckets.values()].map((bucket) => {
    const operatingPosition = bucket.revenue - bucket.cogs - bucket.expenses;
    return {
      period: bucket.label,
      revenue: bucket.revenue,
      cogs: bucket.cogs,
      expenses: bucket.expenses,
      operatingPosition,
      margin: ratioPercent(operatingPosition, bucket.revenue),
    };
  });
}

function buildCategoryRows(points: PeriodPoints): FinanceCategoryRow[] {
  const revenue = points.sales.reduce((sum, row) => sum + row.total, 0);
  const cogs = points.sales.reduce((sum, row) => sum + row.cogs, 0);
  const expenseGroups = new Map<string, number>();
  for (const expense of points.expenses) {
    const name = expense.category.trim() || "Uncategorized";
    expenseGroups.set(name, (expenseGroups.get(name) ?? 0) + expense.amount);
  }

  const rows: FinanceCategoryRow[] = [
    { category: "Sales", type: "Revenue", amount: revenue, share: 0 },
    { category: "COGS", type: "Cost", amount: cogs, share: 0 },
    ...[...expenseGroups.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category, amount]) => ({
        category,
        type: "Expense" as const,
        amount,
        share: 0,
      })),
  ];

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return rows.map((row) => ({
    ...row,
    share: ratioPercent(row.amount, total),
  }));
}

async function loadSupermarketPeriodPoints(from: Date, to: Date): Promise<PeriodPoints> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodPoints",
          phase: "auth",
          message: "Supabase is not configured.",
        }),
      );
      return EMPTY_POINTS;
    }

    const { data: bu, error: buError } = await supabase
      .from("business_units")
      .select("id")
      .eq("code", "supermarket")
      .maybeSingle();

    if (buError) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodPoints",
          phase: "query",
          message: buError.message,
        }),
      );
      return EMPTY_POINTS;
    }

    if (!bu?.id) return EMPTY_POINTS;

    const fromDate = formatLocalDate(from);
    const toDate = formatLocalDate(to);
    const fromIso = `${fromDate}T00:00:00`;
    const toIso = `${toDate}T23:59:59`;

    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("sale_date, total, cogs")
        .eq("business_unit_id", bu.id)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso),
      supabase
        .from("sm_expenses")
        .select("expense_date, amount, category")
        .eq("business_unit_id", bu.id)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate),
    ]);

    if (salesRes.error) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodPoints",
          phase: "query",
          table: "sm_sales",
          message: salesRes.error.message,
        }),
      );
      return EMPTY_POINTS;
    }
    if (expensesRes.error) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodPoints",
          phase: "query",
          table: "sm_expenses",
          message: expensesRes.error.message,
        }),
      );
      return EMPTY_POINTS;
    }

    return {
      sales: (salesRes.data ?? []).map((row) => ({
        saleDate: dayKey(String(row.sale_date ?? "")),
        total: Number(row.total || 0),
        cogs: Number(row.cogs || 0),
      })),
      expenses: (expensesRes.data ?? []).map((row) => ({
        expenseDate: dayKey(String(row.expense_date ?? "")),
        amount: Number(row.amount || 0),
        category: String(row.category ?? ""),
      })),
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "consolidated-finance",
        operation: "loadSupermarketPeriodPoints",
        phase: "unknown",
        message: error instanceof Error ? error.message : "Failed to load supermarket ledger.",
      }),
    );
    return EMPTY_POINTS;
  }
}

/**
 * Live supermarket ledger for a period (Phase 1 formula).
 * Revenue = Σ sm_sales.total
 * Expenses = Σ sm_expenses.amount
 * Product profit = revenue − COGS
 * Net profit / operating position = product profit − expenses
 *
 * Empty rows → zeros. Query failures → zeros + server log (never sample data).
 */
export async function loadSupermarketPeriodLedger(
  from: Date,
  to: Date,
): Promise<SupermarketPeriodLedger> {
  return ledgerFromPoints(await loadSupermarketPeriodPoints(from, to));
}

function buildUnitRow(
  unit: BusinessUnitView,
  current: SupermarketPeriodLedger,
  previous: SupermarketPeriodLedger,
): UnitFinanceRow {
  const revenue = unit.code === "supermarket" ? current.revenue : 0;
  const expenses = unit.code === "supermarket" ? current.expenses : 0;
  const operatingPosition = unit.code === "supermarket" ? current.netProfit : 0;
  const margin = ratioPercent(operatingPosition, revenue);
  const hasActivity = revenue !== 0 || expenses !== 0 || operatingPosition !== 0;

  const prevRevenue = unit.code === "supermarket" ? previous.revenue : 0;
  const prevNet = unit.code === "supermarket" ? previous.netProfit : 0;
  const prevMargin = ratioPercent(prevNet, prevRevenue);

  return {
    code: unit.code,
    name: unit.name,
    location: unit.location,
    subtitle: unit.subtitle,
    accent: unit.accent,
    tint: unit.tint,
    revenue,
    expenses,
    operatingPosition,
    margin,
    status: unitStatus(margin, hasActivity),
    href: FINANCE_DETAIL_HREF[unit.code] ?? homePathForModule(unit.code),
    moduleHref: homePathForModule(unit.code),
    revenueChange: deltaOrZero(revenue, prevRevenue),
    marginChange: prevRevenue === 0 ? 0 : margin - prevMargin,
  };
}

async function consolidateLedgers(
  range: { from: Date; to: Date; label: string },
  previous: { from: Date; to: Date; label: string },
  grain: "month" | "day",
) {
  const [currentPoints, previousLedger, units] = await Promise.all([
    loadSupermarketPeriodPoints(range.from, range.to),
    loadSupermarketPeriodLedger(previous.from, previous.to),
    listBusinessUnits(),
  ]);
  const currentLedger = ledgerFromPoints(currentPoints);

  const rows: UnitFinanceRow[] = units.map((unit) =>
    buildUnitRow(unit, currentLedger, previousLedger),
  );

  const totals = snapshot(
    rows.reduce((sum, row) => sum + row.revenue, 0),
    rows.reduce((sum, row) => sum + row.expenses, 0),
    rows.reduce((sum, row) => sum + row.operatingPosition, 0),
  );

  const previousTotals = snapshot(
    previousLedger.revenue,
    previousLedger.expenses,
    previousLedger.netProfit,
  );

  const comparison: FinanceDelta = {
    revenue: deltaOrZero(totals.revenue, previousTotals.revenue),
    expenses: deltaOrZero(totals.expenses, previousTotals.expenses),
    operatingPosition: deltaOrZero(totals.operatingPosition, previousTotals.operatingPosition),
    margin: previousTotals.revenue === 0 ? 0 : totals.margin - previousTotals.margin,
  };

  return {
    rows,
    totals,
    comparison,
    comparisonLabel: previous.label,
    label: range.label,
    from: range.from,
    to: range.to,
    cogs: currentLedger.cogs,
    trend: buildTrendRows(currentPoints, range, grain),
    trendGrain: grain,
    categories: buildCategoryRows(currentPoints),
  };
}

/**
 * Single consolidated finance source for Super Admin Dashboard and Owner Finance.
 *
 * Phase 1: supermarket = live sm_sales / sm_expenses; all other units = 0.
 * Never falls back to sample-finance or Prisma FinanceTransaction.
 */
export async function getConsolidatedFinance(input: {
  period: RevenuePeriod;
  from?: string;
  to?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const range = periodRange(input.period, now, {
    from: input.from,
    to: input.to,
  });
  const previous = previousPeriodRange(input.period, now, {
    from: input.from,
    to: input.to,
  });
  return consolidateLedgers(
    range,
    previous,
    trendGrainForSpan(
      range.from,
      range.to,
      input.period === "this-year" || input.period === "this-quarter",
    ),
  );
}

/**
 * Same Phase 1 ledger formulas as getConsolidatedFinance, using Phase 2 report periods
 * (Today / Yesterday / This Week / This Month / This Year / Custom).
 */
export async function getConsolidatedFinanceForReportPeriod(input: {
  period: ReportPeriod;
  from?: string;
  to?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const range = reportPeriodRange(input.period, now, {
    from: input.from,
    to: input.to,
  });
  const previous = previousReportPeriodRange(input.period, now, {
    from: input.from,
    to: input.to,
  });
  return consolidateLedgers(
    range,
    previous,
    trendGrainForSpan(range.from, range.to, input.period === "this-year"),
  );
}
