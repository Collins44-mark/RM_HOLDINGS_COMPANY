"use server";

import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import {
  assessStatementRow,
  parseCsvGrid,
  parsePdfStatementText,
  parseStatementGrid,
  statementFingerprint,
  type StatementPreviewRow,
} from "@/lib/supermarket/bank-statement";
import { centsToMoney, moneyToCents } from "@/lib/supermarket/money";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 2000;
const READ_FAIL =
  "We couldn't read this statement. Please check the file or enter the statement lines manually.";

export type BankStatementPreview = {
  accountId: string;
  accountLabel: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rows: StatementPreviewRow[];
  newCount: number;
  duplicateCount: number;
  reviewCount: number;
  warnings: string[];
};

async function assertAccount(accountId: string) {
  const ctx = await requireSupermarketPermission("supermarket.reconciliation.create");
  const { data, error } = await ctx.supabase
    .from("sm_bank_accounts")
    .select("id, bank_name, account_name, is_active")
    .eq("id", accountId)
    .eq("business_unit_id", ctx.businessUnitId)
    .maybeSingle();
  if (error) mapDbError(error);
  if (!data?.id) throw new SupermarketError("Select a real bank account.", "NOT_FOUND");
  if (!data.is_active) throw new SupermarketError("This bank account is not active.", "VALIDATION");
  return {
    ...ctx,
    accountId: String(data.id),
    accountLabel: `${data.bank_name} · ${data.account_name}`,
  };
}

async function markDuplicates(accountId: string, businessUnitId: string, rows: StatementPreviewRow[], supabase: Awaited<ReturnType<typeof requireSupermarketPermission>>["supabase"]) {
  const { data, error } = await supabase
    .from("sm_bank_transactions")
    .select("transaction_date, reference, description, debit, credit")
    .eq("business_unit_id", businessUnitId)
    .eq("bank_account_id", accountId)
    .eq("source", "STATEMENT");
  if (error) mapDbError(error);
  const seen = new Set(
    (data ?? []).map((row) =>
      statementFingerprint({
        transactionDate: String(row.transaction_date),
        reference: String(row.reference ?? ""),
        description: String(row.description ?? ""),
        debit: centsToMoney(moneyToCents(row.debit)),
        credit: centsToMoney(moneyToCents(row.credit)),
      }),
    ),
  );
  return rows.map((row) => {
    const assessed = assessStatementRow(row);
    return { ...assessed, duplicate: seen.has(assessed.key) };
  });
}

function summarize(rows: StatementPreviewRow[], warnings: string[], extras: Omit<BankStatementPreview, "rows" | "newCount" | "duplicateCount" | "reviewCount" | "warnings">): BankStatementPreview {
  return {
    ...extras,
    rows,
    warnings,
    newCount: rows.filter((row) => row.valid && !row.duplicate).length,
    duplicateCount: rows.filter((row) => row.duplicate).length,
    reviewCount: rows.filter((row) => row.needsReview || !row.valid).length,
  };
}

async function parseWorkbook(buffer: Buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new SupermarketError(READ_FAIL, "VALIDATION");
  const sheet = workbook.Sheets[sheetName];
  const grid = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]).map((row) =>
    row.map((cell) => {
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell ?? "").trim();
    }),
  );
  return parseStatementGrid(grid);
}

async function parsePdf(buffer: Buffer) {
  const { extractText } = await import("unpdf");
  const extracted = await extractText(new Uint8Array(buffer), { mergePages: true });
  const text = extracted.text;
  if (!text.trim()) throw new SupermarketError(READ_FAIL, "VALIDATION");
  return parsePdfStatementText(text);
}

export async function parseBankStatementAction(formData: FormData) {
  try {
    const accountId = String(formData.get("accountId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new SupermarketError("Choose a statement file.", "VALIDATION");
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new SupermarketError("The statement file must be between 1 byte and 8 MB.", "VALIDATION");
    }
    const ctx = await assertAccount(accountId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    const type = file.type;
    let parsed;
    if (name.endsWith(".pdf") || type === "application/pdf") {
      parsed = await parsePdf(buffer);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || type.includes("spreadsheet") || type.includes("excel")) {
      parsed = await parseWorkbook(buffer);
    } else {
      parsed = parseStatementGrid(parseCsvGrid(buffer.toString("utf8")));
    }
    if (!parsed.rows.length) throw new SupermarketError(READ_FAIL, "VALIDATION");
    const rows = (await markDuplicates(ctx.accountId, ctx.businessUnitId, parsed.rows.slice(0, MAX_ROWS), ctx.supabase)).map(
      (row, index) => ({ ...row, key: `${row.key}:${index}` }),
    );
    return {
      ok: true as const,
      preview: summarize(rows, parsed.warnings, {
        accountId: ctx.accountId,
        accountLabel: ctx.accountLabel,
        fileName: file.name,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
      }),
    };
  } catch (error) {
    if (error instanceof SupermarketError && error.code !== "VALIDATION") {
      return { ok: false as const, error: actionErrorMessage(error) };
    }
    return { ok: false as const, error: READ_FAIL };
  }
}

export async function confirmBankStatementImportAction(input: {
  accountId: string;
  includeDuplicates?: boolean;
  rows: Array<{
    transactionDate: string;
    reference: string;
    description: string;
    debit: string;
    credit: string;
  }>;
}) {
  try {
    const ctx = await assertAccount(input.accountId);
    const assessed = input.rows.map((row) => assessStatementRow(row));
    const marked = await markDuplicates(ctx.accountId, ctx.businessUnitId, assessed, ctx.supabase);
    const reviewCount = marked.filter((row) => row.needsReview || !row.valid).length;
    if (reviewCount > 0) {
      throw new SupermarketError(`${reviewCount} transaction${reviewCount === 1 ? "" : "s"} need review before import.`, "VALIDATION");
    }
    const fresh = marked.filter((row) => row.valid && (input.includeDuplicates ? true : !row.duplicate));
    if (!fresh.length) throw new SupermarketError("There are no new statement lines to import.", "VALIDATION");
    const payload = fresh.map((row) => ({
      business_unit_id: ctx.businessUnitId,
      bank_account_id: ctx.accountId,
      transaction_date: row.transactionDate,
      reference: row.reference,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      source: "STATEMENT" as const,
      status: "UNMATCHED" as const,
      created_by: ctx.userId,
    }));
    const { error } = await ctx.supabase.from("sm_bank_transactions").insert(payload);
    if (error) mapDbError(error);
    const skipped = marked.length - fresh.length;
    await writeSupermarketAudit(ctx.businessUnitId, {
      action: "bank.statement.imported",
      description: `Bank statement imported · ${ctx.accountLabel} · ${fresh.length} transaction${fresh.length === 1 ? "" : "s"}`,
      severity: "medium",
      entityType: "sm_bank_accounts",
      entityId: ctx.accountId,
      metadata: {
        count: fresh.length,
        skipped,
        periodStart: fresh[0]?.transactionDate ?? null,
        periodEnd: fresh[fresh.length - 1]?.transactionDate ?? null,
        account: ctx.accountLabel,
      },
    });
    return { ok: true as const, count: fresh.length, skipped };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
