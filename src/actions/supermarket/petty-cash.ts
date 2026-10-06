"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import { addCents, centsToMoney, moneyToCents } from "@/lib/supermarket/money";

export type PettyCashTxnType = "EXPENSE" | "REPLENISHMENT" | "REVERSAL" | "ADJUSTMENT";
export type PettyCashPostingStatus = "DRAFT" | "POSTED" | "REVERSED";
export type PettyCashSource = "NONE" | "MAIN_CASH" | "BANK";

export type PettyCashFund = {
  id: string;
  name: string;
  openingBalance: string;
  currentBalance: string;
  status: "ACTIVE" | "INACTIVE";
};

export type PettyCashTxn = {
  id: string;
  fundId: string;
  txnDate: string;
  txnType: PettyCashTxnType;
  category: string;
  description: string;
  amount: string;
  source: PettyCashSource;
  bankAccountId: string | null;
  reference: string;
  postingStatus: PettyCashPostingStatus;
  createdBy: string | null;
  createdByName: string;
};

async function caps() {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  return {
    canView: has("supermarket.petty_cash.view"),
    canCreate: has("supermarket.petty_cash.create"),
    canApprove: has("supermarket.petty_cash.approve"),
    isOwner: owner,
    userId: user.id,
  };
}

function asType(value: unknown): PettyCashTxnType {
  const type = String(value);
  if (type === "REPLENISHMENT" || type === "REVERSAL" || type === "ADJUSTMENT") return type;
  return "EXPENSE";
}

