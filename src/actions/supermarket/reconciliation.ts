"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import { addCents, centsToMoney, moneyToCents } from "@/lib/supermarket/money";
import {
  breakdownFromCents,
  classifyPaymentMethod,
  displayStatus,
  periodBounds,
  type BankAccountRecord,
  type BankMatchStatus,
  type BankReconciliationRecord,
  type BankTransactionRecord,
  type CashReconciliationRecord,
  type ReconciliationCapabilities,
  type ReconciliationOverviewCard,
  type ReconciliationStatus,
  type SalesReconciliationRecord,
  type StockReconciliationHeader,
  type StockReconciliationItem,
} from "@/lib/supermarket/reconciliation";

const STOCKTAKE_PAGE_SIZE = 50;

type Ctx = Awaited<ReturnType<typeof requireSupermarketPermission>> & {
  isOwner: boolean;
};

async function reconCtx(permission: string): Promise<Ctx> {
  const ctx = await requireSupermarketPermission(permission);
  const user = await requireAuth();
  return { ...ctx, isOwner: isOwnerRole(user.roleCode) };
}

async function capabilities(): Promise<ReconciliationCapabilities> {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  return {
    canView: has("supermarket.reconciliation.view"),
    canCreate: has("supermarket.reconciliation.create"),
    canApprove: has("supermarket.reconciliation.approve"),
    canPost: has("supermarket.reconciliation.post"),
    isOwner: owner,
  };
}

function assertEditable(status: string) {
  if (status === "APPROVED" || status === "POSTED" || status === "VOID") {
    throw new SupermarketError("This reconciliation can no longer be edited.", "CONFLICT");
  }
}

function assertCanApprove(ctx: Ctx, preparedBy: string | null) {
  if (!ctx.isOwner && preparedBy && preparedBy === ctx.userId) {
    throw new SupermarketError(
      "Segregation of duties: the preparer cannot approve this reconciliation.",
      "UNAUTHORIZED",
    );
  }
}

function requireVarianceReason(varianceCents: number, reason: string) {
  if (varianceCents !== 0 && !reason.trim()) {
    throw new SupermarketError("A variance reason is required when the variance is not zero.", "VALIDATION");
  }
}

function asStatus(value: unknown): ReconciliationStatus {
  const status = String(value || "DRAFT");
  if (
    status === "DRAFT" ||
    status === "SUBMITTED" ||
    status === "APPROVED" ||
    status === "POSTED" ||
    status === "VOID"
  ) {
    return status;
  }
  return "DRAFT";
}

function mapSalesRow(row: Record<string, unknown>): SalesReconciliationRecord {
  const expected = breakdownFromCents({
    cash: moneyToCents(row.expected_cash),
    card: moneyToCents(row.expected_card),
    mobile: moneyToCents(row.expected_mobile),
    other: moneyToCents(row.expected_other),
  });
  const actual = breakdownFromCents({
    cash: moneyToCents(row.actual_cash),
    card: moneyToCents(row.actual_card),
    mobile: moneyToCents(row.actual_mobile),
    other: moneyToCents(row.actual_other),
  });
  return {
    id: String(row.id),
    reconciliationDate: String(row.reconciliation_date),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    expected: { ...expected, total: centsToMoney(moneyToCents(row.expected_total)) },
    expectedSales: centsToMoney(moneyToCents(row.expected_sales)),
    unpaidCredit: centsToMoney(moneyToCents(row.unpaid_credit)),
    actual: { ...actual, total: centsToMoney(moneyToCents(row.actual_total)) },
    variance: centsToMoney(moneyToCents(row.variance)),
    varianceReason: String(row.variance_reason ?? ""),
    notes: String(row.notes ?? ""),
    status: asStatus(row.status),
    preparedBy: row.prepared_by ? String(row.prepared_by) : null,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    preparedAt: row.prepared_at ? String(row.prepared_at) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
  };
}

function mapCashRow(row: Record<string, unknown>): CashReconciliationRecord {
  return {
    id: String(row.id),
    reconciliationDate: String(row.reconciliation_date),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    openingBalance: centsToMoney(moneyToCents(row.opening_balance)),
    cashIn: centsToMoney(moneyToCents(row.cash_in)),
    cashOut: centsToMoney(moneyToCents(row.cash_out)),
    expectedClosing: centsToMoney(moneyToCents(row.expected_closing)),
    actualCounted: centsToMoney(moneyToCents(row.actual_counted)),
    variance: centsToMoney(moneyToCents(row.variance)),
    varianceReason: String(row.variance_reason ?? ""),
    notes: String(row.notes ?? ""),
    status: asStatus(row.status),
    preparedBy: row.prepared_by ? String(row.prepared_by) : null,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
  };
}

async function expectedSalesTotals(
  supabase: Ctx["supabase"],
  businessUnitId: string,
  from: string,
  to: string,
) {
  const { fromIso, toIso } = periodBounds(from, to);
  const [salesRes, paymentsRes] = await Promise.all([
    supabase
      .from("sm_sales")
      .select("id, total")
      .eq("business_unit_id", businessUnitId)
      .eq("status", "COMPLETED")
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso),
    supabase
      .from("sm_sale_payments")
      .select("method, amount, sm_sales!inner(business_unit_id, sale_date, status)")
      .eq("sm_sales.business_unit_id", businessUnitId)
      .eq("sm_sales.status", "COMPLETED")
      .gte("sm_sales.sale_date", fromIso)
      .lte("sm_sales.sale_date", toIso),
  ]);
  if (salesRes.error) mapDbError(salesRes.error);
  if (paymentsRes.error) mapDbError(paymentsRes.error);

  const cents = { cash: 0, card: 0, mobile: 0, other: 0 };
  for (const row of paymentsRes.data ?? []) {
    const bucket = classifyPaymentMethod(String(row.method));
    cents[bucket] = addCents(cents[bucket], moneyToCents(row.amount));
  }
  const expectedSales = (salesRes.data ?? []).reduce(
    (sum, row) => addCents(sum, moneyToCents(row.total)),
    0,
  );
  const expectedTotal = addCents(cents.cash, cents.card, cents.mobile, cents.other);
  return {
    cents,
    expectedSales,
    expectedTotal,
    unpaidCredit: expectedSales - expectedTotal,
  };
}

