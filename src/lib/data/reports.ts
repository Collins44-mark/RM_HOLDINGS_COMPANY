import { ratioPercent } from "@/lib/format/percent";
import {
  getConsolidatedFinanceForReportPeriod,
  unitStatus,
  type PerformanceStatus,
} from "@/lib/data/finance";
import {
  reportPeriodRange,
  type ReportPeriod,
} from "@/lib/data/report-period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type {
  ReportPeriod,
} from "@/lib/data/report-period";
export {
  REPORT_PERIOD_OPTIONS,
  parseReportPeriod,
  previousReportPeriodRange,
  reportPeriodRange,
} from "@/lib/data/report-period";

export type ReportUnitRow = {
  code: string;
  name: string;
  revenue: number;
  expenses: number;
  operatingPosition: number;
  margin: number;
  status: PerformanceStatus;
};

export type ReportCashSummary = {
  cash: number;
  pettyCash?: number;
  mobileMoney: number;
  card: number;
  bank: number;
  total: number;
  paymentCount: number;
  available: boolean;
};

export type ConsolidatedReport = {
  label: string;
  from: Date;
  to: Date;
  sales: {
    totalRevenue: number;
    salesCount: number;
    supermarketRevenue: number;
    supermarketSalesCount: number;
  };
  expenses: {
    totalExpenses: number;
    supermarketExpenses: number;
  };
  profitAndLoss: {
    revenue: number;
    cogs: number;
    productProfit: number;
    operatingExpenses: number;
    operatingPosition: number;
    margin: number;
  };
  businessUnits: ReportUnitRow[];
  cash: ReportCashSummary;
};

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const EMPTY_CASH: ReportCashSummary = {
  cash: 0,
  pettyCash: 0,
  mobileMoney: 0,
  card: 0,
  bank: 0,
  total: 0,
  paymentCount: 0,
  available: true,
};

/**
 * Period cash movements from sm_payments (same signed-method rules as supermarket finance).
 * Failures → zeros + log (never sample data).
 */
async function loadSupermarketCashSummary(from: Date, to: Date): Promise<ReportCashSummary> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      console.error(
        JSON.stringify({
          scope: "consolidated-reports",
          operation: "loadSupermarketCashSummary",
          phase: "auth",
          message: "Supabase is not configured.",
        }),
      );
      return { ...EMPTY_CASH, available: false };
    }

    const { data: bu, error: buError } = await supabase
      .from("business_units")
      .select("id")
      .eq("code", "supermarket")
      .maybeSingle();

    if (buError) {
      console.error(
        JSON.stringify({
          scope: "consolidated-reports",
          operation: "loadSupermarketCashSummary",
          phase: "query",
          message: buError.message,
        }),
      );
      return { ...EMPTY_CASH, available: false };
    }

    if (!bu?.id) {
      return EMPTY_CASH;
    }

    const fromDate = formatLocalDate(from);
    const toDate = formatLocalDate(to);

    const { data, error } = await supabase
      .from("sm_payments")
      .select("direction, method, amount")
      .eq("business_unit_id", bu.id)
      .gte("payment_date", fromDate)
      .lte("payment_date", toDate);

    if (error) {
      console.error(
        JSON.stringify({
          scope: "consolidated-reports",
          operation: "loadSupermarketCashSummary",
          phase: "query",
          table: "sm_payments",
          message: error.message,
        }),
      );
      return { ...EMPTY_CASH, available: false };
    }

    const cashBalance = { cash: 0, pettyCash: 0, mobileMoney: 0, card: 0, bank: 0 };
    for (const payment of data ?? []) {
      const amount = Number(payment.amount) || 0;
      const signed = payment.direction === "OUT" ? -amount : amount;
      const method = String(payment.method ?? "").toUpperCase();
      if (method === "MOBILE_MONEY") cashBalance.mobileMoney += signed;
      else if (method === "CARD") cashBalance.card += signed;
      else if (method === "BANK") cashBalance.bank += signed;
      else if (method === "PETTY_CASH") cashBalance.pettyCash += signed;
      else cashBalance.cash += signed;
    }

    const total =
      cashBalance.cash +
      cashBalance.pettyCash +
      cashBalance.mobileMoney +
      cashBalance.card +
      cashBalance.bank;

    return {
      ...cashBalance,
      total,
      paymentCount: (data ?? []).length,
      available: true,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "consolidated-reports",
        operation: "loadSupermarketCashSummary",
        phase: "unknown",
        message: error instanceof Error ? error.message : "Failed to load payment summary.",
      }),
    );
    return { ...EMPTY_CASH, available: false };
  }
}

function reportUnitsFromFinance(
  rows: Array<{
    code: string;
    name: string;
    revenue: number;
    expenses: number;
    operatingPosition: number;
    margin: number;
    status: PerformanceStatus;
  }>,
): ReportUnitRow[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    revenue: row.revenue,
    expenses: row.expenses,
    operatingPosition: row.operatingPosition,
    margin: row.margin,
    status: unitStatus(row.margin, row.revenue !== 0 || row.expenses !== 0 || row.operatingPosition !== 0),
  }));
}

/**
 * Single Group Reports source — Phase 1 ledger formula + payment summary.
 * Never uses sample-finance, Prisma FinanceTransaction, or mock arrays.
 */
export async function getConsolidatedReport(input: {
  period: ReportPeriod;
  from?: string;
  to?: string;
  now?: Date;
}): Promise<ConsolidatedReport> {
  const now = input.now ?? new Date();
  const range = reportPeriodRange(input.period, now, {
    from: input.from,
    to: input.to,
  });

  const [finance, cash] = await Promise.all([
    getConsolidatedFinanceForReportPeriod({ period: input.period, from: input.from, to: input.to, now }),
    loadSupermarketCashSummary(range.from, range.to),
  ]);

  const supermarket = finance.supermarket;
  const totals = finance.totals;
  const margin = ratioPercent(totals.operatingPosition, totals.revenue);

  return {
    label: range.label,
    from: range.from,
    to: range.to,
    sales: {
      totalRevenue: totals.revenue,
      salesCount: supermarket.salesCount + finance.school.collectionCount,
      supermarketRevenue: supermarket.revenue,
      supermarketSalesCount: supermarket.salesCount,
    },
    expenses: {
      totalExpenses: totals.expenses,
      supermarketExpenses: supermarket.expenses,
    },
    profitAndLoss: {
      revenue: totals.revenue,
      cogs: supermarket.cogs,
      productProfit: supermarket.productProfit,
      operatingExpenses: totals.expenses,
      operatingPosition: totals.operatingPosition,
      margin,
    },
    businessUnits: reportUnitsFromFinance(finance.rows),
    cash,
  };
}
