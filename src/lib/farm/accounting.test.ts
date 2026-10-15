import assert from "node:assert/strict";
import test from "node:test";
import { jobBalance, summarizeFarmLedgers, type FarmLedgerExpense, type FarmLedgerJob } from "./accounting";

const RANGE = { from: "2026-10-01", to: "2026-10-31" };

function job(partial: Partial<FarmLedgerJob> & Pick<FarmLedgerJob, "id">): FarmLedgerJob {
  return {
    occurredOn: "2026-10-10",
    completedOn: "2026-10-10",
    partyId: "c1",
    agreedPrice: 100_000,
    amountPaid: 0,
    status: "COMPLETED",
    isActive: true,
    ...partial,
  };
}

function expense(partial: Partial<FarmLedgerExpense> & Pick<FarmLedgerExpense, "id">): FarmLedgerExpense {
  return {
    occurredOn: "2026-10-12",
    amount: 50_000,
    kind: "FUEL",
    sourceType: "FUEL",
    sourceId: "fuel-1",
    isActive: true,
    ...partial,
  };
}

test("completed unpaid jobs count as service income and receivables, not cash", () => {
  const summary = summarizeFarmLedgers({
    ...RANGE,
    jobs: [job({ id: "j1", agreedPrice: 200_000, amountPaid: 0 })],
    expenses: [],
  });
  assert.equal(summary.serviceIncome, 200_000);
  assert.equal(summary.received, 0);
  assert.equal(summary.receivables, 200_000);
  assert.equal(summary.completedJobs, 1);
  assert.equal(summary.customersServed, 1);
  assert.equal(summary.netProfit, 200_000);
});

test("in-progress and cancelled jobs are not recognized as income", () => {
  const summary = summarizeFarmLedgers({
    ...RANGE,
    jobs: [
      job({ id: "open", status: "IN_PROGRESS", agreedPrice: 90_000 }),
      job({ id: "cancel", status: "CANCELLED", agreedPrice: 40_000, amountPaid: 0 }),
    ],
    expenses: [],
  });
  assert.equal(summary.serviceIncome, 0);
  assert.equal(summary.receivables, 0);
});

test("fuel and maintenance post once even if the same expense id is loaded twice", () => {
  const fuel = expense({ id: "e1", amount: 150_000, kind: "FUEL", sourceId: "f1" });
  const maint = expense({ id: "e2", amount: 80_000, kind: "MAINTENANCE", sourceType: "MAINTENANCE", sourceId: "m1" });
  const summary = summarizeFarmLedgers({
    ...RANGE,
    jobs: [job({ id: "j1", agreedPrice: 400_000, amountPaid: 400_000 })],
    expenses: [fuel, { ...fuel }, maint],
  });
  assert.equal(summary.fuelExpense, 150_000);
  assert.equal(summary.maintenanceExpense, 80_000);
  assert.equal(summary.tractorExpense, 230_000);
  assert.equal(summary.expenses, 230_000);
  assert.equal(summary.netProfit, 170_000);
});

test("jobs outside the period are excluded from income but still affect outstanding receivables", () => {
  const summary = summarizeFarmLedgers({
    ...RANGE,
    jobs: [
      job({ id: "old", occurredOn: "2026-09-01", completedOn: "2026-09-01", agreedPrice: 50_000, amountPaid: 0 }),
      job({ id: "now", agreedPrice: 75_000, amountPaid: 25_000 }),
    ],
    expenses: [],
  });
  assert.equal(summary.serviceIncome, 75_000);
  assert.equal(summary.receivables, 100_000);
  assert.equal(jobBalance(job({ id: "now", agreedPrice: 75_000, amountPaid: 25_000 })).status, "Partial");
});
