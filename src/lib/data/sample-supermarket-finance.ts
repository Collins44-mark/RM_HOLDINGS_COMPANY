import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import { resolveSalesPeriod } from "@/lib/data/sample-supermarket-sales";

/** One sold product line — profit = (selling − buying) × qty */
export type FinanceSoldLine = {
  name: string;
  buyingPrice: number;
  sellingPrice: number;
  quantitySold: number;
};

export type FinanceCashBalance = {
  cash: number;
  mobileMoney: number;
  card: number;
  bank: number;
};

export type FinanceSupplierOutstanding = {
  totalPurchases: number;
  totalPaid: number;
};

export type FinancePeriodSeed = {
  lines: FinanceSoldLine[];
  expenses: number;
  /** Percentage change vs previous comparable period (display only). */
  deltas: {
    revenue: number;
    productProfit: number;
    expenses: number;
    netProfit: number;
  };
};

export type FinanceSummary = {
  revenue: number;
  productProfit: number;
  expenses: number;
  netProfit: number;
  cashBalance: FinanceCashBalance;
  supplierOutstanding: {
    totalPurchases: number;
    totalPaid: number;
    outstanding: number;
  };
  deltas: FinancePeriodSeed["deltas"];
  periodLabel: string;
};

export function lineRevenue(line: FinanceSoldLine) {
  return line.sellingPrice * line.quantitySold;
}

export function lineProductProfit(line: FinanceSoldLine) {
  return (line.sellingPrice - line.buyingPrice) * line.quantitySold;
}

export function totalRevenue(lines: FinanceSoldLine[]) {
  return lines.reduce((sum, line) => sum + lineRevenue(line), 0);
}

export function totalProductProfit(lines: FinanceSoldLine[]) {
  return lines.reduce((sum, line) => sum + lineProductProfit(line), 0);
}

export function totalCashOnHand(balance: FinanceCashBalance) {
  return balance.cash + balance.mobileMoney + balance.card + balance.bank;
}

export function supplierOutstandingAmount(input: FinanceSupplierOutstanding) {
  return input.totalPurchases - input.totalPaid;
}

export function buildFinanceSummary(input: {
  lines: FinanceSoldLine[];
  expenses: number;
  cashBalance: FinanceCashBalance;
  supplier: FinanceSupplierOutstanding;
  deltas: FinancePeriodSeed["deltas"];
  periodLabel: string;
}): FinanceSummary {
  const revenue = totalRevenue(input.lines);
  const productProfit = totalProductProfit(input.lines);
  const netProfit = productProfit - input.expenses;
  return {
    revenue,
    productProfit,
    expenses: input.expenses,
    netProfit,
    cashBalance: input.cashBalance,
    supplierOutstanding: {
      totalPurchases: input.supplier.totalPurchases,
      totalPaid: input.supplier.totalPaid,
      outstanding: supplierOutstandingAmount(input.supplier),
    },
    deltas: input.deltas,
    periodLabel: input.periodLabel,
  };
}

/** Snapshot cash / payables — not driven by the period filter. */
export const FINANCE_CASH_BALANCE: FinanceCashBalance = {
  cash: 1_240_000,
  mobileMoney: 2_100_000,
  card: 960_000,
  bank: 500_000,
};

export const FINANCE_SUPPLIER: FinanceSupplierOutstanding = {
  totalPurchases: 3_500_000,
  totalPaid: 3_000_000,
};

/**
 * Period seeds sized so Today matches the reference numbers:
 * Revenue 5,000,000 · Product profit 1,250,000 · Expenses 300,000 · Net 950,000
 */
/** Tuned so Today = Revenue 5,000,000 · Product Profit 1,250,000 */
const TODAY_LINES: FinanceSoldLine[] = [
  { name: "Rice 25kg", buyingPrice: 35_000, sellingPrice: 46_000, quantitySold: 50 },
  { name: "Sugar 1kg", buyingPrice: 1_700, sellingPrice: 2_500, quantitySold: 400 },
  { name: "Cooking Oil 5L", buyingPrice: 18_000, sellingPrice: 22_000, quantitySold: 50 },
  { name: "Maize Flour 2kg", buyingPrice: 3_000, sellingPrice: 4_200, quantitySold: 50 },
  { name: "Cowbell Milk 4L", buyingPrice: 8_000, sellingPrice: 12_000, quantitySold: 20 },
  { name: "Soda 500ml", buyingPrice: 1_100, sellingPrice: 1_500, quantitySold: 100 },
];

function scaleLines(lines: FinanceSoldLine[], factor: number): FinanceSoldLine[] {
  return lines.map((line) => ({
    ...line,
    quantitySold: Math.max(1, Math.round(line.quantitySold * factor)),
  }));
}

const PERIOD_SEEDS: Record<Exclude<SalesPeriodPreset, "range">, FinancePeriodSeed> = {
  today: {
    lines: TODAY_LINES,
    expenses: 300_000,
    deltas: { revenue: 12, productProfit: 18, expenses: 5, netProfit: 22 },
  },
  yesterday: {
    lines: scaleLines(TODAY_LINES, 0.89),
    expenses: 285_000,
    deltas: { revenue: -4, productProfit: -2, expenses: 3, netProfit: -6 },
  },
  week: {
    lines: scaleLines(TODAY_LINES, 5.4),
    expenses: 1_650_000,
    deltas: { revenue: 9, productProfit: 14, expenses: 6, netProfit: 16 },
  },
  month: {
    lines: scaleLines(TODAY_LINES, 22),
    expenses: 6_800_000,
    deltas: { revenue: 11, productProfit: 15, expenses: 8, netProfit: 17 },
  },
};

function rangeSeed(range: SalesDateRange | null | undefined): FinancePeriodSeed {
  const from = range?.from;
  const to = range?.to;
  if (!from || !to) return PERIOD_SEEDS.today;
  const start = new Date(`${from <= to ? from : to}T00:00:00`);
  const end = new Date(`${from <= to ? to : from}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const factor = Math.min(31, days) * 0.92;
  return {
    lines: scaleLines(TODAY_LINES, factor),
    expenses: Math.round(300_000 * factor),
    deltas: { revenue: 7, productProfit: 10, expenses: 4, netProfit: 12 },
  };
}

export function getSupermarketFinanceSummary(
  preset: SalesPeriodPreset,
  range?: SalesDateRange | null,
): FinanceSummary {
  const period = resolveSalesPeriod(preset, range);
  const seed = preset === "range" ? rangeSeed(range) : PERIOD_SEEDS[preset];
  return buildFinanceSummary({
    lines: seed.lines,
    expenses: seed.expenses,
    cashBalance: FINANCE_CASH_BALANCE,
    supplier: FINANCE_SUPPLIER,
    deltas: seed.deltas,
    periodLabel: period.label,
  });
}