async function expectedCashTotals(
  supabase: Ctx["supabase"],
  businessUnitId: string,
  from: string,
  to: string,
) {
  const [openingRes, periodRes] = await Promise.all([
    supabase
      .from("sm_payments")
      .select("direction, amount")
      .eq("business_unit_id", businessUnitId)
      .eq("method", "CASH")
      .lt("payment_date", from),
    supabase
      .from("sm_payments")
      .select("direction, amount")
      .eq("business_unit_id", businessUnitId)
      .eq("method", "CASH")
      .gte("payment_date", from)
      .lte("payment_date", to),
  ]);
  if (openingRes.error) mapDbError(openingRes.error);
  if (periodRes.error) mapDbError(periodRes.error);

  let opening = 0;
  for (const row of openingRes.data ?? []) {
    const amount = moneyToCents(row.amount);
    opening = addCents(opening, row.direction === "IN" ? amount : -amount);
  }
  let cashIn = 0;
  let cashOut = 0;
  for (const row of periodRes.data ?? []) {
    const amount = moneyToCents(row.amount);
    if (row.direction === "IN") cashIn = addCents(cashIn, amount);
    else cashOut = addCents(cashOut, amount);
  }
  return {
    opening,
    cashIn,
    cashOut,
    expectedClosing: addCents(opening, cashIn, -cashOut),
  };
}

