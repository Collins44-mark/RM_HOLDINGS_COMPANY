export type LoanStatus = "APPROVED" | "ACTIVE" | "CLOSED";
export type ApplicationStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
export type LoanMethod = "CASH" | "MOBILE_MONEY" | "BANK";

export type LoanFarmer = {
  id: string;
  partyNumber: string;
  name: string;
  phone: string | null;
  kind: string;
  location: string | null;
  farmDetails: string | null;
  borrowed: number;
  repaid: number;
  outstanding: number;
  loanCount: number;
};

export type LoanApplication = {
  id: string;
  number: string;
  partyId: string;
  farmerName: string;
  farmerNumber: string;
  requestedAmount: number;
  applicationDate: string;
  purpose: string;
  status: ApplicationStatus;
  submittedBy: string | null;
  decisionNote: string | null;
};

export type LoanPosition = {
  id: string;
  number: string;
  partyId: string;
  farmerName: string;
  farmerNumber: string;
  approvedAmount: number;
  approvedOn: string;
  dueOn: string;
  status: LoanStatus;
  disbursed: number;
  principalRepaid: number;
  interestReceived: number;
  feesReceived: number;
  outstanding: number;
  overdue: boolean;
};

export type LoanDisbursement = {
  id: string;
  number: string;
  amount: number;
  disbursedOn: string;
  method: string;
  reference: string | null;
};

export type LoanRepayment = {
  id: string;
  receiptNumber: string;
  principal: number;
  interest: number;
  fee: number;
  paidOn: string;
  method: string;
  reference: string | null;
};

export type LoanReportMovement = {
  id: string;
  date: string;
  number: string;
  farmerName: string;
  kind: "DISBURSEMENT" | "REPAYMENT";
  amount: number;
};

export type LoanReport = {
  loans: LoanPosition[];
  movements: LoanReportMovement[];
  disbursed: number;
  repaid: number;
  outstanding: number;
  periodDisbursed: number;
  periodRepaid: number;
};

export type LoanDashboard = {
  disbursed: number;
  principalRepaid: number;
  outstanding: number;
  activeBorrowers: number;
  overdueLoans: number;
};

/** Loan Test Farmer and Loan Check Farmer. LN-0001 through LN-0004 belong to these parties. */
export const PRACTICE_LOAN_PARTY_IDS = new Set([
  "5b9e5377-13c8-46c7-9c30-691da4ed5a08",
  "e517ff8e-5161-41a3-a080-7f4107ffa9d5",
]);

export function isPracticeLoanParty(partyId: string) {
  return PRACTICE_LOAN_PARTY_IDS.has(partyId);
}

export function loanDashboard(loans: LoanPosition[]): LoanDashboard {
  const borrowers = new Set<string>();
  const totals = loans.reduce(
    (sum, loan) => {
      if (loan.outstanding > 0) borrowers.add(loan.partyId);
      return {
        disbursed: sum.disbursed + loan.disbursed,
        principalRepaid: sum.principalRepaid + loan.principalRepaid,
        outstanding: sum.outstanding + loan.outstanding,
        overdueLoans: sum.overdueLoans + (loan.overdue ? 1 : 0),
      };
    },
    { disbursed: 0, principalRepaid: 0, outstanding: 0, overdueLoans: 0 },
  );
  return { ...totals, activeBorrowers: borrowers.size };
}

export function filterLoans(
  loans: LoanPosition[],
  input: { query?: string; status?: string; partyId?: string; from?: string; to?: string },
) {
  const query = (input.query ?? "").trim().toLowerCase();
  const status = input.status ?? "ALL";
  return loans.filter((loan) => {
    if (input.partyId && loan.partyId !== input.partyId) return false;
    if (status === "OVERDUE" && !loan.overdue) return false;
    if (status === "APPROVED" || status === "ACTIVE" || status === "CLOSED") {
      if (loan.status !== status) return false;
    }
    if (input.from && loan.approvedOn < input.from) return false;
    if (input.to && loan.approvedOn > input.to) return false;
    if (!query) return true;
    return (
      loan.number.toLowerCase().includes(query) ||
      loan.farmerName.toLowerCase().includes(query) ||
      loan.farmerNumber.toLowerCase().includes(query)
    );
  });
}
