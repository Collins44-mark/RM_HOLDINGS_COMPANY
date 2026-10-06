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
import type { BankAccountRecord, BankMatchStatus } from "@/lib/supermarket/reconciliation";

export type BankMovementType = "DEPOSIT" | "WITHDRAWAL";
export type BankPostingStatus = "DRAFT" | "POSTED" | "REVERSED";

export type BankMovementRecord = {
  id: string;
  bankAccountId: string;
  bankName: string;
  accountName: string;
  transactionDate: string;
  movementType: BankMovementType;
  amount: string;
  reference: string;
  description: string;
  notes: string;
  postingStatus: BankPostingStatus;
  matchStatus: BankMatchStatus;
  reversedFromId: string | null;
  createdBy: string | null;
};

export type BankMovementCapabilities = {
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
  isOwner: boolean;
};

async function bankingCaps(): Promise<BankMovementCapabilities> {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  return {
    canView: has("supermarket.banking.view") || has("supermarket.reconciliation.view"),
    canCreate: has("supermarket.banking.create"),
    canApprove: has("supermarket.banking.approve"),
    isOwner: owner,
  };
}

function mapAccount(row: Record<string, unknown>): BankAccountRecord {
  return {
    id: String(row.id),
    bankName: String(row.bank_name),
    accountName: String(row.account_name),
    accountReference: String(row.account_reference ?? ""),
    openingBalance: centsToMoney(moneyToCents(row.opening_balance)),
    isActive: Boolean(row.is_active),
  };
}

