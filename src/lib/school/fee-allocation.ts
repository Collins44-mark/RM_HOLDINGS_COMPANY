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

export const PENDING_TUITION_PREFIX = "pending-tuition:";

function finiteAmount(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function pendingTuitionSelectorId(enrollmentId: string) {
  return `${PENDING_TUITION_PREFIX}${String(enrollmentId).trim()}`;
}

export function payableSelectorId(row: { chargeId?: string | null; enrollmentId: string }) {
  return String(row.chargeId ?? "").trim() || pendingTuitionSelectorId(row.enrollmentId);
}

export function parsePayableSelectorId(value: string) {
  const next = String(value ?? "").trim();
  if (next.startsWith(PENDING_TUITION_PREFIX)) {
    return { chargeId: "", enrollmentId: next.slice(PENDING_TUITION_PREFIX.length), pendingTuition: true as const };
  }
  return { chargeId: next, enrollmentId: "", pendingTuition: false as const };
}

/** Structure annual minus transport when no tuition charge row exists yet. */
export function tuitionBilledFromRollup(input: {
  tuitionDueAmount?: unknown;
  dueAmount?: unknown;
  transportDueAmount?: unknown;
  transportBilledFromCharges?: number;
}) {
  const tuitionDue = finiteAmount(input.tuitionDueAmount);
  if (tuitionDue != null) return tuitionDue;
  const due = finiteAmount(input.dueAmount);
  const transport =
    finiteAmount(input.transportDueAmount) ??
    (Number.isFinite(input.transportBilledFromCharges) ? Number(input.transportBilledFromCharges) : 0);
  if (due == null) return null;
  return Math.max(0, due - transport);
}

export function isPayableObligation(row: { remaining?: number | null; status?: string }) {
  if (String(row.status ?? "") === "no_structure") return false;
  return row.remaining != null && row.remaining > 0;
}
