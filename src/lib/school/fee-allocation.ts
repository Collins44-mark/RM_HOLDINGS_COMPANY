export function normalizeFeePaymentStatus(status: unknown) {
  return String(status ?? "").trim().toLowerCase();
}

export function isAllocatedFeePayment(status: unknown) {
  const next = normalizeFeePaymentStatus(status);
  return next === "posted" || next === "pending";
}

export function allocatedPaymentTotal(
  payments: Array<{ amount: number; status: string; chargeId?: string | null }>,
  chargeId?: string | null,
) {
  const id = String(chargeId ?? "").trim();
  if (!id) return 0;
  return payments.reduce((sum, payment) => {
    if (!isAllocatedFeePayment(payment.status)) return sum;
    if (String(payment.chargeId ?? "").trim() !== id) return sum;
    return sum + (Number.isFinite(payment.amount) ? payment.amount : 0);
  }, 0);
}

export function chargeRemaining(billed: number | null, paid: number) {
  if (billed == null) return null;
  return Math.max(0, billed - paid);
}