export async function getPettyCashWorkspaceAction(input: {
  from: string;
  to: string;
  type?: PettyCashTxnType | "ALL";
  status?: PettyCashPostingStatus | "ALL";
  category?: string;
  page?: number;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.petty_cash.view");
    const page = Math.max(1, input.page ?? 1);
    const pageSize = 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const fundRes = await supabase
      .from("sm_petty_cash_funds")
      .select("id, name, opening_balance, status")
      .eq("business_unit_id", businessUnitId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (fundRes.error) mapDbError(fundRes.error);

    const fundId = fundRes.data?.id ? String(fundRes.data.id) : null;
    let current = 0;
    let spent = 0;
    let replenished = 0;
    if (fundId) {
      const { data: balance, error: balanceError } = await supabase.rpc("sm_petty_cash_balance", {
        p_fund_id: fundId,
      });
      if (balanceError) mapDbError(balanceError);
      current = moneyToCents(balance);
      const postedRes = await supabase
        .from("sm_petty_cash_transactions")
        .select("txn_type, amount")
        .eq("fund_id", fundId)
        .eq("posting_status", "POSTED")
        .gte("txn_date", input.from)
        .lte("txn_date", input.to);
      if (postedRes.error) mapDbError(postedRes.error);
      for (const row of postedRes.data ?? []) {
        const amount = moneyToCents(row.amount);
        if (row.txn_type === "EXPENSE") spent = addCents(spent, amount);
        if (row.txn_type === "REPLENISHMENT") replenished = addCents(replenished, amount);
      }
    }

    const reconRes = fundId
      ? await supabase
          .from("sm_petty_cash_reconciliations")
          .select("id, variance, status, reconciliation_date, prepared_by")
          .eq("fund_id", fundId)
          .order("reconciliation_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (reconRes.error) mapDbError(reconRes.error);

    let txns: PettyCashTxn[] = [];
    let total = 0;
    if (fundId) {
      let query = supabase
        .from("sm_petty_cash_transactions")
        .select(
          "id, fund_id, txn_date, txn_type, category, description, amount, source, bank_account_id, reference, posting_status, created_by",
          { count: "exact" },
        )
        .eq("fund_id", fundId)
        .gte("txn_date", input.from)
        .lte("txn_date", input.to)
        .order("txn_date", { ascending: false })
        .range(from, to);
      if (input.type && input.type !== "ALL") query = query.eq("txn_type", input.type);
      if (input.status && input.status !== "ALL") query = query.eq("posting_status", input.status);
      if (input.category) query = query.eq("category", input.category);
      const listRes = await query;
      if (listRes.error) mapDbError(listRes.error);
      total = listRes.count ?? 0;
      const ids = [...new Set((listRes.data ?? []).map((row) => String(row.created_by || "")).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const profile of profiles ?? []) names.set(String(profile.id), String(profile.full_name || ""));
      }
      txns = (listRes.data ?? []).map((row) => ({
        id: String(row.id),
        fundId: String(row.fund_id),
        txnDate: String(row.txn_date),
        txnType: asType(row.txn_type),
        category: String(row.category ?? ""),
        description: String(row.description ?? ""),
        amount: centsToMoney(moneyToCents(row.amount)),
        source: (String(row.source || "NONE") as PettyCashSource) || "NONE",
        bankAccountId: row.bank_account_id ? String(row.bank_account_id) : null,
        reference: String(row.reference ?? ""),
        postingStatus: (String(row.posting_status) as PettyCashPostingStatus) || "DRAFT",
        createdBy: row.created_by ? String(row.created_by) : null,
        createdByName: row.created_by ? names.get(String(row.created_by)) || "Staff" : "Staff",
      }));
    }

    const accountsRes = await supabase
      .from("sm_bank_accounts")
      .select("id, bank_name, account_name, account_reference, opening_balance, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("bank_name");
    if (accountsRes.error) mapDbError(accountsRes.error);

    return {
      ok: true as const,
      fund: fundRes.data
        ? {
            id: String(fundRes.data.id),
            name: String(fundRes.data.name),
            openingBalance: centsToMoney(moneyToCents(fundRes.data.opening_balance)),
            currentBalance: centsToMoney(current),
            status: "ACTIVE" as const,
          }
        : null,
      summary: {
        currentBalance: centsToMoney(current),
        totalSpent: centsToMoney(spent),
        totalReplenished: centsToMoney(replenished),
        variance: centsToMoney(moneyToCents(reconRes.data?.variance)),
      },
      transactions: txns,
      page,
      pageSize,
      total,
      bankAccounts: (accountsRes.data ?? []).map((row) => ({
        id: String(row.id),
        bankName: String(row.bank_name),
        accountName: String(row.account_name),
      })),
      latestReconciliation: reconRes.data
        ? {
            id: String(reconRes.data.id),
            status: String(reconRes.data.status),
            date: String(reconRes.data.reconciliation_date),
            preparedBy: reconRes.data.prepared_by ? String(reconRes.data.prepared_by) : null,
          }
        : null,
      capabilities: await caps(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function savePettyCashFundAction(input: { name: string; openingBalance: string }) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission("supermarket.petty_cash.approve");
    const name = input.name.trim() || "Petty Cash";
    const opening = moneyToCents(input.openingBalance);
    if (opening < 0) throw new SupermarketError("Opening balance cannot be negative.", "VALIDATION");
    const { data, error } = await supabase
      .from("sm_petty_cash_funds")
      .insert({
        business_unit_id: businessUnitId,
        name,
        opening_balance: centsToMoney(opening),
        status: "ACTIVE",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "petty_cash.fund.created",
      description: `Created petty cash fund ${name}`,
      severity: "medium",
      entityType: "sm_petty_cash_funds",
      entityId: String(data?.id),
    });
    return { ok: true as const, id: String(data?.id) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function savePettyCashExpenseAction(input: {
  draftId?: string | null;
  fundId: string;
  amount: string;
  date: string;
  category: string;
  description: string;
  reference: string;
  notes: string;
  post: boolean;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      input.post ? "supermarket.petty_cash.approve" : "supermarket.petty_cash.create",
    );
    const access = await caps();
    const amount = moneyToCents(input.amount);
    if (amount <= 0) throw new SupermarketError("Amount must be positive.", "VALIDATION");
    if (!input.category.trim()) throw new SupermarketError("Category is required.", "VALIDATION");
    if (input.post && !access.isOwner) {
      if (!input.draftId) {
        throw new SupermarketError(
          "Segregation of duties: save a draft; another authorized user must post this expense.",
          "UNAUTHORIZED",
        );
      }
      const { data, error } = await supabase
        .from("sm_petty_cash_transactions")
        .select("created_by")
        .eq("id", input.draftId)
        .eq("business_unit_id", businessUnitId)
        .single();
      if (error) mapDbError(error);
      if (data?.created_by && String(data.created_by) === userId) {
        throw new SupermarketError("Segregation of duties: the preparer cannot post this expense.", "UNAUTHORIZED");
      }
    }
    const { data, error } = await supabase.rpc("sm_save_petty_cash_expense", {
      p_fund_id: input.fundId,
      p_amount: centsToMoney(amount),
      p_date: input.date,
      p_category: input.category.trim(),
      p_description: input.description.trim(),
      p_reference: input.reference.trim(),
      p_notes: input.notes.trim(),
      p_post: input.post,
      p_draft_id: input.draftId ?? null,
    });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: input.post ? "petty_cash.expense.posted" : "petty_cash.expense.created",
      description: input.post
        ? `Posted petty cash expense ${centsToMoney(amount)}`
        : `Saved petty cash expense draft ${centsToMoney(amount)}`,
      severity: input.post ? "high" : "medium",
      entityType: "sm_petty_cash_transactions",
      entityId: String(data),
    });
    return { ok: true as const, id: String(data) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function savePettyCashReplenishmentAction(input: {
  draftId?: string | null;
  fundId: string;
  amount: string;
  date: string;
  source: "MAIN_CASH" | "BANK";
  bankAccountId?: string | null;
  reference: string;
  description: string;
  notes: string;
  post: boolean;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      input.post ? "supermarket.petty_cash.approve" : "supermarket.petty_cash.create",
    );
    const access = await caps();
    const amount = moneyToCents(input.amount);
    if (amount <= 0) throw new SupermarketError("Amount must be positive.", "VALIDATION");
    if (input.source === "BANK" && !input.bankAccountId) {
      throw new SupermarketError("Select a bank account.", "VALIDATION");
    }
    if (input.post && !access.isOwner) {
      if (!input.draftId) {
        throw new SupermarketError(
          "Segregation of duties: save a draft; another authorized user must post this replenishment.",
          "UNAUTHORIZED",
        );
      }
      const { data, error } = await supabase
        .from("sm_petty_cash_transactions")
        .select("created_by")
        .eq("id", input.draftId)
        .eq("business_unit_id", businessUnitId)
        .single();
      if (error) mapDbError(error);
      if (data?.created_by && String(data.created_by) === userId) {
        throw new SupermarketError(
          "Segregation of duties: the preparer cannot post this replenishment.",
          "UNAUTHORIZED",
        );
      }
    }
    const { data, error } = await supabase.rpc("sm_save_petty_cash_replenishment", {
      p_fund_id: input.fundId,
      p_amount: centsToMoney(amount),
      p_date: input.date,
      p_source: input.source,
      p_bank_account_id: input.bankAccountId ?? null,
      p_reference: input.reference.trim(),
      p_description: input.description.trim(),
      p_notes: input.notes.trim(),
      p_post: input.post,
      p_draft_id: input.draftId ?? null,
    });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: input.post ? "petty_cash.replenishment.posted" : "petty_cash.replenishment.created",
      description: input.post
        ? `Posted petty cash replenishment ${centsToMoney(amount)}`
        : `Saved petty cash replenishment draft ${centsToMoney(amount)}`,
      severity: input.post ? "high" : "medium",
      entityType: "sm_petty_cash_transactions",
      entityId: String(data),
    });
    return { ok: true as const, id: String(data) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function reversePettyCashTransactionAction(id: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission("supermarket.petty_cash.approve");
    const access = await caps();
    const { data: original, error: originalError } = await supabase
      .from("sm_petty_cash_transactions")
      .select("created_by, posted_by, txn_type")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .single();
    if (originalError) mapDbError(originalError);
    if (!access.isOwner) {
      const actor = String(original?.posted_by || original?.created_by || "");
      if (actor && actor === userId) {
        throw new SupermarketError("Segregation of duties: the preparer cannot reverse this transaction.", "UNAUTHORIZED");
      }
    }
    const { data, error } = await supabase.rpc("sm_reverse_petty_cash_transaction", { p_id: id });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "petty_cash.transaction.reversed",
      description: `Reversed petty cash ${String(original?.txn_type || "transaction").toLowerCase()}`,
      severity: "high",
      entityType: "sm_petty_cash_transactions",
      entityId: String(data),
      metadata: { originalId: id },
    });
    return { ok: true as const, id: String(data) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function savePettyCashReconciliationAction(input: {
  fundId: string;
  date: string;
  actualCounted: string;
  varianceReason: string;
  notes: string;
  submit?: boolean;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      input.submit ? "supermarket.petty_cash.approve" : "supermarket.petty_cash.create",
    );
    const { data: balance, error: balanceError } = await supabase.rpc("sm_petty_cash_balance", {
      p_fund_id: input.fundId,
      p_as_of: input.date,
    });
    if (balanceError) mapDbError(balanceError);
    const system = moneyToCents(balance);
    const actual = moneyToCents(input.actualCounted);
    const variance = actual - system;
    if (input.submit && variance !== 0 && !input.varianceReason.trim()) {
      throw new SupermarketError("A variance reason is required when the variance is not zero.", "VALIDATION");
    }
    const { data: existing } = await supabase
      .from("sm_petty_cash_reconciliations")
      .select("id, status")
      .eq("fund_id", input.fundId)
      .eq("reconciliation_date", input.date)
      .maybeSingle();
    const payload = {
      business_unit_id: businessUnitId,
      fund_id: input.fundId,
      reconciliation_date: input.date,
      system_balance: centsToMoney(system),
      actual_counted: centsToMoney(actual),
      variance: centsToMoney(variance),
      variance_reason: input.varianceReason.trim(),
      notes: input.notes.trim(),
      status: input.submit ? "SUBMITTED" : "DRAFT",
      prepared_by: userId,
      prepared_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      if (String(existing.status) === "APPROVED") {
        throw new SupermarketError("This petty cash reconciliation is already approved.", "CONFLICT");
      }
      const { error } = await supabase.from("sm_petty_cash_reconciliations").update(payload).eq("id", existing.id);
      if (error) mapDbError(error);
    } else {
      const { error } = await supabase.from("sm_petty_cash_reconciliations").insert(payload);
      if (error) mapDbError(error);
    }
    await writeSupermarketAudit(businessUnitId, {
      action: "petty_cash.reconciled",
      description: `Recorded petty cash count for ${input.date}`,
      severity: "medium",
      entityType: "sm_petty_cash_reconciliations",
      entityId: input.fundId,
      metadata: { variance: centsToMoney(variance) },
    });
    return { ok: true as const, system: centsToMoney(system), variance: centsToMoney(variance) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approvePettyCashReconciliationAction(id: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission("supermarket.petty_cash.approve");
    const access = await caps();
    const { data, error } = await supabase
      .from("sm_petty_cash_reconciliations")
      .select("id, status, prepared_by")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .single();
    if (error) mapDbError(error);
    if (String(data?.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted reconciliation can be approved.", "CONFLICT");
    }
    if (!access.isOwner && data?.prepared_by && String(data.prepared_by) === userId) {
      throw new SupermarketError("Segregation of duties: the preparer cannot approve this reconciliation.", "UNAUTHORIZED");
    }
    const { error: updateError } = await supabase
      .from("sm_petty_cash_reconciliations")
      .update({
        status: "APPROVED",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SUBMITTED");
    if (updateError) mapDbError(updateError);
    await writeSupermarketAudit(businessUnitId, {
      action: "petty_cash.adjustment.approved",
      description: "Approved petty cash reconciliation",
      severity: "high",
      entityType: "sm_petty_cash_reconciliations",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getPettyCashReportStripAction(input: { from: string; to: string }) {
  const result = await getPettyCashWorkspaceAction({ from: input.from, to: input.to, page: 1 });
  if (!result.ok) return result;
  return {
    ok: true as const,
    currentBalance: result.summary.currentBalance,
    totalSpent: result.summary.totalSpent,
    totalReplenished: result.summary.totalReplenished,
    variance: result.summary.variance,
    count: result.total,
  };
}
