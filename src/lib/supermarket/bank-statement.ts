import { centsToMoney, moneyToCents } from "@/lib/supermarket/money";

export type StatementPreviewRow = {
  key: string;
  transactionDate: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  valid: boolean;
  needsReview: boolean;
  duplicate: boolean;
  warning: string | null;
};

export type StatementParseResult = {
  rows: StatementPreviewRow[];
  warnings: string[];
  periodStart: string | null;
  periodEnd: string | null;
};

const DATE_HEAD = /^(date|txn\s*date|trans(action)?\s*date|value\s*date|posting\s*date)$/i;
const REF_HEAD = /^(ref(erence)?|cheque|chq|slip|narration\s*ref|txn\s*(id|no|ref)|document)$/i;
const DESC_HEAD = /^(desc(ription)?|narration|particulars|details|memo|remarks?)$/i;
const DEBIT_HEAD = /^(debit|withdrawal|dr|paid\s*out|money\s*out)$/i;
const CREDIT_HEAD = /^(credit|deposit|cr|paid\s*in|money\s*in)$/i;
const AMOUNT_HEAD = /^(amount|txn\s*amount)$/i;
const SKIP_LINE =
  /opening balance|closing balance|balance (b\/f|c\/f|brought|carried)|page \d+|statement of account|account number|available balance/i;

export function statementFingerprint(row: {
  transactionDate: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
}) {
  const ref = row.reference.trim().toLowerCase();
  const desc = row.description.trim().toLowerCase().slice(0, 48);
  const amountKey = `${moneyToCents(row.debit)}:${moneyToCents(row.credit)}`;
  return `${row.transactionDate}|${amountKey}|${ref}|${ref ? "" : desc}`;
}

export function parseIsoDate(value: string): string | null {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const iso = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (named) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = months.findIndex((item) => named[2].toLowerCase().startsWith(item));
    if (month >= 0) return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return null;
}

export function assessStatementRow(
  input: Omit<StatementPreviewRow, "valid" | "needsReview" | "warning" | "duplicate" | "key"> & {
    duplicate?: boolean;
    key?: string;
  },
): StatementPreviewRow {
  const date = parseIsoDate(input.transactionDate) ?? "";
  const debit = moneyToCents(input.debit);
  const credit = moneyToCents(input.credit);
  const warnings: string[] = [];
  if (!date) warnings.push("Date needs review");
  if (debit === 0 && credit === 0) warnings.push("Amount missing");
  if (debit > 0 && credit > 0) warnings.push("Debit and credit both set");
  const needsReview = warnings.length > 0;
  const valid = Boolean(date) && (debit > 0) !== (credit > 0);
  const row = {
    transactionDate: date || input.transactionDate,
    reference: input.reference.trim(),
    description: input.description.trim(),
    debit: centsToMoney(debit),
    credit: centsToMoney(credit),
  };
  return {
    key: input.key ?? statementFingerprint(row),
    ...row,
    valid,
    needsReview,
    duplicate: Boolean(input.duplicate),
    warning: warnings[0] ?? null,
  };
}

export function parseCsvGrid(csv: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      current.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      current.push(cell.trim());
      if (current.some((item) => item)) rows.push(current);
      current = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  current.push(cell.trim());
  if (current.some((item) => item)) rows.push(current);
  return rows;
}

function headerIndex(headers: string[], test: RegExp) {
  return headers.findIndex((header) => test.test(header.replace(/\s+/g, " ").trim()));
}

