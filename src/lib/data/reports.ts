import { BUSINESS_UNITS } from "@/lib/config/app";
import { ratioPercent } from "@/lib/format/percent";
import {
  loadSupermarketPeriodLedger,
  unitStatus,
  type PerformanceStatus,
  type SupermarketPeriodLedger,
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

    const cashBalance = { cash: 0, mobileMoney: 0, card: 0, bank: 0 };
    for (const payment of data ?? []) {
      const amount = Number(payment.amount) || 0;
      const signed = payment.direction === "OUT" ? -amount : amount;
      const method = String(payment.method ?? "").toUpperCase();
      if (method === "MOBILE_MONEY") cashBalance.mobileMoney += signed;
      else if (method === "CARD") cashBalance.card += signed;
      else if (method === "BANK") cashBalance.bank += signed;
      else cashBalance.cash += signed;
    }

    const total =
      cashBalance.cash + cashBalance.mobileMoney + cashBalance.card + cashBalance.bank;

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

function buildUnitRows(ledger: SupermarketPeriodLedger): ReportUnitRow[] {
  return BUSINESS_UNITS.map((unit) => {
    const revenue = unit.code === "supermarket" ? ledger.revenue : 0;
    const expenses = unit.code === "supermarket" ? ledger.expenses : 0;
    const operatingPosition = unit.code === "supermarket" ? ledger.netProfit : 0;
    const margin = ratioPercent(operatingPosition, revenue);
    const hasActivity = revenue !== 0 || expenses !== 0 || operatingPosition !== 0;
    return {
      code: unit.code,
      name: unit.name,
      revenue,
      expenses,
      operatingPosition,
      margin,
      status: unitStatus(margin, hasActivity),
    };
  });
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

  const [ledger, cash] = await Promise.all([
    loadSupermarketPeriodLedger(range.from, range.to),
    loadSupermarketCashSummary(range.from, range.to),
  ]);

  const businessUnits = buildUnitRows(ledger);
  const margin = ratioPercent(ledger.netProfit, ledger.revenue);

  return {
    label: range.label,
    from: range.from,
    to: range.to,
    sales: {
      totalRevenue: ledger.revenue,
      salesCount: ledger.salesCount,
      supermarketRevenue: ledger.revenue,
      supermarketSalesCount: ledger.salesCount,
    },
    expenses: {
      totalExpenses: ledger.expenses,
      supermarketExpenses: ledger.expenses,
    },
    profitAndLoss: {
      revenue: ledger.revenue,
      cogs: ledger.cogs,
      productProfit: ledger.productProfit,
      operatingExpenses: ledger.expenses,
      operatingPosition: ledger.netProfit,
      margin,
    },
    businessUnits,
    cash,
  };
}
