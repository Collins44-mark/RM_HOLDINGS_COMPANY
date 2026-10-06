"use server";

import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
} from "@/lib/supermarket/access";
import { centsToMoney, moneyToCents } from "@/lib/supermarket/money";
import {
  displayStatus,
  type ReconciliationOverviewCard,
  type ReconciliationStatus,
} from "@/lib/supermarket/reconciliation";

/**
 * Lean hub/report-strip loader. Kept out of reconciliation.ts so navigating to
 * /supermarket/reconciliation does not cold-load sales/cash/stock/bank workspaces.
 */
function asStatus(value: unknown): ReconciliationStatus {
  const status = String(value).toUpperCase();
  if (status === "SUBMITTED" || status === "APPROVED" || status === "POSTED" || status === "VOID") {
    return status;
  }
  return "DRAFT";
}

export async function getReconciliationOverviewAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const [salesRes, cashRes, stockRes, bankRes, unmatchedRes] = await Promise.all([
      supabase
        .from("sm_sales_reconciliations")
        .select("status, variance")
        .eq("business_unit_id", businessUnitId)
        .eq("period_start", input.from)
        .eq("period_end", input.to)
        .neq("status", "VOID")
        .maybeSingle(),
      supabase
        .from("sm_cash_reconciliations")
        .select("status, variance")
        .eq("business_unit_id", businessUnitId)
        .eq("period_start", input.from)
        .eq("period_end", input.to)
        .neq("status", "VOID")
        .maybeSingle(),
      supabase
        .from("sm_stock_reconciliations")
        .select("status, variance_count, variance_value")
        .eq("business_unit_id", businessUnitId)
        .gte("stocktake_date", input.from)
        .lte("stocktake_date", input.to)
        .neq("status", "VOID")
        .order("stocktake_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sm_bank_reconciliations")
        .select("status, difference, unmatched_count")
        .eq("business_unit_id", businessUnitId)
        .eq("statement_start", input.from)
        .eq("statement_end", input.to)
        .neq("status", "VOID")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sm_bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("status", "UNMATCHED")
        .eq("posting_status", "POSTED")
        .gte("transaction_date", input.from)
        .lte("transaction_date", input.to),
    ]);
    if (salesRes.error) mapDbError(salesRes.error);
    if (cashRes.error) mapDbError(cashRes.error);
    if (stockRes.error) mapDbError(stockRes.error);
    if (bankRes.error) mapDbError(bankRes.error);
    if (unmatchedRes.error) mapDbError(unmatchedRes.error);

    const sales = salesRes.data as Record<string, unknown> | null;
    const cash = cashRes.data as Record<string, unknown> | null;
    const stock = stockRes.data as Record<string, unknown> | null;
    const bank = bankRes.data as Record<string, unknown> | null;
    const salesDisplay = displayStatus(
      sales ? asStatus(sales.status) : null,
      moneyToCents(sales?.variance),
    );
    const cashDisplay = displayStatus(cash ? asStatus(cash.status) : null, moneyToCents(cash?.variance));
    const stockVarianceCount = Number(stock?.variance_count ?? 0);
    const unmatched = unmatchedRes.count ?? Number(bank?.unmatched_count ?? 0);

    const cards: ReconciliationOverviewCard[] = [
      {
        kind: "sales",
        href: "/supermarket/sales/reconciliation",
        title: "Sales Reconciliation",
        statusLabel: salesDisplay.label,
        detail: sales
          ? `Variance ${centsToMoney(moneyToCents(sales.variance))}`
          : "No reconciliation for this period",
        tone: salesDisplay.tone,
      },
      {
        kind: "cash",
        href: "/supermarket/finance/cash-reconciliation",
        title: "Cash Reconciliation",
        statusLabel: cashDisplay.label,
        detail: cash
          ? `Variance ${centsToMoney(moneyToCents(cash.variance))}`
          : "No reconciliation for this period",
        tone: cashDisplay.tone,
      },
      {
        kind: "stock",
        href: "/supermarket/stock/reconciliation",
        title: "Stock Reconciliation",
        statusLabel: stock
          ? stockVarianceCount === 0
            ? displayStatus(asStatus(stock.status), 0).label
            : `${stockVarianceCount} variance${stockVarianceCount === 1 ? "" : "s"}`
          : "No stocktake started",
        detail: stock
          ? `Variance value ${centsToMoney(moneyToCents(stock.variance_value))}`
          : "Physical counts have not been recorded",
        tone: !stock ? "neutral" : stockVarianceCount === 0 ? "ok" : "variance",
      },
      {
        kind: "bank",
        href: "/supermarket/finance/bank-reconciliation",
        title: "Bank Reconciliation",
        statusLabel: bank
          ? unmatched === 0
            ? displayStatus(asStatus(bank.status), moneyToCents(bank.difference)).label
            : `${unmatched} unmatched`
          : unmatched > 0
            ? `${unmatched} unmatched`
            : "No bank transactions imported",
        detail: bank
          ? `Difference ${centsToMoney(moneyToCents(bank.difference))}`
          : unmatched > 0
            ? "Statement lines await matching"
            : "Add a bank account and import statement lines",
        tone: unmatched > 0 || moneyToCents(bank?.difference) !== 0 ? "variance" : bank ? "ok" : "neutral",
      },
    ];

    return { ok: true as const, cards };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getReconciliationReportStripAction(input: { from: string; to: string }) {
  const overview = await getReconciliationOverviewAction(input);
  if (!overview.ok) return overview;
  return {
    ok: true as const,
    cards: overview.cards.map((card) => ({
      title: card.title,
      statusLabel: card.statusLabel,
      detail: card.detail,
      href: card.href,
    })),
  };
}
