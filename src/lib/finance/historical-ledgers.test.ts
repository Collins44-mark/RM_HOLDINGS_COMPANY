import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAccount, withRunningBalances, type HistoricalSourceLine } from "./historical-ledgers";

function line(partial: Partial<HistoricalSourceLine> & Pick<HistoricalSourceLine, "id" | "kind" | "date" | "debit" | "credit">): HistoricalSourceLine {
  return {
    importId: "combine",
    particulars: partial.kind === "opening_balance" ? "Opening Balance" : "Cash A/c",
    voucherType: partial.kind === "opening_balance" ? "" : "Payment",
    voucherNumber: partial.kind === "opening_balance" ? "" : "1",
    page: 1,
    line: 1,
    ...partial,
  };
}

test("a restated opening does not inflate the latest closing balance", () => {
  const lines = [
    line({ id: "1", kind: "opening_balance", date: "2025-01-01", debit: 0, credit: 381000, line: 1 }),
    line({ id: "2", kind: "transaction", date: "2025-04-17", debit: 0, credit: 21526000, line: 2 }),
    line({ id: "3", kind: "opening_balance", date: "2026-01-01", debit: 0, credit: 21907000, line: 3 }),
    line({ id: "4", kind: "transaction", date: "2026-05-04", debit: 0, credit: 1780000, line: 4 }),
  ];
  const summary = summarizeAccount(
    { id: "combine", accountName: "COMBINE HARVESTER SPARES", sourceFilename: "CHITA_COMBINE_HARVESTERS_SPARES.pdf", periodFrom: "2025-01-01", periodTo: "2026-11-20" },
    lines,
  );
  assert.equal(summary.transactionCount, 2);
  assert.deepEqual(summary.opening, { side: "credit", amount: 21907000 });
  assert.equal(summary.totalDebit, 0);
  assert.equal(summary.totalCredit, 23687000);
  assert.deepEqual(summary.closing, { side: "credit", amount: 23687000 });

  const running = withRunningBalances(lines);
  assert.equal(running[2].section, 2);
  assert.equal(running[2].runningBalance, 21907000);
  assert.equal(running[3].runningBalance, 23687000);
  assert.equal(running[3].runningSide, "credit");
});
