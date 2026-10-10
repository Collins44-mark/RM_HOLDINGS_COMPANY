import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";
import {
  allocatedPaymentTotal,
  chargeRemaining,
  normalizeFeePaymentStatus,
  tuitionBilledFromRollup,
} from "@/lib/school/fee-allocation";
import { feeStatusFromAmounts, type FeeObligationRow, type FeePaymentRow, type StudentFeeAccount } from "@/lib/school/fee-types";

export type { FeeAccountStatus, FeePaymentRow, StudentFeeAccount } from "@/lib/school/fee-types";
export { asFeeStatus, feeStatusLabel } from "@/lib/school/fee-types";

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export { allocatedPaymentTotal } from "@/lib/school/fee-allocation";

function mapObligation(row: Record<string, unknown>, allocated: number): FeeObligationRow {
  const billed = row.due_amount == null || row.due_amount === "" ? null : num(row.due_amount);
  const paid = allocated;
  const remaining = chargeRemaining(billed, paid);
  const kind = str(row.charge_kind) === "TRANSPORT" ? "TRANSPORT" : "TUITION";
  return {
    enrollmentId: str(row.enrollment_id),
    chargeId: str(row.charge_id) || null,
    description: kind === "TRANSPORT" ? str(row.description) || "School transport" : "Annual school fees",
    academicYearId: str(row.academic_year_id),
    academicYearName: str(row.academic_year_name),
    billed,
    paid,
    remaining,
    status: feeStatusFromAmounts(billed, paid, Boolean(str(row.fee_structure_id) || str(row.charge_id))),
    chargeKind: kind,
    billingFrequency: str(row.billing_frequency) || undefined,
    billingPeriod: str(row.billing_period) || undefined,
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
  const result = await query.limit(1);
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return null;
  const row = ((Array.isArray(result.data) ? result.data[0] : result.data) ?? null) as Record<string, unknown> | null;
  if (!row) return null;
  const studentId = str(row.student_id);
  if (!studentId) return null;

  const yearId = str(row.academic_year_id);
  const today = new Date().toISOString().slice(0, 10);
  const [relatedRes, chargesRes, balancesRes, payments, termsRes, structureRes] = await Promise.all([
    input.supabase
      .from("sch_v_fee_accounts")
      .select(
        "enrollment_id, student_id, charge_id, fee_structure_id, academic_year_id, academic_year_name, due_amount, paid_amount, outstanding_amount, fee_status, tuition_due_amount, transport_due_amount",
      )
      .eq("business_unit_id", input.businessUnitId)
      .eq("student_id", studentId),
    input.supabase
      .from("sch_fee_charges")
      .select("id, enrollment_id, annual_amount, charge_kind, route_id, billing_frequency, billing_period, academic_year_id, fee_structure_id, is_active")
      .eq("business_unit_id", input.businessUnitId)
      .eq("student_id", studentId)
      .eq("is_active", true),
    input.supabase
      .from("sch_v_fee_charge_balances")
      .select(
        "charge_id, enrollment_id, billed_amount, paid_amount, outstanding_amount, charge_kind, route_id, billing_frequency, billing_period, academic_year_id, fee_structure_id, is_active",
      )
      .eq("business_unit_id", input.businessUnitId)
      .eq("student_id", studentId)
      .eq("is_active", true),
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

  let related =
    relatedRes.error && !isSchoolUnconfiguredRead(relatedRes.error) ? [] : ((relatedRes.data ?? []) as Record<string, unknown>[]);
  if (relatedRes.error && /tuition_due_amount|transport_due_amount/i.test(relatedRes.error.message ?? "")) {
    const retry = await input.supabase
      .from("sch_v_fee_accounts")
      .select(
        "enrollment_id, student_id, charge_id, fee_structure_id, academic_year_id, academic_year_name, due_amount, paid_amount, outstanding_amount, fee_status",
      )
      .eq("business_unit_id", input.businessUnitId)
      .eq("student_id", studentId);
    related = retry.error ? [] : ((retry.data ?? []) as Record<string, unknown>[]);
  }
  const yearNameById = new Map(related.map((item) => [str((item as Record<string, unknown>).academic_year_id) || yearId, str((item as Record<string, unknown>).academic_year_name) || str(row.academic_year_name)]));
  const balances =
    balancesRes.error && !isSchoolUnconfiguredRead(balancesRes.error) ? [] : ((balancesRes.data ?? []) as Record<string, unknown>[]);
  const charges = chargesRes.error && !isSchoolUnconfiguredRead(chargesRes.error) ? [] : (chargesRes.data ?? []);
  const chargeRows = balances.length
    ? balances.map((item) => ({
        id: str(item.charge_id),
        enrollment_id: str(item.enrollment_id),
        annual_amount: item.billed_amount,
        paid_amount: item.paid_amount,
        charge_kind: item.charge_kind,
        route_id: item.route_id,
        billing_frequency: item.billing_frequency,
        billing_period: item.billing_period,
        academic_year_id: item.academic_year_id,
        fee_structure_id: item.fee_structure_id,
      }))
    : charges.map((charge) => ({
        id: str(charge.id),
        enrollment_id: str(charge.enrollment_id),
        annual_amount: charge.annual_amount,
        paid_amount: allocatedPaymentTotal(payments, str(charge.id)),
        charge_kind: charge.charge_kind,
        route_id: charge.route_id,
        billing_frequency: charge.billing_frequency,
        billing_period: charge.billing_period,
        academic_year_id: charge.academic_year_id,
        fee_structure_id: charge.fee_structure_id,
      }));
  const routeIds = [...new Set(chargeRows.map((item) => str(item.route_id)).filter(Boolean))];
  const routes = routeIds.length
    ? await input.supabase.from("sch_transport_routes").select("id, name").eq("business_unit_id", input.businessUnitId).in("id", routeIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const routeName = new Map((routes.data ?? []).map((item) => [String(item.id), str(item.name)]));
  const obligationsFromCharges = chargeRows.map((charge) => {
    const chargeId = str(charge.id);
    const billed = num(charge.annual_amount);
    const paid = balances.length ? num(charge.paid_amount) : allocatedPaymentTotal(payments, chargeId);
    const kind = str(charge.charge_kind) === "TRANSPORT" ? "TRANSPORT" : "TUITION";
    return mapObligation(
      {
        enrollment_id: str(charge.enrollment_id),
        charge_id: chargeId,
        due_amount: billed,
        fee_structure_id: charge.fee_structure_id,
        academic_year_id: str(charge.academic_year_id),
        academic_year_name: yearNameById.get(str(charge.academic_year_id)) || str(row.academic_year_name),
        charge_kind: kind,
        billing_frequency: charge.billing_frequency,
        billing_period: charge.billing_period,
        description: kind === "TRANSPORT" ? `Transport · ${routeName.get(str(charge.route_id)) || "Route"}` : "Annual school fees",
      },
      paid,
    );
  });
  const sourceRows = related.length ? related : [row];
  const tuitionPlaceholders = sourceRows
    .filter((item) => {
      const record = item as Record<string, unknown>;
      return !obligationsFromCharges.some((row) => row.enrollmentId === str(record.enrollment_id) && row.chargeKind === "TUITION");
    })
    .map((item) => {
      const record = item as Record<string, unknown>;
      const enrollmentId = str(record.enrollment_id);
      const transportBilled = obligationsFromCharges
        .filter((row) => row.enrollmentId === enrollmentId && row.chargeKind === "TRANSPORT")
        .reduce((sum, row) => sum + (row.billed ?? 0), 0);
      const billed = tuitionBilledFromRollup({
        tuitionDueAmount: record.tuition_due_amount,
        dueAmount: record.due_amount,
        transportDueAmount: record.transport_due_amount,
        transportBilledFromCharges: transportBilled,
      });
      const chargeId = str(record.charge_id) || null;
      return mapObligation(
        {
          enrollment_id: enrollmentId,
          charge_id: chargeId,
          due_amount: billed,
          fee_structure_id: record.fee_structure_id,
          academic_year_id: str(record.academic_year_id),
          academic_year_name: str(record.academic_year_name),
          charge_kind: "TUITION",
        },
        chargeId ? allocatedPaymentTotal(payments, chargeId) : 0,
      );
    })
    .filter((item) => item.billed != null);
  const obligations = [...obligationsFromCharges, ...tuitionPlaceholders];
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

  const currentRows = obligations.filter((item) => item.enrollmentId === str(row.enrollment_id));
  const current =
    currentRows.find((item) => item.chargeKind === "TUITION" && (item.remaining == null || item.remaining > 0)) ??
    currentRows.find((item) => item.remaining == null || item.remaining > 0) ??
    currentRows.find((item) => item.chargeKind === "TUITION") ??
    currentRows[0] ??
    obligations[0];
  const annual = currentRows.length
    ? currentRows.reduce((sum, item) => sum + (item.billed ?? 0), 0)
    : row.due_amount == null
      ? null
      : num(row.due_amount);
  const paid = currentRows.length ? currentRows.reduce((sum, item) => sum + item.paid, 0) : 0;
  const remaining = currentRows.length
    ? currentRows.reduce((sum, item) => sum + (item.remaining ?? 0), 0)
    : null;
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
    chargeId: current?.chargeId || str(row.charge_id) || null,
    annualAmount: annual,
    paidAmount: paid,
    outstandingAmount: remaining,
    totalBilled,
    totalPaid,
    totalOutstanding,
    status: feeStatusFromAmounts(annual, paid, Boolean(str(row.fee_structure_id) || current?.chargeId || remaining != null)),
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
    status: normalizeFeePaymentStatus(row.status) === "posted" ? "posted" : normalizeFeePaymentStatus(row.status) === "pending" ? "pending" : normalizeFeePaymentStatus(row.status),
    chargeId: row.charge_id ? String(row.charge_id) : null,
    academicYearName: "",
    recordedById: row.recorded_by ? String(row.recorded_by) : null,
    recordedByName: row.recorded_by ? names.get(String(row.recorded_by)) ?? "" : "",
    verifiedById: row.verified_by ? String(row.verified_by) : null,
    verifiedByName: row.verified_by ? names.get(String(row.verified_by)) ?? "" : "",
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
  }));
}
