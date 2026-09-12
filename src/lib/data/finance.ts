import { prisma } from "@/lib/db";
import { BUSINESS_UNITS, homePathForModule } from "@/lib/config/app";
import { asNumber } from "@/lib/format/currency";
import { percentChange, ratioPercent } from "@/lib/format/percent";
import {
  periodRange,
  previousPeriodRange,
  type RevenuePeriod,
} from "@/lib/data/period";

export const FINANCE_DETAIL_HREF: Record<string, string> = {
  rice: "/rice/sales",
  farm: "/farm/reports",
  supermarket: "/supermarket/sales",
  property: "/property/invoices",
  livestock: "/livestock/sales",
  school: "/school/fees",
  beekeeping: "/beekeeping/sales",
};

const DEMO_DELTA = {
  revenue: 12.5,
  expenses: 8.3,
  operatingPosition: 19.7,
  margin: 4.2,
};

const SNAPSHOT_DELTA = {
  revenue: 18.4,
  margin: 12.3,
};

export type PerformanceStatus = "strong" | "healthy" | "watch";

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

export function unitStatus(margin: number): PerformanceStatus {
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
    };
  }
  const highestRevenue = rows.reduce(
    (best, row) => (row.revenue > best.revenue ? row : best),
    rows[0],
  );
  const highestMargin = rows.reduce(
    (best, row) => (row.margin > best.margin ? row : best),
    rows[0],
  );
  return {
    highestRevenue,
    highestMargin,
    activeUnits: rows.length,
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

async function totalsByUnit(from: Date, to: Date, type: "REVENUE" | "EXPENSE") {
  const rows = await prisma.financeTransaction.groupBy({
    by: ["businessUnitId"],
    where: {
      type,
      occurredAt: { gte: from, lte: to },
    },
    _sum: { amount: true },
  });

  return new Map(rows.map((row) => [row.businessUnitId, asNumber(row._sum.amount)]));
}

function snapshot(revenue: number, expenses: number) {
  const operatingPosition = revenue - expenses;
  return {
    revenue,
    expenses,
    operatingPosition,
    margin: ratioPercent(operatingPosition, revenue),
  };
}

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

  const units = await prisma.businessUnit.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const [revenueMap, expenseMap, prevRevenueMap, prevExpenseMap] = await Promise.all([
    totalsByUnit(range.from, range.to, "REVENUE"),
    totalsByUnit(range.from, range.to, "EXPENSE"),
    totalsByUnit(previous.from, previous.to, "REVENUE"),
    totalsByUnit(previous.from, previous.to, "EXPENSE"),
  ]);

  const rows: UnitFinanceRow[] = units.map((unit) => {
    const meta = BUSINESS_UNITS.find((item) => item.code === unit.code);
    const revenue = revenueMap.get(unit.id) ?? 0;
    const expenses = expenseMap.get(unit.id) ?? 0;
    const operatingPosition = revenue - expenses;
    const margin = ratioPercent(operatingPosition, revenue);
    const prevRevenue = prevRevenueMap.get(unit.id) ?? 0;
    const prevExpenses = prevExpenseMap.get(unit.id) ?? 0;
    const prevMargin = ratioPercent(prevRevenue - prevExpenses, prevRevenue);
    return {
      code: unit.code,
      name: unit.name,
      location: meta?.location ?? "",
      subtitle: meta?.subtitle,
      accent: meta?.accent ?? unit.accent,
      tint: meta?.tint ?? "rgba(90, 122, 160, 0.12)",
      revenue,
      expenses,
      operatingPosition,
      margin,
      status: unitStatus(margin),
      href: FINANCE_DETAIL_HREF[unit.code] ?? homePathForModule(unit.code),
      moduleHref: homePathForModule(unit.code),
      revenueChange: percentChange(revenue, prevRevenue) ?? SNAPSHOT_DELTA.revenue,
      marginChange: prevRevenue === 0 ? SNAPSHOT_DELTA.margin : margin - prevMargin,
    };
  });

  const totals = snapshot(
    rows.reduce((sum, row) => sum + row.revenue, 0),
    rows.reduce((sum, row) => sum + row.expenses, 0),
  );

  const previousTotals = snapshot(
    [...prevRevenueMap.values()].reduce((sum, value) => sum + value, 0),
    [...prevExpenseMap.values()].reduce((sum, value) => sum + value, 0),
  );

  const computed: FinanceDelta = {
    revenue: percentChange(totals.revenue, previousTotals.revenue) ?? DEMO_DELTA.revenue,
    expenses: percentChange(totals.expenses, previousTotals.expenses) ?? DEMO_DELTA.expenses,
    operatingPosition:
      percentChange(totals.operatingPosition, previousTotals.operatingPosition) ??
      DEMO_DELTA.operatingPosition,
    margin:
      previousTotals.revenue === 0
        ? DEMO_DELTA.margin
        : totals.margin - previousTotals.margin,
  };

  return {
    rows,
    totals,
    comparison: computed,
    comparisonLabel: previous.label,
    label: range.label,
    from: range.from,
    to: range.to,
  };
}
