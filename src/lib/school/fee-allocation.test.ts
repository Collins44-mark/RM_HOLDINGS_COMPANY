import assert from "node:assert/strict";
import test from "node:test";
import { allocatedPaymentTotal, chargeRemaining, isAllocatedFeePayment } from "./fee-allocation";

test("partial transport payment leaves the remainder on that charge only", () => {
  const transportId = "transport-oct";
  const tuitionId = "tuition-year";
  const payments = [
    { amount: 112_000, status: "posted", chargeId: transportId },
    { amount: 8_000, status: "posted", chargeId: tuitionId },
  ];
  assert.equal(allocatedPaymentTotal(payments, transportId), 112_000);
  assert.equal(chargeRemaining(120_000, allocatedPaymentTotal(payments, transportId)), 8_000);
  assert.equal(allocatedPaymentTotal(payments, tuitionId), 8_000);
});

test("does not use a student's total payments for a specific charge", () => {
  const payments = [
    { amount: 112_000, status: "posted", chargeId: "transport-oct" },
    { amount: 8_000, status: "posted", chargeId: "tuition-year" },
    { amount: 50_000, status: "posted", chargeId: null },
  ];
  assert.equal(allocatedPaymentTotal(payments, "transport-oct"), 112_000);
  assert.equal(allocatedPaymentTotal(payments), 0);
});

test("excludes reversed or cancelled statuses and counts pending with posted", () => {
  const id = "transport-oct";
  const payments = [
    { amount: 112_000, status: "posted", chargeId: id },
    { amount: 8_000, status: "pending", chargeId: id },
    { amount: 8_000, status: "reversed", chargeId: id },
    { amount: 8_000, status: "cancelled", chargeId: id },
  ];
  assert.equal(allocatedPaymentTotal(payments, id), 120_000);
  assert.equal(isAllocatedFeePayment("REVERSED"), false);
  assert.equal(isAllocatedFeePayment("Posted"), true);
});

test("a later period is independent of an earlier transport payment", () => {
  const payments = [{ amount: 120_000, status: "posted", chargeId: "transport-sep" }];
  assert.equal(chargeRemaining(120_000, allocatedPaymentTotal(payments, "transport-oct")), 120_000);
  assert.equal(chargeRemaining(120_000, allocatedPaymentTotal(payments, "transport-sep")), 0);
});
