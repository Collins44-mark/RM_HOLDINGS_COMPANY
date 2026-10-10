import assert from "node:assert/strict";
import test from "node:test";
import {
  allocatedPaymentTotal,
  chargeRemaining,
  compactFeeChargeLabel,
  isAllocatedFeePayment,
  isPayableObligation,
  parsePayableSelectorId,
  pendingTuitionSelectorId,
  tuitionBilledFromRollup,
} from "./fee-allocation";
import { applyRecordedFeePayment } from "./apply-fee-payment";
import type { StudentFeeAccount } from "./fee-types";

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

test("tuition billed is recovered from the enrollment rollup when only transport has a charge row", () => {
  assert.equal(
    tuitionBilledFromRollup({
      tuitionDueAmount: null,
      dueAmount: 3_120_000,
      transportDueAmount: 120_000,
    }),
    3_000_000,
  );
  assert.equal(isPayableObligation({ remaining: 0, status: "paid" }), false);
  assert.equal(isPayableObligation({ remaining: 3_000_000, status: "outstanding" }), true);
  const pending = pendingTuitionSelectorId("enr-1");
  assert.equal(parsePayableSelectorId(pending).pendingTuition, true);
  assert.equal(parsePayableSelectorId(pending).enrollmentId, "enr-1");
  assert.equal(parsePayableSelectorId("charge-uuid").chargeId, "charge-uuid");
});

test("dropdown labels stay short and omit billed/paid/remaining", () => {
  assert.equal(
    compactFeeChargeLabel({
      chargeKind: "TUITION",
      description: "Annual school fees",
      academicYearName: "2026",
    }),
    "Annual Fees · 2026",
  );
  assert.equal(
    compactFeeChargeLabel({
      chargeKind: "TRANSPORT",
      description: "Transport · KIVIGA",
      academicYearName: "2026",
      billingPeriod: "Oct 2026",
    }),
    "Transport · KIVIGA · Oct 2026",
  );
  assert.equal(compactFeeChargeLabel({
    chargeKind: "TUITION",
    description: "Term 5 Fees",
    academicYearName: "2026",
  }).includes("billed"), false);
});

test("a recorded payment reduces only the selected charge", () => {
  const account = {
    enrollmentId: "enr-1",
    studentId: "stu-1",
    feeStructureId: "fs",
    chargeId: "tuition-1",
    annualAmount: 3_120_000,
    paidAmount: 120_000,
    outstandingAmount: 3_000_000,
    totalBilled: 3_120_000,
    totalPaid: 120_000,
    totalOutstanding: 3_000_000,
    status: "partial",
    academicYearName: "2026",
    obligations: [
      {
        enrollmentId: "enr-1",
        chargeId: "tuition-1",
        description: "Annual school fees",
        academicYearId: "y1",
        academicYearName: "2026",
        billed: 3_000_000,
        paid: 0,
        remaining: 3_000_000,
        status: "outstanding",
        chargeKind: "TUITION",
      },
      {
        enrollmentId: "enr-1",
        chargeId: "transport-oct",
        description: "Transport · KIVIGA",
        academicYearId: "y1",
        academicYearName: "2026",
        billed: 120_000,
        paid: 120_000,
        remaining: 0,
        status: "paid",
        chargeKind: "TRANSPORT",
        billingPeriod: "Oct 2026",
      },
    ],
    payments: [],
  } as unknown as StudentFeeAccount;
  const next = applyRecordedFeePayment(account, {
    selectorId: "tuition-1",
    amount: 500_000,
    chargeId: "tuition-1",
    payment: {
      id: "pay-1",
      paymentNumber: "PAY-1",
      amount: 500_000,
      method: "CASH",
      paymentDate: "2026-10-10",
      recordedAt: "2026-10-10T00:00:00.000Z",
      reference: "",
      notes: "",
      status: "posted",
      chargeId: "tuition-1",
      academicYearName: "2026",
      recordedByName: "",
      recordedById: null,
      verifiedByName: "",
      verifiedById: null,
      verifiedAt: null,
    },
  });
  const tuition = next.obligations.find((row) => row.chargeId === "tuition-1");
  const transport = next.obligations.find((row) => row.chargeId === "transport-oct");
  assert.equal(tuition?.paid, 500_000);
  assert.equal(tuition?.remaining, 2_500_000);
  assert.equal(transport?.paid, 120_000);
  assert.equal(transport?.remaining, 0);
  assert.equal(next.payments.length, 1);
  const twice = applyRecordedFeePayment(next, {
    selectorId: "tuition-1",
    amount: 500_000,
    chargeId: "tuition-1",
    payment: next.payments[0],
  });
  assert.equal(twice.payments.length, 1);
  assert.equal(twice.obligations.find((row) => row.chargeId === "tuition-1")?.paid, 500_000);
});
