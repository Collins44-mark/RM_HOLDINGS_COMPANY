import { prisma } from "@/lib/db";
import { BUSINESS_UNITS } from "@/lib/config/app";
import { asNumber } from "@/lib/format/currency";
import { periodRange, type RevenuePeriod } from "@/lib/data/period";

export type UnitRevenue = {
  code: string;
  name: string;
  shortName: string;
  accent: string;
  tint: string;
  amount: number;
};

export async function getRevenueByBusinessUnit(input: {
  period: RevenuePeriod;
  from?: string;
  to?: string;
  now?: Date;
}) {
  const range = periodRange(input.period, input.now ?? new Date(), {
    from: input.from,
    to: input.to,
  });

  const rows = await prisma.financeTransaction.groupBy({
    by: ["businessUnitId"],
    where: {
      type: "REVENUE",
      occurredAt: { gte: range.from, lte: range.to },
    },
    _sum: { amount: true },
  });

  const units = await prisma.businessUnit.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const totals = new Map(
    rows.map((row) => [row.businessUnitId, asNumber(row._sum.amount)]),
  );

  const items: UnitRevenue[] = units.map((unit) => {
    const meta = BUSINESS_UNITS.find((item) => item.code === unit.code);
    return {
      code: unit.code,
      name: unit.name,
      shortName: unit.shortName,
      accent: meta?.accent ?? unit.accent,
      tint: meta?.tint ?? "#E7F0FC",
      amount: totals.get(unit.id) ?? 0,
    };
  });

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    items,
    total,
    label: range.label,
    from: range.from,
    to: range.to,
  };
}

export async function getExpenseByBusinessUnit(input: {
  period: RevenuePeriod;
  from?: string;
  to?: string;
  now?: Date;
}) {
  const range = periodRange(input.period, input.now ?? new Date(), {
    from: input.from,
    to: input.to,
  });

  const rows = await prisma.financeTransaction.groupBy({
    by: ["businessUnitId"],
    where: {
      type: "EXPENSE",
      occurredAt: { gte: range.from, lte: range.to },
    },
    _sum: { amount: true },
  });

  const units = await prisma.businessUnit.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const totals = new Map(
    rows.map((row) => [row.businessUnitId, asNumber(row._sum.amount)]),
  );

  return units.map((unit) => ({
    code: unit.code,
    name: unit.name,
    amount: totals.get(unit.id) ?? 0,
  }));
}
