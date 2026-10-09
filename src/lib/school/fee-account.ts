import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";
import { asFeeStatus, type FeeObligationRow, type FeePaymentRow, type StudentFeeAccount } from "@/lib/school/fee-types";

export type { FeeAccountStatus, FeePaymentRow, StudentFeeAccount } from "@/lib/school/fee-types";
export { asFeeStatus, feeStatusLabel } from "@/lib/school/fee-types";

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapObligation(row: Record<string, unknown>): FeeObligationRow {
  const billed = row.due_amount == null ? null : num(row.due_amount);
  const paid = num(row.paid_amount);
  return {
    enrollmentId: str(row.enrollment_id),
    chargeId: str(row.charge_id) || null,
    description: "Annual school fees",
    academicYearId: str(row.academic_year_id),
    academicYearName: str(row.academic_year_name),
    billed,
    paid,
    remaining: row.outstanding_amount == null ? null : num(row.outstanding_amount),
    status: asFeeStatus(row.fee_status),
  };
}

export async function getStudentFeeAccount(input: {
  supabase: SupabaseClient;
  businessUnitId: string;
  enrollmentId?: string;
  studentId?: string;
  academicYearId?: string;
}): Promise<StudentFeeAccount | null> {
  let query = input.supabase.from("sch_v_fee_accounts").select("*").eq("business_unit_id", input.businessUnitId);
  if (str(input.enrollmentId)) query = query.eq("enrollment_id", str(input.enrollmentId));
  else if (str(input.studentId)) {
    query = query.eq("student_id", str(input.studentId));
    if (str(input.academicYearId)) query = query.eq("academic_year_id", str(input.academicYearId));
  } else return null;
  const result = await query.maybeSingle();
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return null;
  if (!result.data) return null;
  const row = result.data as Record<string, unknown>;
  const studentId = str(row.student_id);

  const yearId = str(row.academic_year_id);
  const today = new Date().toISOString().slice(0, 10);
  const [relatedRes, payments, termsRes, structureRes] = await Promise.all([
    input.supabase
      .from("sch_v_fee_accounts")
      .select(
        "enrollment_id, charge_id, academic_year_id, academic_year_name, due_amount, paid_amount, outstanding_amount, fee_status",
      )
      .eq("business_unit_id", input.businessUnitId)
      .eq("student_id", studentId),
    loadPayments(input.supabase, input.businessUnitId, studentId),
    input.supabase
      .from("sch_terms")
      .select("id, name, start_date, end_date")
      .eq("business_unit_id", input.businessUnitId)
      .eq("academic_year_id", yearId)
      .eq("is_active", true)
      .order("sort_order"),
    str(row.fee_structure_id)
      ? input.supabase
          .from("sch_fee_structure_terms")
          .select("term_id, amount")
          .eq("business_unit_id", input.businessUnitId)
          .eq("fee_structure_id", str(row.fee_structure_id))
      : Promise.resolve({ data: [] as Array<{ term_id: string; amount: number }> }),
  ]);

  const related = relatedRes.error && !isSchoolUnconfiguredRead(relatedRes.error) ? [] : (relatedRes.data ?? []);
  const obligations = (related.length ? related : [row]).map((item) => mapObligation(item as Record<string, unknown>));
  const yearByCharge = new Map(obligations.filter((item) => item.chargeId).map((item) => [item.chargeId as string, item.academicYearName]));
  const currentTerm = (termsRes.data ?? []).find((term) => {
    const start = String(term.start_date ?? "");
    const end = String(term.end_date ?? "");
    return Boolean(start && end && start <= today && today <= end);
  });
  const currentTermAmount = currentTerm
    ? (structureRes.data ?? []).find((item) => String(item.term_id) === String(currentTerm.id))
    : null;
  const paymentsWithYear = payments.map((payment) => ({
    ...payment,
    academicYearName: payment.chargeId ? yearByCharge.get(payment.chargeId) ?? "" : "",
  }));

  let totalBilled: number | null = null;
  let totalPaid = 0;
  let totalOutstanding: number | null = null;
  for (const item of obligations) {
    if (item.billed != null) totalBilled = (totalBilled ?? 0) + item.billed;
    totalPaid += item.paid;
    if (item.remaining != null) totalOutstanding = (totalOutstanding ?? 0) + item.remaining;
  }

  const annual = row.due_amount == null ? null : num(row.due_amount);
  const paid = num(row.paid_amount);
  return {
    enrollmentId: str(row.enrollment_id),
    studentId,
    studentNumber: str(row.student_number),
    studentName: str(row.student_name),
    admissionNumber: str(row.admission_number),
    studentStatus: str(row.student_status) || "active",
    academicYearId: str(row.academic_year_id),
    academicYearName: str(row.academic_year_name),
    termId: str(row.enrollment_term_id) || null,
    currentTermName: currentTerm ? String(currentTerm.name) : null,
    currentTermAmount: currentTermAmount ? num(currentTermAmount.amount) : null,
    levelId: str(row.level_id),
    levelName: str(row.level_name),
    classId: str(row.class_id),
    className: str(row.class_name),
    classCode: str(row.class_code) || str(row.class_name),
    streamId: str(row.stream_id),
    streamName: str(row.stream_name),
    feeStructureId: str(row.fee_structure_id) || null,
    chargeId: str(row.charge_id) || null,
    annualAmount: annual,
    paidAmount: paid,
    outstandingAmount: row.outstanding_amount == null ? null : num(row.outstanding_amount),
    totalBilled,
    totalPaid,
    totalOutstanding,
    status: asFeeStatus(row.fee_status),
    obligations,
    payments: paymentsWithYear,
  };
}

async function loadPayments(
  supabase: SupabaseClient,
  businessUnitId: string,
  studentId: string,
): Promise<FeePaymentRow[]> {
  if (!studentId) return [];
  const result = await supabase
    .from("sch_fee_payments")
    .select(
      "id, payment_number, amount, method, payment_date, created_at, reference, notes, status, recorded_by, verified_by, verified_at, charge_id",
    )
    .eq("business_unit_id", businessUnitId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  const rows = result.data ?? [];
  const userIds = [...new Set(rows.flatMap((row) => [row.recorded_by, row.verified_by].filter(Boolean).map(String)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const profiles = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const profile of profiles.data ?? []) names.set(String(profile.id), String(profile.full_name ?? ""));
  }
  return rows.map((row) => ({
    id: String(row.id),
    paymentNumber: String(row.payment_number),
    amount: num(row.amount),
    method: row.method === "MOBILE_MONEY" || row.method === "BANK" ? row.method : "CASH",
    paymentDate: String(row.payment_date ?? ""),
    recordedAt: String(row.created_at ?? row.payment_date ?? ""),
    reference: String(row.reference ?? ""),
    notes: String(row.notes ?? ""),
    status: row.status === "posted" ? "posted" : "pending",
    chargeId: row.charge_id ? String(row.charge_id) : null,
    academicYearName: "",
    recordedById: row.recorded_by ? String(row.recorded_by) : null,
    recordedByName: row.recorded_by ? names.get(String(row.recorded_by)) ?? "" : "",
    verifiedById: row.verified_by ? String(row.verified_by) : null,
    verifiedByName: row.verified_by ? names.get(String(row.verified_by)) ?? "" : "",
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
  }));
}
