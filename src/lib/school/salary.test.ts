import assert from "node:assert/strict";
import test from "node:test";
import { parseMoney, parsePayday, remainingSalary, salaryPayStatus } from "./salary";

test("salary is optional and is not fabricated", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney("250000"), 250000);
});

test("module salary arrangements are independent and optional", () => {
  const school = 750_000;
  const supermarket = 200_000;
  assert.equal(remainingSalary(school, 300_000), 450_000);
  assert.equal(remainingSalary(supermarket, 0), 200_000);
  assert.equal(parsePayday(28), 28);
  assert.equal(parsePayday(32), null);
  assert.equal(parsePayday(""), null);
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
  assert.equal(salaryPayStatus(750_000, 0), "unpaid");
  assert.equal(salaryPayStatus(750_000, 300_000), "partial");
  assert.equal(salaryPayStatus(750_000, 750_000), "paid");
  assert.equal(salaryPayStatus(null, 0), null);
});
