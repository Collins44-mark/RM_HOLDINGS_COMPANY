import assert from "node:assert/strict";
import test from "node:test";
import { filterLoans, isPracticeLoanParty, loanDashboard, type LoanPosition } from "./loan-model";

function loan(partial: Partial<LoanPosition> & Pick<LoanPosition, "id" | "status" | "outstanding">): LoanPosition {
  return {
    number: partial.id,
    partyId: "farmer",
    farmerName: "Amina",
    farmerNumber: "PTY-0001",
    approvedAmount: 1000,
    approvedOn: "2026-01-10",
    dueOn: "2026-06-10",
    disbursed: partial.outstanding,
    principalRepaid: 0,
    interestReceived: 0,
    feesReceived: 0,
    overdue: false,
    ...partial,
  };
}

test("only the two practice farmer records are excluded", () => {
  assert.equal(isPracticeLoanParty("5b9e5377-13c8-46c7-9c30-691da4ed5a08"), true);
  assert.equal(isPracticeLoanParty("e517ff8e-5161-41a3-a080-7f4107ffa9d5"), true);
  assert.equal(isPracticeLoanParty("11111111-1111-4111-8111-111111111111"), false);
});

test("dashboard totals come from posted loan balances", () => {
  const totals = loanDashboard([
    loan({ id: "1", partyId: "a", status: "ACTIVE", outstanding: 400, disbursed: 1000, principalRepaid: 600, overdue: true }),
    loan({ id: "2", partyId: "a", status: "CLOSED", outstanding: 0, disbursed: 500, principalRepaid: 500 }),
    loan({ id: "3", partyId: "b", status: "ACTIVE", outstanding: 50, disbursed: 50 }),
  ]);
  assert.equal(totals.disbursed, 1550);
  assert.equal(totals.principalRepaid, 1100);
  assert.equal(totals.outstanding, 450);
  assert.equal(totals.activeBorrowers, 2);
  assert.equal(totals.overdueLoans, 1);
});

test("loan filters keep status, farmer, date and search", () => {
  const rows = [
    loan({ id: "LN-0001", status: "ACTIVE", outstanding: 10, farmerName: "Amina Juma", approvedOn: "2026-02-01" }),
    loan({ id: "LN-0002", status: "CLOSED", outstanding: 0, farmerName: "Baraka", partyId: "other", approvedOn: "2026-03-01", overdue: false }),
  ];
  assert.equal(filterLoans(rows, { status: "CLOSED" }).length, 1);
  assert.equal(filterLoans(rows, { query: "amina" }).length, 1);
  assert.equal(filterLoans(rows, { partyId: "other" }).length, 1);
  assert.equal(filterLoans(rows, { from: "2026-03-01" }).length, 1);
});
