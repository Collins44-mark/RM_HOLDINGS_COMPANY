import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMoney,
  parsePayday,
  readSalaryDeduction,
  remainingSalary,
  salaryDeductionNote,
  salaryPayStatus,
  salaryPeriodFromRange,
  splitSalaryPayment,
} from "./salary";
import { formatCompactStaffNumber } from "./student-number";

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

test("a deduction closes salary without counting as cash paid", () => {
  const split = splitSalaryPayment(480_000, 20_000);
  assert.deepEqual(split, { cash: 480_000, deduction: 20_000, settled: 500_000 });
  assert.equal(remainingSalary(500_000, split.settled), 0);
  const note = salaryDeductionNote(20_000, "Absence", "Paid at the office");
  const read = readSalaryDeduction(note);
  assert.equal(read.amount, 20_000);
  assert.equal(read.reason, "Absence");
  assert.equal(read.notes, "Paid at the office");
  assert.equal(readSalaryDeduction("Paid at the office").amount, 0);
});

test("compact staff numbers keep the same sequence without rewriting identity", () => {
  assert.equal(formatCompactStaffNumber("STF-000001"), "STF-001");
  assert.equal(formatCompactStaffNumber("STF-000002"), "STF-002");
  assert.equal(formatCompactStaffNumber("STF-003"), "STF-003");
});

test("this-year finance ranges use the current payroll month, not January", () => {
  const now = new Date(2026, 9, 10);
  assert.deepEqual(salaryPeriodFromRange("2026-10-01", "2026-10-31", now), { year: 2026, month: 10 });
  assert.deepEqual(salaryPeriodFromRange("2026-01-01", "2026-12-31", now), { year: 2026, month: 10 });
  assert.deepEqual(salaryPeriodFromRange("2026-01-01", "2026-01-31", now), { year: 2026, month: 1 });
});
