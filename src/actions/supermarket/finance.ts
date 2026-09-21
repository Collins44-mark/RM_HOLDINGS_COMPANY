"use server";

import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
} from "@/lib/supermarket/access";

export type FinanceSummaryPayload = {
  revenue: number;
  productProfit: number;
  expenses: number;
  netProfit: number;
  cashBalance: {
    cash: number;
    mobileMoney: number;
    card: number;
    bank: number;
  };
  supplierOutstanding: {
    totalPurchases: number;
    totalPaid: number;
    outstanding: number;
  };
  deltas: {
    revenue: number;
    productProfit: number;
    expenses: number;
    netProfit: number;
  };
  periodLabel: string;
  /** Payments in the selected period (from the same payments query used for cash). */
  paymentCount: number;
};

/**
 * Lean Finance overview loader — kept out of reports.ts so soft-nav to
 * /supermarket/finance does not cold-load the full reports action module.
 */
export async function getFinanceSummaryAction(input: { from: string; to: string }): Promise<
  { ok: true; summary: FinanceSummaryPayload } | { ok: false; error: string }
> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const fromIso = `${input.from}T00:00:00`;
    const toIso = `${input.to}T23:59:59`;
    const [salesRes, expensesRes, paymentsRes, receiptsRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("total, cogs")
        .eq("business_unit_id", businessUnitId)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso),
      supabase
        .from("sm_expenses")
        .select("amount")
        .eq("business_unit_id", businessUnitId)
        .gte("expense_date", input.from)
        .lte("expense_date", input.to),
      supabase
        .from("sm_payments")
        .select("direction, method, amount, kind")
        .eq("business_unit_id", businessUnitId)
        .gte("payment_date", input.from)
        .lte("payment_date", input.to),
      supabase
        .from("sm_goods_receipts")
        .select("total_cost, payment_status, received_at")
        .eq("business_unit_id", businessUnitId)
        .gte("received_at", fromIso)
        .lte("received_at", toIso),
    ]);
    if (salesRes.error) mapDbError(salesRes.error);
    if (expensesRes.error) mapDbError(expensesRes.error);
    if (paymentsRes.error) mapDbError(paymentsRes.error);
    if (receiptsRes.error) mapDbError(receiptsRes.error);

    // Zero rows across all four queries is SUCCESS — return explicit zeros.
    const revenue = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
    const cogs = (salesRes.data ?? []).reduce((s, r) => s + Number(r.cogs || 0), 0);
    const productProfit = revenue - cogs;
    const expenses = (expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const netProfit = productProfit - expenses;

    const cashBalance = { cash: 0, mobileMoney: 0, card: 0, bank: 0 };
    for (const payment of paymentsRes.data ?? []) {
      const amount = Number(payment.amount) || 0;
      const signed = payment.direction === "OUT" ? -amount : amount;
      const method = String(payment.method ?? "").toUpperCase();
      if (method === "MOBILE_MONEY") cashBalance.mobileMoney += signed;
      else if (method === "CARD") cashBalance.card += signed;
      else if (method === "BANK") cashBalance.bank += signed;
      else cashBalance.cash += signed;
    }

    const totalPurchases = (receiptsRes.data ?? []).reduce(
      (s, r) => s + Number(r.total_cost || 0),
      0,
    );
    const totalPaid = (receiptsRes.data ?? [])
      .filter((r) => String(r.payment_status).toUpperCase() === "PAID")
      .reduce((s, r) => s + Number(r.total_cost || 0), 0);

    return {
      ok: true as const,
      summary: {
        revenue,
        productProfit,
        expenses,
        netProfit,
        cashBalance,
        supplierOutstanding: {
          totalPurchases,
          totalPaid,
          outstanding: Math.max(0, totalPurchases - totalPaid),
        },
        deltas: { revenue: 0, productProfit: 0, expenses: 0, netProfit: 0 },
        periodLabel: `${input.from} – ${input.to}`,
        paymentCount: (paymentsRes.data ?? []).length,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionErrorMessage(error, {
        route: "/supermarket/finance",
        operation: "getFinanceSummaryAction",
        phase: "query",
      }),
    };
  }
}
