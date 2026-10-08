export type FeeAccountStatus = "outstanding" | "partial" | "paid" | "no_structure";

export type FeePaymentRow = {
  id: string;
  paymentNumber: string;
  amount: number;
  method: "CASH" | "MOBILE_MONEY" | "BANK";
  paymentDate: string;
  reference: string;
  notes: string;
  status: "pending" | "posted";
  recordedByName: string;
  recordedById: string | null;
  verifiedByName: string;
  verifiedById: string | null;
  verifiedAt: string | null;
};

export type StudentFeeAccount = {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  admissionNumber: string;
  academicYearId: string;
  academicYearName: string;
  termId: string | null;
  currentTermName: string | null;
  currentTermAmount: number | null;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  feeStructureId: string | null;
  chargeId: string | null;
  annualAmount: number | null;
  paidAmount: number;
  outstandingAmount: number | null;
  status: FeeAccountStatus;
  payments: FeePaymentRow[];
};

export type FeeAccountListRow = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  admissionNumber: string;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  streamName: string;
  academicYearId: string;
  academicYearName: string;
  annualAmount: number | null;
  currentTermName: string | null;
  currentTermAmount: number | null;
  paidAmount: number;
  outstandingAmount: number | null;
  status: FeeAccountStatus;
  chargeId: string | null;
};

export type FeeSummary = {
  totalFees: number;
  collected: number;
  outstanding: number;
  studentsWithBalance: number;
};

export type FeeListFilter = {
  page?: number;
  academicYearId?: string;
  levelId?: string;
  classId?: string;
  status?: string;
  q?: string;
};

export function feeStatusLabel(status: FeeAccountStatus) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partially Paid";
  if (status === "no_structure") return "No Fee Structure";
  return "Outstanding";
}

export function asFeeStatus(value: unknown): FeeAccountStatus {
  const next = String(value ?? "").trim();
  if (next === "paid" || next === "partial" || next === "no_structure" || next === "outstanding") return next;
  return "outstanding";
}

export function paymentMethodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "Mobile Money";
  if (method === "BANK") return "Bank";
  return "Cash";
}
