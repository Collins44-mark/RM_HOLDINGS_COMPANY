import { chargeRemaining, payableSelectorId } from "@/lib/school/fee-allocation";
import { feeStatusFromAmounts, type FeePaymentRow, type StudentFeeAccount } from "@/lib/school/fee-types";

export function applyRecordedFeePayment(
  account: StudentFeeAccount,
  input: {
    selectorId: string;
    amount: number;
    chargeId?: string | null;
    payment: FeePaymentRow;
  },
): StudentFeeAccount {
  if (account.payments.some((row) => row.id === input.payment.id)) return account;
  const obligations = account.obligations.map((row) => {
    if (payableSelectorId(row) !== input.selectorId) return row;
    const paid = row.paid + input.amount;
    const remaining = chargeRemaining(row.billed, paid);
    const chargeId = input.chargeId || row.chargeId;
    return {
      ...row,
      chargeId,
      paid,
      remaining,
      status: feeStatusFromAmounts(row.billed, paid, Boolean(chargeId || row.billed != null)),
    };
  });
  const enrollmentRows = obligations.filter((row) => row.enrollmentId === account.enrollmentId);
  const annual = enrollmentRows.reduce((sum, row) => sum + (row.billed ?? 0), 0);
  const yearPaid = enrollmentRows.reduce((sum, row) => sum + row.paid, 0);
  const yearRemaining = enrollmentRows.reduce((sum, row) => sum + (row.remaining ?? 0), 0);
  let totalBilled: number | null = null;
  let totalPaid = 0;
  let totalOutstanding: number | null = null;
  for (const row of obligations) {
    if (row.billed != null) totalBilled = (totalBilled ?? 0) + row.billed;
    totalPaid += row.paid;
    if (row.remaining != null) totalOutstanding = (totalOutstanding ?? 0) + row.remaining;
  }
  return {
    ...account,
    chargeId: enrollmentRows.find((row) => row.chargeKind === "TUITION")?.chargeId || account.chargeId,
    annualAmount: enrollmentRows.length ? annual : account.annualAmount,
    paidAmount: enrollmentRows.length ? yearPaid : account.paidAmount,
    outstandingAmount: enrollmentRows.length ? yearRemaining : account.outstandingAmount,
    totalBilled,
    totalPaid,
    totalOutstanding,
    status: feeStatusFromAmounts(
      enrollmentRows.length ? annual : account.annualAmount,
      enrollmentRows.length ? yearPaid : account.paidAmount,
      Boolean(account.feeStructureId || account.chargeId),
    ),
    obligations,
    payments: [input.payment, ...account.payments],
  };
}