function mapMovement(row: Record<string, unknown>): BankMovementRecord {
  const account = row.sm_bank_accounts as Record<string, unknown> | Record<string, unknown>[] | null;
  const nested = Array.isArray(account) ? account[0] : account;
  const type = String(row.movement_type) === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT";
  const posting = String(row.posting_status || "POSTED");
  return {
    id: String(row.id),
    bankAccountId: String(row.bank_account_id),
    bankName: nested ? String(nested.bank_name ?? "") : "",
    accountName: nested ? String(nested.account_name ?? "") : "",
    transactionDate: String(row.transaction_date),
    movementType: type,
    amount: centsToMoney(addCents(moneyToCents(row.debit), moneyToCents(row.credit))),
    reference: String(row.reference ?? ""),
    description: String(row.description ?? ""),
    notes: String(row.notes ?? ""),
    postingStatus:
      posting === "DRAFT" || posting === "REVERSED" || posting === "POSTED" ? posting : "POSTED",
    matchStatus: (String(row.status || "UNMATCHED") as BankMatchStatus) || "UNMATCHED",
    reversedFromId: row.reversed_from_id ? String(row.reversed_from_id) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export async function getBankMovementsWorkspaceAction(input: {
  from: string;
  to: string;
  accountId?: string | null;
  movementType?: BankMovementType | "ALL";
  postingStatus?: BankPostingStatus | "ALL";
  matchStatus?: BankMatchStatus | "ALL";
  page?: number;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.banking.view");
    const page = Math.max(1, input.page ?? 1);
    const pageSize = 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const accountsRes = await supabase
      .from("sm_bank_accounts")
      .select("id, bank_name, account_name, account_reference, opening_balance, is_active")
      .eq("business_unit_id", businessUnitId)
      .order("bank_name");
    if (accountsRes.error) mapDbError(accountsRes.error);
    const accounts = (accountsRes.data ?? []).map((row) => mapAccount(row as Record<string, unknown>));

    let query = supabase
      .from("sm_bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, reference, description, notes, debit, credit, status, movement_type, posting_status, reversed_from_id, created_by, sm_bank_accounts(bank_name, account_name)",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .eq("source", "SYSTEM")
      .in("movement_type", ["DEPOSIT", "WITHDRAWAL"])
      .gte("transaction_date", input.from)
      .lte("transaction_date", input.to)
      .order("transaction_date", { ascending: false })
      .range(from, to);

    if (input.accountId) query = query.eq("bank_account_id", input.accountId);
    if (input.movementType && input.movementType !== "ALL") query = query.eq("movement_type", input.movementType);
    if (input.postingStatus && input.postingStatus !== "ALL") query = query.eq("posting_status", input.postingStatus);
    if (input.matchStatus && input.matchStatus !== "ALL") query = query.eq("status", input.matchStatus);

    const [listRes, totalsRes, unmatchedRes] = await Promise.all([
      query,
      supabase
        .from("sm_bank_transactions")
        .select("movement_type, debit, credit, posting_status")
        .eq("business_unit_id", businessUnitId)
        .eq("source", "SYSTEM")
        .in("movement_type", ["DEPOSIT", "WITHDRAWAL"])
        .eq("posting_status", "POSTED")
        .gte("transaction_date", input.from)
        .lte("transaction_date", input.to),
      supabase
        .from("sm_bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("source", "SYSTEM")
        .in("movement_type", ["DEPOSIT", "WITHDRAWAL"])
        .eq("posting_status", "POSTED")
        .eq("status", "UNMATCHED")
        .gte("transaction_date", input.from)
        .lte("transaction_date", input.to),
    ]);
    if (listRes.error) mapDbError(listRes.error);
    if (totalsRes.error) mapDbError(totalsRes.error);
    if (unmatchedRes.error) mapDbError(unmatchedRes.error);

    let deposits = 0;
    let withdrawals = 0;
    for (const row of totalsRes.data ?? []) {
      const amount = addCents(moneyToCents(row.debit), moneyToCents(row.credit));
      if (row.movement_type === "DEPOSIT") deposits = addCents(deposits, amount);
      else withdrawals = addCents(withdrawals, amount);
    }

    return {
      ok: true as const,
      accounts,
      movements: (listRes.data ?? []).map((row) => mapMovement(row as Record<string, unknown>)),
      page,
      pageSize,
      total: listRes.count ?? 0,
      summary: {
        deposits: centsToMoney(deposits),
        withdrawals: centsToMoney(withdrawals),
        net: centsToMoney(deposits - withdrawals),
        unmatched: unmatchedRes.count ?? 0,
      },
      capabilities: await bankingCaps(),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function saveBankMovementAction(input: {
  draftId?: string | null;
  accountId: string;
  movementType: BankMovementType;
  amount: string;
  date: string;
  reference: string;
  description: string;
  notes: string;
  post: boolean;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      input.post ? "supermarket.banking.approve" : "supermarket.banking.create",
    );
    const user = await requireAuth();
    const owner = isOwnerRole(user.roleCode);
    const amount = moneyToCents(input.amount);
    if (amount <= 0) throw new SupermarketError("Amount must be positive.", "VALIDATION");
    if (!input.accountId) throw new SupermarketError("Select a bank account.", "VALIDATION");
    if (!input.date) throw new SupermarketError("Date is required.", "VALIDATION");
    if (input.movementType !== "DEPOSIT" && input.movementType !== "WITHDRAWAL") {
      throw new SupermarketError("Choose deposit or withdrawal.", "VALIDATION");
    }

    if (input.post && input.draftId && !owner) {
      const { data: draft, error } = await supabase
        .from("sm_bank_transactions")
        .select("created_by, posting_status")
        .eq("id", input.draftId)
        .eq("business_unit_id", businessUnitId)
        .single();
      if (error) mapDbError(error);
      if (draft?.created_by && String(draft.created_by) === userId) {
        throw new SupermarketError(
          "Segregation of duties: the preparer cannot post this transaction.",
          "UNAUTHORIZED",
        );
      }
    }

    const { data, error } = await supabase.rpc("sm_save_bank_cash_movement", {
      p_account_id: input.accountId,
      p_movement_type: input.movementType,
      p_amount: centsToMoney(amount),
      p_date: input.date,
      p_reference: input.reference.trim(),
      p_description: input.description.trim(),
      p_notes: input.notes.trim(),
      p_post: input.post,
      p_draft_id: input.draftId ?? null,
    });
    if (error) mapDbError(error);
    const id = String(data);
    const kind = input.movementType === "DEPOSIT" ? "deposit" : "withdrawal";
    await writeSupermarketAudit(businessUnitId, {
      action: input.post ? `bank.${kind}.posted` : `bank.${kind}.created`,
      description: input.post
        ? `Posted bank ${kind} ${centsToMoney(amount)}`
        : `Saved bank ${kind} draft ${centsToMoney(amount)}`,
      severity: input.post ? "high" : "medium",
      entityType: "sm_bank_transactions",
      entityId: id,
      metadata: { amount: centsToMoney(amount), date: input.date },
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function reverseBankMovementAction(id: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.banking.approve",
    );
    const user = await requireAuth();
    const owner = isOwnerRole(user.roleCode);
    const { data: original, error: originalError } = await supabase
      .from("sm_bank_transactions")
      .select("id, created_by, posted_by, posting_status, movement_type")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .single();
    if (originalError) mapDbError(originalError);
    if (!owner) {
      const actor = String(original?.posted_by || original?.created_by || "");
      if (actor && actor === userId) {
        throw new SupermarketError(
          "Segregation of duties: the preparer cannot reverse this transaction.",
          "UNAUTHORIZED",
        );
      }
    }
    const { data, error } = await supabase.rpc("sm_reverse_bank_cash_movement", { p_id: id });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "bank.transaction.reversed",
      description: `Reversed bank ${String(original?.movement_type || "movement").toLowerCase()}`,
      severity: "high",
      entityType: "sm_bank_transactions",
      entityId: String(data),
      metadata: { originalId: id },
    });
    return { ok: true as const, id: String(data) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getBankMovementReportStripAction(input: { from: string; to: string }) {
  const result = await getBankMovementsWorkspaceAction({ from: input.from, to: input.to, page: 1 });
  if (!result.ok) return result;
  return {
    ok: true as const,
    deposits: result.summary.deposits,
    withdrawals: result.summary.withdrawals,
    net: result.summary.net,
    unmatched: result.summary.unmatched,
  };
}
