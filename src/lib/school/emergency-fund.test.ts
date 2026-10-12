import assert from "node:assert/strict";
import test from "node:test";
import {
  emergencyFundPeriodTotals,
  emergencyFundRunningBalances,
  filterEmergencyFundHistory,
} from "./emergency-fund";
import type { SchoolEmergencyFundEntry } from "./store-types";

function entry(
  partial: Partial<SchoolEmergencyFundEntry> & Pick<SchoolEmergencyFundEntry, "id" | "kind" | "amount" | "occurredOn">,
): SchoolEmergencyFundEntry {
  return {
    createdAt: partial.createdAt ?? `${partial.occurredOn}T00:00:00.000Z`,
    reference: "",
    notes: "",
    expenseId: null,
    isActive: true,
    recordedBy: "user",
    ...partial,
  };
}

const ledger: SchoolEmergencyFundEntry[] = [
  entry({ id: "open", kind: "OPENING", amount: 1000, occurredOn: "2026-01-10" }),
  entry({ id: "add", kind: "REPLENISH", amount: 400, occurredOn: "2026-10-05" }),
  entry({ id: "spend", kind: "SPEND", amount: 250, occurredOn: "2026-10-12" }),
  entry({ id: "old", kind: "SPEND", amount: 100, occurredOn: "2026-02-01" }),
  entry({ id: "rev", kind: "REPLENISH", amount: 50, occurredOn: "2026-10-20", isActive: false }),
];

test("running balance ignores reversed credits and spends against the live ledger", () => {
  const running = emergencyFundRunningBalances(ledger);
  assert.equal(running.get("open"), 1000);
  assert.equal(running.get("old"), 900);
  assert.equal(running.get("add"), 1300);
  assert.equal(running.get("spend"), 1050);
  assert.equal(running.get("rev"), 1050);
});

test("history keeps opening rows outside the selected period", () => {
  const rows = filterEmergencyFundHistory(ledger, "2026-10-01", "2026-10-31");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["open", "add", "spend", "rev"],
  );
});

test("period totals do not change the current full-ledger balance", () => {
  const totals = emergencyFundPeriodTotals(ledger, "2026-10-01", "2026-10-31");
  assert.equal(totals.openingBalance, 900);
  assert.equal(totals.added, 400);
  assert.equal(totals.spent, 250);
  assert.equal(totals.closingBalance, 1050);
  const current = emergencyFundPeriodTotals(ledger, "1900-01-01", "2100-01-01");
  assert.equal(current.closingBalance, 1050);
});
