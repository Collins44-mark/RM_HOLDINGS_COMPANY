export type LedgerSide = "debit" | "credit";

export type HistoricalSourceLine = {
  id: string;
  importId: string;
  kind: "opening_balance" | "transaction";
  date: string;
  particulars: string;
  voucherType: string;
  voucherNumber: string;
  debit: number;
  credit: number;
  page: number;
  line: number;
};

export type HistoricalImport = {
  id: string;
  accountName: string;
  sourceFilename: string;
  periodFrom: string | null;
  periodTo: string | null;
};

export type RunningLine = HistoricalSourceLine & {
  section: number;
  runningBalance: number;
  runningSide: LedgerSide | "even";
};

export type HistoricalLedgerData = {
  accounts: HistoricalAccountSummary[];
  lines: RunningLine[];
  error: string | null;
};

export type HistoricalAccountSummary = {
  importId: string;
  accountName: string;
  sourceFilename: string;
  periodFrom: string | null;
  periodTo: string | null;
  transactionCount: number;
  opening: { side: LedgerSide; amount: number } | null;
  totalDebit: number;
  totalCredit: number;
  closing: { side: LedgerSide; amount: number } | null;
};

function cents(value: number) {
  return Math.round(value * 100);
}

function amount(centsValue: number) {
  return centsValue / 100;
}

export function sectionLines(lines: HistoricalSourceLine[]): HistoricalSourceLine[][] {
  const ordered = [...lines].sort((a, b) => a.date.localeCompare(b.date) || a.page - b.page || a.line - b.line);
  const sections: HistoricalSourceLine[][] = [];
  let current: HistoricalSourceLine[] = [];
  for (const line of ordered) {
    const started = current.some((item) => item.kind === "opening_balance" || item.kind === "transaction");
    if (line.kind === "opening_balance" && started) {
      sections.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) sections.push(current);
  return sections;
}

export function withRunningBalances(lines: HistoricalSourceLine[]): RunningLine[] {
  return sectionLines(lines).flatMap((section, index) => {
    let signed = 0;
    return section.map((line) => {
      signed += cents(line.debit) - cents(line.credit);
      return {
        ...line,
        section: index + 1,
        runningBalance: amount(Math.abs(signed)),
        runningSide: signed > 0 ? "debit" : signed < 0 ? "credit" : "even",
      };
    });
  });
}

export function summarizeAccount(ledger: HistoricalImport, lines: HistoricalSourceLine[]): HistoricalAccountSummary {
  const sections = sectionLines(lines);
  const latest = sections[sections.length - 1] ?? [];
  const openingLine = latest.find((line) => line.kind === "opening_balance") ?? null;
  const totalDebit = amount(latest.reduce((sum, line) => sum + cents(line.debit), 0));
  const totalCredit = amount(latest.reduce((sum, line) => sum + cents(line.credit), 0));
  const net = cents(totalDebit) - cents(totalCredit);
  return {
    importId: ledger.id,
    accountName: ledger.accountName,
    sourceFilename: ledger.sourceFilename,
    periodFrom: ledger.periodFrom,
    periodTo: ledger.periodTo,
    transactionCount: lines.filter((line) => line.kind === "transaction").length,
    opening: openingLine ? { side: openingLine.debit > 0 ? "debit" : "credit", amount: openingLine.debit || openingLine.credit } : null,
    totalDebit,
    totalCredit,
    closing: net === 0 ? null : { side: net > 0 ? "debit" : "credit", amount: amount(Math.abs(net)) },
  };
}