export function parseStatementGrid(grid: string[][]): StatementParseResult {
  if (!grid.length) return { rows: [], warnings: ["No rows were found."], periodStart: null, periodEnd: null };
  let headerAt = grid.findIndex((row) =>
    row.some((cell) => DATE_HEAD.test(cell.replace(/\s+/g, " ").trim()) || cell.toLowerCase().includes("date")),
  );
  if (headerAt < 0) headerAt = 0;
  const headers = (grid[headerAt] ?? []).map((cell) => cell.replace(/\s+/g, " ").trim());
  const dateIdx = Math.max(0, headerIndex(headers, DATE_HEAD));
  let refIdx = headerIndex(headers, REF_HEAD);
  let descIdx = headerIndex(headers, DESC_HEAD);
  let debitIdx = headerIndex(headers, DEBIT_HEAD);
  let creditIdx = headerIndex(headers, CREDIT_HEAD);
  const amountIdx = headerIndex(headers, AMOUNT_HEAD);
  const looksLikeHeader = headerIndex(headers, DATE_HEAD) >= 0 || headers.join(" ").toLowerCase().includes("date");
  if (refIdx < 0) refIdx = 1;
  if (descIdx < 0) descIdx = Math.min(2, Math.max(headers.length - 1, 1));
  if (debitIdx < 0 && creditIdx < 0 && looksLikeHeader) {
    debitIdx = Math.min(3, headers.length - 2);
    creditIdx = Math.min(4, headers.length - 1);
  }
  const start = looksLikeHeader ? headerAt + 1 : 0;
  const rows: StatementPreviewRow[] = [];
  for (const raw of grid.slice(start)) {
    const cells = raw.map((cell) => cell.replace(/\s+/g, " ").trim()).filter((cell, index, list) => cell || list.length > 1);
    if (!cells.length || SKIP_LINE.test(cells.join(" "))) continue;
    const dateCell = cells[dateIdx] ?? cells[0] ?? "";
    const parsed = looksLikeHeader
      ? assessStatementRow({
          transactionDate: dateCell,
          reference: cells[refIdx] ?? "",
          description: cells[descIdx] ?? cells.slice(1, -2).join(" "),
          debit: debitIdx >= 0 ? (cells[debitIdx] ?? "0") : "0",
          credit: creditIdx >= 0 ? (cells[creditIdx] ?? "0") : amountIdx >= 0 ? (cells[amountIdx] ?? "0") : "0",
        })
      : parseLooseLine(cells.join(" "));
    if (!parsed) continue;
    if (!parsed.valid && !parsed.needsReview) continue;
    rows.push(parsed);
  }
  const dates = rows.map((row) => row.transactionDate).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  return {
    rows,
    warnings: rows.length ? [] : ["No transaction rows could be read from this file."],
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}

function moneyTokens(line: string) {
  return [...line.matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+\.\d{2}/g)].map((match) => match[0]);
}

export function parsePdfStatementText(text: string): StatementParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const grid: string[][] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const parts = line.split(/\s{2,}|\t/).map((part) => part.trim()).filter(Boolean);
    grid.push(parts.length >= 3 ? parts : [line]);
  }
  const fromGrid = parseStatementGrid(grid);
  if (fromGrid.rows.filter((row) => row.valid).length >= 3) return fromGrid;

  const rows: StatementPreviewRow[] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const parsed = parseLooseLine(line);
    if (parsed) rows.push(parsed);
  }
  const dates = rows.map((row) => row.transactionDate).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  return {
    rows,
    warnings: rows.length
      ? rows.some((row) => row.needsReview)
        ? ["Some lines could not be read with full confidence."]
        : []
      : ["We couldn't identify transaction rows in this PDF."],
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}

function parseLooseLine(line: string): StatementPreviewRow | null {
  const dateMatch = line.match(
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/,
  );
  if (!dateMatch) return null;
  const date = parseIsoDate(dateMatch[1]);
  if (!date) return null;
  const amounts = moneyTokens(line.slice(dateMatch.index! + dateMatch[0].length));
  if (!amounts.length) {
    return assessStatementRow({
      transactionDate: date,
      reference: "",
      description: line.replace(dateMatch[0], "").trim(),
      debit: "0",
      credit: "0",
    });
  }
  let debit = "0";
  let credit = "0";
  const rest = line.slice(dateMatch.index! + dateMatch[0].length);
  const lowered = rest.toLowerCase();
  const bodyAmounts = amounts.length >= 3 ? amounts.slice(0, -1) : amounts;
  if (bodyAmounts.length >= 2) {
    debit = bodyAmounts[0];
    credit = bodyAmounts[1];
  } else if (/withdraw|debit|\bdr\b|paid out/.test(lowered)) {
    debit = bodyAmounts[0];
  } else if (/deposit|credit|\bcr\b|paid in/.test(lowered)) {
    credit = bodyAmounts[0];
  } else {
    return assessStatementRow({
      transactionDate: date,
      reference: "",
      description: rest.replace(bodyAmounts[0], "").trim(),
      debit: "0",
      credit: "0",
    });
  }
  const withoutAmounts = bodyAmounts.reduce((text, token) => text.replace(token, " "), rest).replace(/\s+/g, " ").trim();
  const chunks = withoutAmounts.split(/\s+/);
  const reference = chunks[0] && /[A-Za-z0-9]{4,}/.test(chunks[0]) ? chunks[0] : "";
  const description = (reference ? chunks.slice(1) : chunks).join(" ").trim();
  return assessStatementRow({
    transactionDate: date,
    reference,
    description,
    debit,
    credit,
  });
}
