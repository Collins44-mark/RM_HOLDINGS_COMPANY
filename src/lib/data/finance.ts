import { BUSINESS_UNITS, homePathForModule } from "@/lib/config/app";
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

const EMPTY_LEDGER: SupermarketPeriodLedger = {
  revenue: 0,
  cogs: 0,
  expenses: 0,
  productProfit: 0,
  netProfit: 0,
  salesCount: 0,
};

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
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodLedger",
          phase: "auth",
          message: "Supabase is not configured.",
        }),
      );
      return EMPTY_LEDGER;
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
          operation: "loadSupermarketPeriodLedger",
          phase: "query",
          message: buError.message,
        }),
      );
      return EMPTY_LEDGER;
    }

    if (!bu?.id) {
      return EMPTY_LEDGER;
    }

    const fromDate = formatLocalDate(from);
    const toDate = formatLocalDate(to);
    const fromIso = `${fromDate}T00:00:00`;
    const toIso = `${toDate}T23:59:59`;

    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("total, cogs")
        .eq("business_unit_id", bu.id)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso),
      supabase
        .from("sm_expenses")
        .select("amount")
        .eq("business_unit_id", bu.id)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate),
    ]);

    if (salesRes.error) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodLedger",
          phase: "query",
          table: "sm_sales",
          message: salesRes.error.message,
        }),
      );
      return EMPTY_LEDGER;
    }
    if (expensesRes.error) {
      console.error(
        JSON.stringify({
          scope: "consolidated-finance",
          operation: "loadSupermarketPeriodLedger",
          phase: "query",
          table: "sm_expenses",
          message: expensesRes.error.message,
        }),
      );
      return EMPTY_LEDGER;
    }

    const salesRows = salesRes.data ?? [];
    const revenue = salesRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cogs = salesRows.reduce((sum, row) => sum + Number(row.cogs || 0), 0);
    const expenses = (expensesRes.data ?? []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const productProfit = revenue - cogs;
    const netProfit = productProfit - expenses;

    return {
      revenue,
      cogs,
      expenses,
      productProfit,
      netProfit,
      salesCount: salesRows.length,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "consolidated-finance",
        operation: "loadSupermarketPeriodLedger",
        phase: "unknown",
        message: error instanceof Error ? error.message : "Failed to load supermarket ledger.",
      }),
    );
    return EMPTY_LEDGER;
  }
}

function buildUnitRow(
  unit: (typeof BUSINESS_UNITS)[number],
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
) {
  const [currentLedger, previousLedger] = await Promise.all([
    loadSupermarketPeriodLedger(range.from, range.to),
    loadSupermarketPeriodLedger(previous.from, previous.to),
  ]);

  const rows: UnitFinanceRow[] = BUSINESS_UNITS.map((unit) =>
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
  return consolidateLedgers(range, previous);
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
  return consolidateLedgers(range, previous);
}
