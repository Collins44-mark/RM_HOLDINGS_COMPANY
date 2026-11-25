import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { identityFromUser, requireAuth } from "@/lib/auth/session";
import { canAccessOwnerPath } from "@/lib/auth/rbac";
import { summarizeAccount, withRunningBalances, type HistoricalImport, type HistoricalLedgerData, type HistoricalSourceLine } from "@/lib/finance/historical-ledgers";

export type { HistoricalLedgerData };

type ImportRow = {
  id: string;
  account_name: string;
  source_filename: string;
  period_from: string | null;
  period_to: string | null;
};

type LineRow = {
  id: string;
  import_id: string;
  line_kind: "opening_balance" | "transaction";
  entry_date: string;
  particulars: string | null;
  voucher_type: string | null;
  voucher_number: string | null;
  debit: number | string;
  credit: number | string;
  source_page: number;
  source_line: number;
};

function money(value: number | string) {
  return Math.round(Number(value) * 100) / 100;
}

export async function getHistoricalLedgers(): Promise<HistoricalLedgerData> {
  const user = await requireAuth();
  if (!canAccessOwnerPath(identityFromUser(user), "/owner/finance")) {
    return { accounts: [], lines: [], error: "You do not have access to historical ledgers." };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return { accounts: [], lines: [], error: "The finance database is not configured." };

  const imports = await supabase
    .from("finance_ledger_imports")
    .select("id, account_name, source_filename, period_from, period_to")
    .order("account_name");
  if (imports.error) return { accounts: [], lines: [], error: imports.error.message };

  const rows: LineRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await supabase
      .from("finance_ledger_lines")
      .select("id, import_id, line_kind, entry_date, particulars, voucher_type, voucher_number, debit, credit, source_page, source_line")
      .order("entry_date")
      .order("source_page")
      .order("source_line")
      .range(from, from + 999);
    if (page.error) return { accounts: [], lines: [], error: page.error.message };
    rows.push(...((page.data ?? []) as LineRow[]));
    if ((page.data ?? []).length < 1000) break;
  }

  const byImport = new Map<string, HistoricalSourceLine[]>();
  for (const row of rows) {
    const list = byImport.get(row.import_id) ?? [];
    list.push({
      id: row.id,
      importId: row.import_id,
      kind: row.line_kind,
      date: row.entry_date,
      particulars: row.particulars ?? "",
      voucherType: row.voucher_type ?? "",
      voucherNumber: row.voucher_number ?? "",
      debit: money(row.debit),
      credit: money(row.credit),
      page: row.source_page,
      line: row.source_line,
    });
    byImport.set(row.import_id, list);
  }

  const ledgers = (imports.data ?? []) as ImportRow[];
  const accounts = ledgers.map((ledger) => {
    const source: HistoricalImport = {
      id: ledger.id,
      accountName: ledger.account_name,
      sourceFilename: ledger.source_filename,
      periodFrom: ledger.period_from,
      periodTo: ledger.period_to,
    };
    return summarizeAccount(source, byImport.get(ledger.id) ?? []);
  });
  const lines = ledgers.flatMap((ledger) => withRunningBalances(byImport.get(ledger.id) ?? []));
  return { accounts, lines, error: null };
}
