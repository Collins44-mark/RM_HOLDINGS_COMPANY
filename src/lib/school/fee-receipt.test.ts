import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptBreakdown,
  formatSchoolReceiptNumber,
  receiptPaymentCategory,
  tanzanianShillingsInWords,
} from "./fee-receipt";

test("receipt numbers stay compact, sequential, and stable from stored payment numbers", () => {
  assert.equal(formatSchoolReceiptNumber("PAY-0001"), "RCPT-001");
  assert.equal(formatSchoolReceiptNumber("PAY-0002"), "RCPT-002");
  assert.equal(formatSchoolReceiptNumber("PAY-0001"), "RCPT-001");
  assert.equal(formatSchoolReceiptNumber("PAY-00080"), "RCPT-080");
});

test("amount in words follows the payment amount", () => {
  assert.equal(tanzanianShillingsInWords(80000), "Tanzanian Shillings Eighty Thousand Only");
  assert.equal(tanzanianShillingsInWords(70000), "Tanzanian Shillings Seventy Thousand Only");
  assert.equal(tanzanianShillingsInWords(1920000), "Tanzanian Shillings One Million Nine Hundred Twenty Thousand Only");
});

test("fee receipts keep previously paid exclusive of the current payment", () => {
  const lines = buildReceiptBreakdown({
    chargeDescription: "Annual School Fees",
    billed: 2_000_000,
    previouslyPaid: 1_920_000,
    thisPayment: 80_000,
    outstanding: 0,
  });
  assert.deepEqual(
    lines.map((line) => [line.label, line.amount, Boolean(line.emphasize)]),
    [
      ["Annual School Fees", 2_000_000, false],
      ["Previously Paid", 1_920_000, false],
      ["This Payment", 80_000, true],
      ["Outstanding Balance", 0, false],
    ],
  );
});

test("payment categories follow the actual charge kind", () => {
  assert.equal(receiptPaymentCategory("TUITION"), "School Fees");
  assert.equal(receiptPaymentCategory("TRANSPORT"), "School Bus");
  assert.equal(receiptPaymentCategory("STORE", "UNIFORM"), "Uniforms");
  assert.equal(receiptPaymentCategory("STORE", "STATIONERY"), "School Store");
});