export async function getReconciliationCapabilitiesAction() {
  try {
    await requireSupermarketContext();
    return { ok: true as const, capabilities: await capabilities() };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getReconciliationOverviewAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const [salesRes, cashRes, stockRes, bankRes, unmatchedRes] = await Promise.all([
      supabase
        .from("sm_sales_reconciliations")
        .select("status, variance, period_start, period_end")
        .eq("business_unit_id", businessUnitId)
        .eq("period_start", input.from)
        .eq("period_end", input.to)
        .neq("status", "VOID")
        .maybeSingle(),
      supabase
        .from("sm_cash_reconciliations")
        .select("status, variance, period_start, period_end")
        .eq("business_unit_id", businessUnitId)
        .eq("period_start", input.from)
        .eq("period_end", input.to)
        .neq("status", "VOID")
        .maybeSingle(),
      supabase
        .from("sm_stock_reconciliations")
        .select("status, variance_count, variance_value, stocktake_date")
        .eq("business_unit_id", businessUnitId)
        .gte("stocktake_date", input.from)
        .lte("stocktake_date", input.to)
        .neq("status", "VOID")
        .order("stocktake_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sm_bank_reconciliations")
        .select("status, difference, unmatched_count, statement_start, statement_end")
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

    return { ok: true as const, cards, capabilities: await capabilities() };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getSalesReconciliationWorkspaceAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const expected = await expectedSalesTotals(supabase, businessUnitId, input.from, input.to);
    const { data, error } = await supabase
      .from("sm_sales_reconciliations")
      .select(
        "id, reconciliation_date, period_start, period_end, expected_cash, expected_card, expected_mobile, expected_other, expected_total, expected_sales, unpaid_credit, actual_cash, actual_card, actual_mobile, actual_other, actual_total, variance, variance_reason, notes, status, prepared_by, approved_by, prepared_at, approved_at",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("period_start", input.from)
      .eq("period_end", input.to)
      .neq("status", "VOID")
      .maybeSingle();
    if (error) mapDbError(error);
    const liveExpected = breakdownFromCents(expected.cents);
    liveExpected.total = centsToMoney(expected.expectedTotal);
    return {
      ok: true as const,
      live: {
        expected: liveExpected,
        expectedSales: centsToMoney(expected.expectedSales),
        unpaidCredit: centsToMoney(expected.unpaidCredit),
      },
      record: data ? mapSalesRow(data as Record<string, unknown>) : null,
      capabilities: await capabilities(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function saveSalesReconciliationAction(input: {
  id?: string | null;
  from: string;
  to: string;
  actualCash: string;
  actualCard: string;
  actualMobile: string;
  actualOther: string;
  varianceReason: string;
  notes: string;
  submit?: boolean;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const expected = await expectedSalesTotals(ctx.supabase, ctx.businessUnitId, input.from, input.to);
    const actual = {
      cash: moneyToCents(input.actualCash),
      card: moneyToCents(input.actualCard),
      mobile: moneyToCents(input.actualMobile),
      other: moneyToCents(input.actualOther),
    };
    const actualTotal = addCents(actual.cash, actual.card, actual.mobile, actual.other);
    const variance = actualTotal - expected.expectedTotal;
    const reason = input.varianceReason.trim();
    if (input.submit) requireVarianceReason(variance, reason);
    const nextStatus = input.submit ? "SUBMITTED" : "DRAFT";
    const payload = {
      business_unit_id: ctx.businessUnitId,
      reconciliation_date: input.to,
      period_start: input.from,
      period_end: input.to,
      expected_cash: centsToMoney(expected.cents.cash),
      expected_card: centsToMoney(expected.cents.card),
      expected_mobile: centsToMoney(expected.cents.mobile),
      expected_other: centsToMoney(expected.cents.other),
      expected_total: centsToMoney(expected.expectedTotal),
      expected_sales: centsToMoney(expected.expectedSales),
      unpaid_credit: centsToMoney(expected.unpaidCredit),
      actual_cash: centsToMoney(actual.cash),
      actual_card: centsToMoney(actual.card),
      actual_mobile: centsToMoney(actual.mobile),
      actual_other: centsToMoney(actual.other),
      actual_total: centsToMoney(actualTotal),
      variance: centsToMoney(variance),
      variance_reason: reason,
      notes: input.notes.trim(),
      status: nextStatus,
      prepared_by: ctx.userId,
      prepared_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let id = input.id ?? null;
    if (id) {
      const { data: existing, error: existingError } = await ctx.supabase
        .from("sm_sales_reconciliations")
        .select("id, status, business_unit_id")
        .eq("id", id)
        .eq("business_unit_id", ctx.businessUnitId)
        .single();
      if (existingError) mapDbError(existingError);
      assertEditable(String(existing?.status));
      const { error } = await ctx.supabase.from("sm_sales_reconciliations").update(payload).eq("id", id);
      if (error) mapDbError(error);
    } else {
      const { data, error } = await ctx.supabase
        .from("sm_sales_reconciliations")
        .insert(payload)
        .select("id")
        .single();
      if (error) mapDbError(error);
      id = String(data?.id);
    }

    await writeSupermarketAudit(ctx.businessUnitId, {
      action: input.submit ? "sales.reconciliation.submitted" : "sales.reconciliation.created",
      description: input.submit
        ? `Submitted sales reconciliation for ${input.from} to ${input.to}`
        : `Saved sales reconciliation draft for ${input.from} to ${input.to}`,
      severity: input.submit ? "medium" : "low",
      entityType: "sm_sales_reconciliations",
      entityId: id,
      metadata: { variance: centsToMoney(variance), status: nextStatus },
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approveSalesReconciliationAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.approve");
    const { data, error } = await ctx.supabase
      .from("sm_sales_reconciliations")
      .select("id, status, prepared_by, variance, variance_reason")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(data?.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted reconciliation can be approved.", "CONFLICT");
    }
    assertCanApprove(ctx, data?.prepared_by ? String(data.prepared_by) : null);
    requireVarianceReason(moneyToCents(data?.variance), String(data?.variance_reason ?? ""));
    const { error: updateError } = await ctx.supabase
      .from("sm_sales_reconciliations")
      .update({
        status: "APPROVED",
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SUBMITTED");
    if (updateError) mapDbError(updateError);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "sales.reconciliation.approved",
      description: "Approved sales reconciliation",
      severity: "high",
      entityType: "sm_sales_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getCashReconciliationWorkspaceAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const expected = await expectedCashTotals(supabase, businessUnitId, input.from, input.to);
    const { data, error } = await supabase
      .from("sm_cash_reconciliations")
      .select(
        "id, reconciliation_date, period_start, period_end, opening_balance, cash_in, cash_out, expected_closing, actual_counted, variance, variance_reason, notes, status, prepared_by, approved_by",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("period_start", input.from)
      .eq("period_end", input.to)
      .neq("status", "VOID")
      .maybeSingle();
    if (error) mapDbError(error);
    return {
      ok: true as const,
      live: {
        openingBalance: centsToMoney(expected.opening),
        cashIn: centsToMoney(expected.cashIn),
        cashOut: centsToMoney(expected.cashOut),
        expectedClosing: centsToMoney(expected.expectedClosing),
      },
      record: data ? mapCashRow(data as Record<string, unknown>) : null,
      capabilities: await capabilities(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function saveCashReconciliationAction(input: {
  id?: string | null;
  from: string;
  to: string;
  actualCounted: string;
  varianceReason: string;
  notes: string;
  submit?: boolean;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const expected = await expectedCashTotals(ctx.supabase, ctx.businessUnitId, input.from, input.to);
    const actual = moneyToCents(input.actualCounted);
    const variance = actual - expected.expectedClosing;
    const reason = input.varianceReason.trim();
    if (input.submit) requireVarianceReason(variance, reason);
    const nextStatus = input.submit ? "SUBMITTED" : "DRAFT";
    const payload = {
      business_unit_id: ctx.businessUnitId,
      reconciliation_date: input.to,
      period_start: input.from,
      period_end: input.to,
      opening_balance: centsToMoney(expected.opening),
      cash_in: centsToMoney(expected.cashIn),
      cash_out: centsToMoney(expected.cashOut),
      expected_closing: centsToMoney(expected.expectedClosing),
      actual_counted: centsToMoney(actual),
      variance: centsToMoney(variance),
      variance_reason: reason,
      notes: input.notes.trim(),
      status: nextStatus,
      prepared_by: ctx.userId,
      prepared_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    let id = input.id ?? null;
    if (id) {
      const { data: existing, error: existingError } = await ctx.supabase
        .from("sm_cash_reconciliations")
        .select("status")
        .eq("id", id)
        .eq("business_unit_id", ctx.businessUnitId)
        .single();
      if (existingError) mapDbError(existingError);
      assertEditable(String(existing?.status));
      const { error } = await ctx.supabase.from("sm_cash_reconciliations").update(payload).eq("id", id);
      if (error) mapDbError(error);
    } else {
      const { data, error } = await ctx.supabase
        .from("sm_cash_reconciliations")
        .insert(payload)
        .select("id")
        .single();
      if (error) mapDbError(error);
      id = String(data?.id);
    }
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: input.submit ? "cash.reconciliation.submitted" : "cash.reconciliation.created",
      description: input.submit
        ? `Submitted cash reconciliation for ${input.from} to ${input.to}`
        : `Saved cash reconciliation draft for ${input.from} to ${input.to}`,
      severity: input.submit ? "medium" : "low",
      entityType: "sm_cash_reconciliations",
      entityId: id,
      metadata: { variance: centsToMoney(variance) },
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approveCashReconciliationAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.approve");
    const { data, error } = await ctx.supabase
      .from("sm_cash_reconciliations")
      .select("id, status, prepared_by, variance, variance_reason")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(data?.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted reconciliation can be approved.", "CONFLICT");
    }
    assertCanApprove(ctx, data?.prepared_by ? String(data.prepared_by) : null);
    requireVarianceReason(moneyToCents(data?.variance), String(data?.variance_reason ?? ""));
    const { error: updateError } = await ctx.supabase
      .from("sm_cash_reconciliations")
      .update({
        status: "APPROVED",
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SUBMITTED");
    if (updateError) mapDbError(updateError);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "cash.reconciliation.approved",
      description: "Approved cash reconciliation",
      severity: "high",
      entityType: "sm_cash_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getStockReconciliationWorkspaceAction(input: {
  date: string;
  categoryId?: string | null;
  search?: string;
  page?: number;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const page = Math.max(1, input.page ?? 1);
    const from = (page - 1) * STOCKTAKE_PAGE_SIZE;
    const to = from + STOCKTAKE_PAGE_SIZE - 1;
    let productsQuery = supabase
      .from("sm_products")
      .select("id, name, sku, buying_price, category_id", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("name")
      .range(from, to);
    if (input.categoryId) productsQuery = productsQuery.eq("category_id", input.categoryId);
    if (input.search?.trim()) {
      const q = input.search.trim().replace(/[%(),]/g, "");
      if (q) productsQuery = productsQuery.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
    }
    const [productsRes, categoriesRes, headerRes] = await Promise.all([
      productsQuery,
      supabase
        .from("sm_categories")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("sm_stock_reconciliations")
        .select(
          "id, stocktake_date, category_id, notes, status, variance_count, variance_value, prepared_by, approved_by, posted_at",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("stocktake_date", input.date)
        .neq("status", "VOID")
        .maybeSingle(),
    ]);
    if (productsRes.error) mapDbError(productsRes.error);
    if (categoriesRes.error) mapDbError(categoriesRes.error);
    if (headerRes.error) mapDbError(headerRes.error);

    const products = productsRes.data ?? [];
    const productIds = products.map((row) => String(row.id));
    const frozen = headerRes.data && asStatus(headerRes.data.status) !== "DRAFT";
    const [batchesRes, itemsRes] = await Promise.all([
      productIds.length
        ? supabase
            .from("sm_stock_batches")
            .select("product_id, quantity")
            .eq("business_unit_id", businessUnitId)
            .in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
      headerRes.data?.id
        ? supabase
            .from("sm_stock_reconciliation_items")
            .select(
              "id, product_id, system_qty, physical_qty, variance_qty, unit_cost, variance_value, reason, notes, posted_adjustment_id",
            )
            .eq("reconciliation_id", headerRes.data.id)
            .in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (batchesRes.error) mapDbError(batchesRes.error);
    if (itemsRes.error) mapDbError(itemsRes.error);

    const qtyByProduct = new Map<string, number>();
    for (const batch of batchesRes.data ?? []) {
      const id = String(batch.product_id);
      qtyByProduct.set(id, (qtyByProduct.get(id) ?? 0) + Number(batch.quantity || 0));
    }
    const savedByProduct = new Map(
      (itemsRes.data ?? []).map((row) => [String(row.product_id), row as Record<string, unknown>]),
    );

    const items: StockReconciliationItem[] = products.map((product) => {
      const productId = String(product.id);
      const saved = savedByProduct.get(productId);
      const liveQty = qtyByProduct.get(productId) ?? 0;
      const systemQty = frozen && saved ? Number(saved.system_qty || 0) : liveQty;
      const physicalQty =
        saved?.physical_qty == null || saved.physical_qty === ""
          ? null
          : Number(saved.physical_qty);
      const varianceQty = physicalQty == null ? 0 : physicalQty - systemQty;
      const unitCost = frozen && saved ? centsToMoney(moneyToCents(saved.unit_cost)) : centsToMoney(moneyToCents(product.buying_price));
      const varianceValue =
        frozen && saved
          ? centsToMoney(moneyToCents(saved.variance_value))
          : centsToMoney(varianceQty * moneyToCents(unitCost));
      return {
        id: saved ? String(saved.id) : null,
        productId,
        name: String(product.name),
        sku: String(product.sku ?? ""),
        systemQty,
        physicalQty,
        varianceQty,
        unitCost,
        varianceValue,
        reason: saved ? String(saved.reason ?? "") : "",
        notes: saved ? String(saved.notes ?? "") : "",
        postedAdjustmentId: saved?.posted_adjustment_id ? String(saved.posted_adjustment_id) : null,
      };
    });

    const header: StockReconciliationHeader | null = headerRes.data
      ? {
          id: String(headerRes.data.id),
          stocktakeDate: String(headerRes.data.stocktake_date),
          categoryId: headerRes.data.category_id ? String(headerRes.data.category_id) : null,
          notes: String(headerRes.data.notes ?? ""),
          status: asStatus(headerRes.data.status),
          varianceCount: Number(headerRes.data.variance_count || 0),
          varianceValue: centsToMoney(moneyToCents(headerRes.data.variance_value)),
          preparedBy: headerRes.data.prepared_by ? String(headerRes.data.prepared_by) : null,
          approvedBy: headerRes.data.approved_by ? String(headerRes.data.approved_by) : null,
          postedAt: headerRes.data.posted_at ? String(headerRes.data.posted_at) : null,
        }
      : null;

    return {
      ok: true as const,
      header,
      items,
      page,
      pageSize: STOCKTAKE_PAGE_SIZE,
      total: productsRes.count ?? items.length,
      categories: (categoriesRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
      capabilities: await capabilities(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

type StockItemInput = {
  productId: string;
  physicalQty: number | null;
  reason?: string;
  notes?: string;
};

async function upsertStockItems(
  ctx: Ctx,
  headerId: string,
  items: StockItemInput[],
  freeze: boolean,
) {
  if (!items.length) return;
  const productIds = [...new Set(items.map((item) => item.productId))];
  const [productsRes, batchesRes] = await Promise.all([
    ctx.supabase
      .from("sm_products")
      .select("id, buying_price")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("id", productIds),
    ctx.supabase
      .from("sm_stock_batches")
      .select("product_id, quantity")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("product_id", productIds),
  ]);
  if (productsRes.error) mapDbError(productsRes.error);
  if (batchesRes.error) mapDbError(batchesRes.error);
  const costByProduct = new Map(
    (productsRes.data ?? []).map((row) => [String(row.id), moneyToCents(row.buying_price)]),
  );
  const qtyByProduct = new Map<string, number>();
  for (const batch of batchesRes.data ?? []) {
    const id = String(batch.product_id);
    qtyByProduct.set(id, (qtyByProduct.get(id) ?? 0) + Number(batch.quantity || 0));
  }
  const rows = items.map((item) => {
    const systemQty = qtyByProduct.get(item.productId) ?? 0;
    const physicalQty =
      item.physicalQty == null || Number.isNaN(item.physicalQty) ? null : Math.trunc(item.physicalQty);
    if (physicalQty != null && physicalQty < 0) {
      throw new SupermarketError("Physical quantity cannot be negative.", "VALIDATION");
    }
    const varianceQty = physicalQty == null ? 0 : physicalQty - systemQty;
    const unitCost = costByProduct.get(item.productId) ?? 0;
    if (freeze && varianceQty !== 0 && !String(item.reason ?? "").trim()) {
      throw new SupermarketError("A reason is required for every stock variance.", "VALIDATION");
    }
    return {
      reconciliation_id: headerId,
      product_id: item.productId,
      system_qty: systemQty,
      physical_qty: physicalQty,
      variance_qty: varianceQty,
      unit_cost: centsToMoney(unitCost),
      variance_value: centsToMoney(varianceQty * unitCost),
      reason: String(item.reason ?? "").trim(),
      notes: String(item.notes ?? "").trim(),
    };
  });
  const { error } = await ctx.supabase
    .from("sm_stock_reconciliation_items")
    .upsert(rows, { onConflict: "reconciliation_id,product_id" });
  if (error) mapDbError(error);

  const { data: summary, error: summaryError } = await ctx.supabase
    .from("sm_stock_reconciliation_items")
    .select("variance_qty, variance_value")
    .eq("reconciliation_id", headerId);
  if (summaryError) mapDbError(summaryError);
  const varianceCount = (summary ?? []).filter((row) => Number(row.variance_qty || 0) !== 0).length;
  const varianceValue = (summary ?? []).reduce(
    (sum, row) => addCents(sum, moneyToCents(row.variance_value)),
    0,
  );
  const { error: headerError } = await ctx.supabase
    .from("sm_stock_reconciliations")
    .update({
      variance_count: varianceCount,
      variance_value: centsToMoney(varianceValue),
      updated_at: new Date().toISOString(),
    })
    .eq("id", headerId);
  if (headerError) mapDbError(headerError);
}

export async function saveStockReconciliationAction(input: {
  id?: string | null;
  date: string;
  categoryId?: string | null;
  notes?: string;
  items: StockItemInput[];
  submit?: boolean;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    let id = input.id ?? null;
    if (id) {
      const { data: existing, error } = await ctx.supabase
        .from("sm_stock_reconciliations")
        .select("id, status")
        .eq("id", id)
        .eq("business_unit_id", ctx.businessUnitId)
        .single();
      if (error) mapDbError(error);
      assertEditable(String(existing?.status));
    } else {
      const { data, error } = await ctx.supabase
        .from("sm_stock_reconciliations")
        .insert({
          business_unit_id: ctx.businessUnitId,
          stocktake_date: input.date,
          category_id: input.categoryId || null,
          notes: input.notes?.trim() ?? "",
          status: "DRAFT",
          prepared_by: ctx.userId,
          prepared_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) mapDbError(error);
      id = String(data?.id);
    }
    await upsertStockItems(ctx, id!, input.items, Boolean(input.submit));
    if (input.submit) {
      const { error } = await ctx.supabase
        .from("sm_stock_reconciliations")
        .update({
          status: "SUBMITTED",
          notes: input.notes?.trim() ?? "",
          prepared_by: ctx.userId,
          prepared_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) mapDbError(error);
    } else {
      const { error } = await ctx.supabase
        .from("sm_stock_reconciliations")
        .update({
          notes: input.notes?.trim() ?? "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) mapDbError(error);
    }
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: input.submit ? "stock.reconciliation.submitted" : "stock.reconciliation.created",
      description: input.submit
        ? `Submitted stocktake for ${input.date}`
        : `Saved stocktake draft for ${input.date}`,
      severity: input.submit ? "medium" : "low",
      entityType: "sm_stock_reconciliations",
      entityId: id,
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approveStockReconciliationAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.approve");
    const { data, error } = await ctx.supabase
      .from("sm_stock_reconciliations")
      .select("id, status, prepared_by")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(data?.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted stocktake can be approved.", "CONFLICT");
    }
    assertCanApprove(ctx, data?.prepared_by ? String(data.prepared_by) : null);
    const { error: updateError } = await ctx.supabase
      .from("sm_stock_reconciliations")
      .update({
        status: "APPROVED",
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SUBMITTED");
    if (updateError) mapDbError(updateError);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "stock.reconciliation.approved",
      description: "Approved stock reconciliation",
      severity: "high",
      entityType: "sm_stock_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function postStockReconciliationAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.post");
    const { data: header, error } = await ctx.supabase
      .from("sm_stock_reconciliations")
      .select("id, status, posted_at")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(header?.status) === "POSTED" || header?.posted_at) {
      throw new SupermarketError("This stocktake has already been posted.", "CONFLICT");
    }
    if (String(header?.status) !== "APPROVED") {
      throw new SupermarketError("Stock variances can be posted only after approval.", "CONFLICT");
    }
    const { data: items, error: itemsError } = await ctx.supabase
      .from("sm_stock_reconciliation_items")
      .select("id, product_id, variance_qty, reason, notes, posted_adjustment_id")
      .eq("reconciliation_id", id);
    if (itemsError) mapDbError(itemsError);

    for (const item of items ?? []) {
      if (item.posted_adjustment_id) continue;
      const variance = Number(item.variance_qty || 0);
      if (variance === 0) continue;
      const quantity = Math.abs(variance);
      const { data: adjId, error: adjError } = await ctx.supabase.rpc("sm_adjust_stock", {
        p_product_id: item.product_id,
        p_kind: "Correction",
        p_quantity: quantity,
        p_location: "Main Store",
        p_reason: String(item.reason || "Stocktake variance"),
        p_note: `STOCKTAKE:${id}`,
        p_correction_direction: variance > 0 ? "increase" : "decrease",
      });
      if (adjError) mapDbError(adjError);
      const { error: markError } = await ctx.supabase
        .from("sm_stock_reconciliation_items")
        .update({ posted_adjustment_id: adjId })
        .eq("id", item.id)
        .is("posted_adjustment_id", null);
      if (markError) mapDbError(markError);
    }

    const { data: remaining, error: remainingError } = await ctx.supabase
      .from("sm_stock_reconciliation_items")
      .select("id")
      .eq("reconciliation_id", id)
      .neq("variance_qty", 0)
      .is("posted_adjustment_id", null);
    if (remainingError) mapDbError(remainingError);
    if ((remaining ?? []).length > 0) {
      throw new SupermarketError("Not all stock variances could be posted.", "CONFLICT");
    }

    const { error: postError } = await ctx.supabase
      .from("sm_stock_reconciliations")
      .update({
        status: "POSTED",
        posted_by: ctx.userId,
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "APPROVED");
    if (postError) mapDbError(postError);

    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "stock.reconciliation.posted",
      description: "Posted approved stocktake variances through stock adjustments",
      severity: "high",
      entityType: "sm_stock_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

function mapBankAccount(row: Record<string, unknown>): BankAccountRecord {
  return {
    id: String(row.id),
    bankName: String(row.bank_name),
    accountName: String(row.account_name),
    accountReference: String(row.account_reference ?? ""),
    openingBalance: centsToMoney(moneyToCents(row.opening_balance)),
    isActive: Boolean(row.is_active),
  };
}

function mapBankTxn(row: Record<string, unknown>): BankTransactionRecord {
  return {
    id: String(row.id),
    bankAccountId: String(row.bank_account_id),
    transactionDate: String(row.transaction_date),
    reference: String(row.reference ?? ""),
    description: String(row.description ?? ""),
    debit: centsToMoney(moneyToCents(row.debit)),
    credit: centsToMoney(moneyToCents(row.credit)),
    amount: centsToMoney(moneyToCents(row.amount)),
    source: row.source === "SYSTEM" ? "SYSTEM" : "STATEMENT",
    externalReference: String(row.external_reference ?? ""),
    status: (String(row.status || "UNMATCHED") as BankMatchStatus) || "UNMATCHED",
  };
}

export async function getBankWorkspaceAction(input: {
  accountId?: string | null;
  from: string;
  to: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.reconciliation.view",
    );
    const accountsRes = await supabase
      .from("sm_bank_accounts")
      .select("id, bank_name, account_name, account_reference, opening_balance, is_active")
      .eq("business_unit_id", businessUnitId)
      .order("bank_name");
    if (accountsRes.error) mapDbError(accountsRes.error);
    const accounts = (accountsRes.data ?? []).map((row) => mapBankAccount(row as Record<string, unknown>));
    const accountId = input.accountId || accounts.find((item) => item.isActive)?.id || accounts[0]?.id || null;
    if (!accountId) {
      return {
        ok: true as const,
        accounts,
        accountId: null,
        transactions: [] as BankTransactionRecord[],
        record: null as BankReconciliationRecord | null,
        capabilities: await capabilities(),
      };
    }
    const [txnRes, reconRes] = await Promise.all([
      supabase
        .from("sm_bank_transactions")
        .select(
          "id, bank_account_id, transaction_date, reference, description, debit, credit, amount, source, external_reference, status, posting_status, movement_type",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("bank_account_id", accountId)
        .eq("posting_status", "POSTED")
        .gte("transaction_date", input.from)
        .lte("transaction_date", input.to)
        .order("transaction_date", { ascending: true })
        .limit(500),
      supabase
        .from("sm_bank_reconciliations")
        .select(
          "id, bank_account_id, statement_start, statement_end, statement_opening_balance, statement_closing_balance, system_closing_balance, difference, unmatched_count, notes, status, prepared_by, approved_by",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("bank_account_id", accountId)
        .eq("statement_start", input.from)
        .eq("statement_end", input.to)
        .neq("status", "VOID")
        .maybeSingle(),
    ]);
    if (txnRes.error) mapDbError(txnRes.error);
    if (reconRes.error) mapDbError(reconRes.error);
    return {
      ok: true as const,
      accounts,
      accountId,
      transactions: (txnRes.data ?? []).map((row) => mapBankTxn(row as Record<string, unknown>)),
      record: reconRes.data
        ? {
            id: String(reconRes.data.id),
            bankAccountId: String(reconRes.data.bank_account_id),
            statementStart: String(reconRes.data.statement_start),
            statementEnd: String(reconRes.data.statement_end),
            statementOpeningBalance: centsToMoney(moneyToCents(reconRes.data.statement_opening_balance)),
            statementClosingBalance: centsToMoney(moneyToCents(reconRes.data.statement_closing_balance)),
            systemClosingBalance: centsToMoney(moneyToCents(reconRes.data.system_closing_balance)),
            difference: centsToMoney(moneyToCents(reconRes.data.difference)),
            unmatchedCount: Number(reconRes.data.unmatched_count || 0),
            notes: String(reconRes.data.notes ?? ""),
            status: asStatus(reconRes.data.status),
            preparedBy: reconRes.data.prepared_by ? String(reconRes.data.prepared_by) : null,
            approvedBy: reconRes.data.approved_by ? String(reconRes.data.approved_by) : null,
          }
        : null,
      capabilities: await capabilities(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function saveBankAccountAction(input: {
  id?: string | null;
  bankName: string;
  accountName: string;
  accountReference: string;
  openingBalance: string;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    if (!input.bankName.trim() || !input.accountName.trim()) {
      throw new SupermarketError("Bank name and account name are required.", "VALIDATION");
    }
    const payload = {
      business_unit_id: ctx.businessUnitId,
      bank_name: input.bankName.trim(),
      account_name: input.accountName.trim(),
      account_reference: input.accountReference.trim(),
      opening_balance: centsToMoney(moneyToCents(input.openingBalance)),
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (input.id) {
      const { error } = await ctx.supabase
        .from("sm_bank_accounts")
        .update(payload)
        .eq("id", input.id)
        .eq("business_unit_id", ctx.businessUnitId);
      if (error) mapDbError(error);
      return { ok: true as const, id: input.id };
    }
    const { data, error } = await ctx.supabase.from("sm_bank_accounts").insert(payload).select("id").single();
    if (error) mapDbError(error);
    return { ok: true as const, id: String(data?.id) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function addBankStatementLineAction(input: {
  accountId: string;
  transactionDate: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const debit = moneyToCents(input.debit);
    const credit = moneyToCents(input.credit);
    if (debit === 0 && credit === 0) {
      throw new SupermarketError("Enter a debit or credit amount.", "VALIDATION");
    }
    const { error } = await ctx.supabase.from("sm_bank_transactions").insert({
      business_unit_id: ctx.businessUnitId,
      bank_account_id: input.accountId,
      transaction_date: input.transactionDate,
      reference: input.reference.trim(),
      description: input.description.trim(),
      debit: centsToMoney(debit),
      credit: centsToMoney(credit),
      source: "STATEMENT",
      status: "UNMATCHED",
      created_by: ctx.userId,
    });
    if (error) mapDbError(error);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "bank.statement.imported",
      description: "Entered a bank statement line",
      severity: "low",
      entityType: "sm_bank_transactions",
      entityId: input.accountId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function importBankStatementCsvAction(input: { accountId: string; csv: string }) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const lines = input.csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) throw new SupermarketError("CSV is empty.", "VALIDATION");
    const header = lines[0].toLowerCase();
    const start = header.includes("date") ? 1 : 0;
    const rows = [];
    for (const line of lines.slice(start)) {
      const parts = line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
      const [date, reference = "", description = "", debit = "0", credit = "0"] = parts;
      if (!date) continue;
      const debitCents = moneyToCents(debit);
      const creditCents = moneyToCents(credit);
      if (debitCents === 0 && creditCents === 0) continue;
      rows.push({
        business_unit_id: ctx.businessUnitId,
        bank_account_id: input.accountId,
        transaction_date: date,
        reference,
        description,
        debit: centsToMoney(debitCents),
        credit: centsToMoney(creditCents),
        source: "STATEMENT",
        status: "UNMATCHED",
        created_by: ctx.userId,
      });
    }
    if (!rows.length) throw new SupermarketError("No valid statement lines were found in the CSV.", "VALIDATION");
    const { error } = await ctx.supabase.from("sm_bank_transactions").insert(rows);
    if (error) mapDbError(error);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "bank.statement.imported",
      description: `Imported ${rows.length} bank statement line${rows.length === 1 ? "" : "s"}`,
      severity: "medium",
      entityType: "sm_bank_accounts",
      entityId: input.accountId,
      metadata: { count: rows.length },
    });
    return { ok: true as const, count: rows.length };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function loadSystemBankPaymentsAction(input: {
  accountId: string;
  from: string;
  to: string;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const { data, error } = await ctx.supabase
      .from("sm_payments")
      .select("id, direction, amount, payment_date, reference, notes, kind")
      .eq("business_unit_id", ctx.businessUnitId)
      .eq("method", "BANK")
      .gte("payment_date", input.from)
      .lte("payment_date", input.to);
    if (error) mapDbError(error);
    const rows = (data ?? []).map((payment) => {
      const amount = moneyToCents(payment.amount);
      const inbound = payment.direction === "IN";
      return {
        business_unit_id: ctx.businessUnitId,
        bank_account_id: input.accountId,
        transaction_date: String(payment.payment_date),
        reference: String(payment.reference ?? ""),
        description: String(payment.notes || payment.kind || "Bank payment"),
        debit: inbound ? "0.00" : centsToMoney(amount),
        credit: inbound ? centsToMoney(amount) : "0.00",
        source: "SYSTEM",
        external_reference: String(payment.id),
        status: "UNMATCHED",
        created_by: ctx.userId,
      };
    });
    if (!rows.length) return { ok: true as const, count: 0 };
    const { data: existing, error: existingError } = await ctx.supabase
      .from("sm_bank_transactions")
      .select("external_reference")
      .eq("business_unit_id", ctx.businessUnitId)
      .eq("bank_account_id", input.accountId)
      .eq("source", "SYSTEM")
      .in(
        "external_reference",
        rows.map((row) => row.external_reference),
      );
    if (existingError) mapDbError(existingError);
    const seen = new Set((existing ?? []).map((row) => String(row.external_reference)));
    const fresh = rows.filter((row) => !seen.has(row.external_reference));
    if (!fresh.length) return { ok: true as const, count: 0 };
    const { error: insertError } = await ctx.supabase.from("sm_bank_transactions").insert(fresh);
    if (insertError) mapDbError(insertError);
    return { ok: true as const, count: fresh.length };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function saveBankReconciliationAction(input: {
  id?: string | null;
  accountId: string;
  from: string;
  to: string;
  statementOpening: string;
  statementClosing: string;
  notes: string;
  submit?: boolean;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const { data: account, error: accountError } = await ctx.supabase
      .from("sm_bank_accounts")
      .select("opening_balance")
      .eq("id", input.accountId)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (accountError) mapDbError(accountError);
    const { data: systemTxns, error: sysError } = await ctx.supabase
      .from("sm_bank_transactions")
      .select("amount, status, transaction_date, source, posting_status")
      .eq("bank_account_id", input.accountId)
      .eq("posting_status", "POSTED")
      .lte("transaction_date", input.to);
    if (sysError) mapDbError(sysError);
    const systemClosing = addCents(
      moneyToCents(account?.opening_balance),
      ...(systemTxns ?? [])
        .filter((row) => row.source === "SYSTEM")
        .map((row) => moneyToCents(row.amount)),
    );
    const unmatchedCount = (systemTxns ?? []).filter(
      (row) =>
        String(row.transaction_date) >= input.from &&
        String(row.transaction_date) <= input.to &&
        row.status === "UNMATCHED",
    ).length;
    const closing = moneyToCents(input.statementClosing);
    const difference = closing - systemClosing;
    const nextStatus = input.submit ? "SUBMITTED" : "DRAFT";
    const payload = {
      business_unit_id: ctx.businessUnitId,
      bank_account_id: input.accountId,
      statement_start: input.from,
      statement_end: input.to,
      statement_opening_balance: centsToMoney(moneyToCents(input.statementOpening)),
      statement_closing_balance: centsToMoney(closing),
      system_closing_balance: centsToMoney(systemClosing),
      difference: centsToMoney(difference),
      unmatched_count: unmatchedCount,
      notes: input.notes.trim(),
      status: nextStatus,
      prepared_by: ctx.userId,
      prepared_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    let id = input.id ?? null;
    if (id) {
      const { data: existing, error } = await ctx.supabase
        .from("sm_bank_reconciliations")
        .select("status")
        .eq("id", id)
        .eq("business_unit_id", ctx.businessUnitId)
        .single();
      if (error) mapDbError(error);
      assertEditable(String(existing?.status));
      const { error: updateError } = await ctx.supabase.from("sm_bank_reconciliations").update(payload).eq("id", id);
      if (updateError) mapDbError(updateError);
    } else {
      const { data, error } = await ctx.supabase
        .from("sm_bank_reconciliations")
        .insert(payload)
        .select("id")
        .single();
      if (error) mapDbError(error);
      id = String(data?.id);
    }
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: input.submit ? "bank.reconciliation.submitted" : "bank.reconciliation.created",
      description: input.submit ? "Submitted bank reconciliation" : "Saved bank reconciliation draft",
      severity: input.submit ? "medium" : "low",
      entityType: "sm_bank_reconciliations",
      entityId: id,
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function matchBankTransactionsAction(input: {
  reconciliationId?: string | null;
  leftId: string;
  rightId: string;
  manual?: boolean;
}) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    if (input.leftId === input.rightId) {
      throw new SupermarketError("Select two different transactions to match.", "VALIDATION");
    }
    const { data: txns, error } = await ctx.supabase
      .from("sm_bank_transactions")
      .select("id, amount, transaction_date, reference, external_reference, source, status, bank_account_id")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("id", [input.leftId, input.rightId]);
    if (error) mapDbError(error);
    if ((txns ?? []).length !== 2) throw new SupermarketError("Transactions were not found.", "NOT_FOUND");
    const [a, b] = txns!;
    if (a.bank_account_id !== b.bank_account_id) {
      throw new SupermarketError("Transactions must belong to the same bank account.", "VALIDATION");
    }
    if (a.source === b.source) {
      throw new SupermarketError("Match a statement line to a system line.", "VALIDATION");
    }
    if (!input.manual) {
      const amountMatch = moneyToCents(a.amount) === moneyToCents(b.amount) * -1 || moneyToCents(a.amount) === moneyToCents(b.amount);
      // Statement credit vs system credit should equal in absolute value of stored amount (credit-debit).
      const absEqual = Math.abs(moneyToCents(a.amount)) === Math.abs(moneyToCents(b.amount));
      const dateMatch = String(a.transaction_date) === String(b.transaction_date);
      const refA = String(a.reference || a.external_reference || "").trim();
      const refB = String(b.reference || b.external_reference || "").trim();
      const refMatch = Boolean(refA) && refA === refB;
      if (!absEqual || (!dateMatch && !refMatch)) {
        throw new SupermarketError(
          "Automatic match requires the same amount and either the same date or the same reference. Use manual match if this is intentional.",
          "VALIDATION",
        );
      }
      void amountMatch;
    }
    const status = input.manual ? "MANUALLY_MATCHED" : "MATCHED";
    const { error: updateError } = await ctx.supabase
      .from("sm_bank_transactions")
      .update({ status })
      .in("id", [input.leftId, input.rightId])
      .eq("status", "UNMATCHED");
    if (updateError) mapDbError(updateError);
    if (input.reconciliationId) {
      const rows = [
        {
          reconciliation_id: input.reconciliationId,
          bank_transaction_id: input.leftId,
          matched_transaction_id: input.rightId,
          match_status: status,
        },
        {
          reconciliation_id: input.reconciliationId,
          bank_transaction_id: input.rightId,
          matched_transaction_id: input.leftId,
          match_status: status,
        },
      ];
      const { error: itemError } = await ctx.supabase
        .from("sm_bank_reconciliation_items")
        .upsert(rows, { onConflict: "reconciliation_id,bank_transaction_id" });
      if (itemError) mapDbError(itemError);
    }
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "bank.reconciliation.item.matched",
      description: input.manual ? "Manually matched bank transactions" : "Matched bank transactions",
      severity: "medium",
      entityType: "sm_bank_transactions",
      entityId: input.leftId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function unmatchBankTransactionAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.create");
    const { data, error } = await ctx.supabase
      .from("sm_bank_transactions")
      .select("id, status")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    const { error: updateError } = await ctx.supabase
      .from("sm_bank_transactions")
      .update({ status: "UNMATCHED" })
      .eq("id", id);
    if (updateError) mapDbError(updateError);
    const { error: itemError } = await ctx.supabase
      .from("sm_bank_reconciliation_items")
      .update({ match_status: "UNMATCHED", matched_transaction_id: null })
      .eq("bank_transaction_id", id);
    if (itemError) mapDbError(itemError);
    void data;
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approveBankReconciliationAction(id: string) {
  try {
    const ctx = await reconCtx("supermarket.reconciliation.approve");
    const { data, error } = await ctx.supabase
      .from("sm_bank_reconciliations")
      .select("id, status, prepared_by, unmatched_count")
      .eq("id", id)
      .eq("business_unit_id", ctx.businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(data?.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted reconciliation can be approved.", "CONFLICT");
    }
    assertCanApprove(ctx, data?.prepared_by ? String(data.prepared_by) : null);
    const { error: updateError } = await ctx.supabase
      .from("sm_bank_reconciliations")
      .update({
        status: "APPROVED",
        approved_by: ctx.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SUBMITTED");
    if (updateError) mapDbError(updateError);
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "bank.reconciliation.approved",
      description: "Approved bank reconciliation",
      severity: "high",
      entityType: "sm_bank_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
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
