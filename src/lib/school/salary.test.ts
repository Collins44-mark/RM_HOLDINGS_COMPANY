import assert from "node:assert/strict";
import test from "node:test";
import { allocationsReconcile, allocationsTotal, parseMoney, remainingSalary } from "./salary";

test("salary is optional and is not fabricated", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney("250000"), 250000);
});

test("allocations must reconcile to monthly salary and never double-count", () => {
  const salary = 1_000_000;
  const allocations = [
    { amount: 600_000 },
    { amount: 400_000 },
  ];
  assert.equal(allocationsTotal(allocations), 1_000_000);
  assert.equal(allocationsReconcile(salary, allocations), true);
  assert.equal(allocationsReconcile(salary, [{ amount: 600_000 }]), false);
  assert.equal(allocationsReconcile(salary, []), true);
});

test("setting a salary does not create a payment; outstanding stays the commitment", () => {
  assert.equal(remainingSalary(800_000, 0), 800_000);
  assert.equal(remainingSalary(800_000, 300_000), 500_000);
  assert.equal(remainingSalary(null, 0), null);
});

test("partial salary payment reduces outstanding without exceeding the monthly amount", () => {
  const remaining = remainingSalary(500_000, 500_000);
  assert.equal(remaining, 0);
  assert.equal(remainingSalary(500_000, 120_000), 380_000);
});
