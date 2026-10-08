import type { SupabaseClient } from "@supabase/supabase-js";
import { findApplicableFeeStructure } from "@/lib/school/fee-structure";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";
import { asFeeStatus, type FeePaymentRow, type StudentFeeAccount } from "@/lib/school/fee-types";

export type { FeeAccountStatus, FeePaymentRow, StudentFeeAccount } from "@/lib/school/fee-types";
export { asFeeStatus, feeStatusLabel } from "@/lib/school/fee-types";

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getStudentFeeAccount(input: {
  supabase: SupabaseClient;
  businessUnitId: string;
  enrollmentId?: string;
  studentId?: string;
  academicYearId?: string;
}): Promise<StudentFeeAccount | null> {
  let query = input.supabase
    .from("sch_v_fee_accounts")
    .select("*")
    .eq("business_unit_id", input.businessUnitId);
  if (str(input.enrollmentId)) query = query.eq("enrollment_id", str(input.enrollmentId));
  else if (str(input.studentId)) {
    query = query.eq("student_id", str(input.studentId));
    if (str(input.academicYearId)) query = query.eq("academic_year_id", str(input.academicYearId));
  } else return null;
  const result = await query.maybeSingle();
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return null;
  if (!result.data) return null;
  const row = result.data as Record<string, unknown>;
  const structure = str(row.fee_structure_id)
    ? await findApplicableFeeStructure({
        supabase: input.supabase,
        businessUnitId: input.businessUnitId,
        academicYearId: str(row.academic_year_id),
        classId: str(row.class_id),
        termId: str(row.enrollment_term_id),
      })
    : null;
  const payments = await loadPayments(input.supabase, input.businessUnitId, str(row.charge_id));
  const annual = row.due_amount == null ? null : num(row.due_amount);
  const paid = num(row.paid_amount);
  return {
    enrollmentId: str(row.enrollment_id),
    studentId: str(row.student_id),
    studentNumber: str(row.student_number),
    studentName: str(row.student_name),
    admissionNumber: str(row.admission_number),
    academicYearId: str(row.academic_year_id),
    academicYearName: str(row.academic_year_name),
    termId: str(row.enrollment_term_id) || null,
    currentTermName: structure?.currentTermName ?? null,
    currentTermAmount: structure?.currentTermAmount ?? null,
    levelId: str(row.level_id),
    levelName: str(row.level_name),
    classId: str(row.class_id),
    className: str(row.class_name),
    streamId: str(row.stream_id),
    streamName: str(row.stream_name),
    feeStructureId: str(row.fee_structure_id) || null,
    chargeId: str(row.charge_id) || null,
    annualAmount: annual,
    paidAmount: paid,
    outstandingAmount: row.outstanding_amount == null ? null : num(row.outstanding_amount),
    status: asFeeStatus(row.fee_status),
    payments,
  };
}

async function loadPayments(
  supabase: SupabaseClient,
  businessUnitId: string,
  chargeId: string,
): Promise<FeePaymentRow[]> {
  if (!chargeId) return [];
  const result = await supabase
    .from("sch_fee_payments")
    .select(
      "id, payment_number, amount, method, payment_date, reference, notes, status, recorded_by, verified_by, verified_at",
    )
    .eq("business_unit_id", businessUnitId)
    .eq("charge_id", chargeId)
    .order("created_at", { ascending: false });
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  const rows = result.data ?? [];
  const userIds = [
    ...new Set(rows.flatMap((row) => [row.recorded_by, row.verified_by].filter(Boolean).map(String))),
  ];
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
    reference: String(row.reference ?? ""),
    notes: String(row.notes ?? ""),
    status: row.status === "posted" ? "posted" : "pending",
    recordedById: row.recorded_by ? String(row.recorded_by) : null,
    recordedByName: row.recorded_by ? names.get(String(row.recorded_by)) ?? "" : "",
    verifiedById: row.verified_by ? String(row.verified_by) : null,
    verifiedByName: row.verified_by ? names.get(String(row.verified_by)) ?? "" : "",
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
  }));
}
