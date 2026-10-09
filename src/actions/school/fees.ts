"use server";

import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { revalidatePath } from "next/cache";
import { getStudentFeeAccount } from "@/lib/school/fee-account";
import {
  asFeeStatus,
  paymentMethodLabel,
  type FeeAccountListRow,
  type FeeListFilter,
  type FeeSummary,
} from "@/lib/school/fee-types";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import type { FeeReceiptPayload } from "@/lib/school/fee-receipt-pdf";

const VIEW = "school.fees.view";
const MANAGE = "school.fees.manage";
const RECORD = "school.fees.record";
const VERIFY = "school.fees.verify";
const RECEIPT = "school.fees.receipt";

export type { FeeAccountListRow, FeeListFilter, FeeSummary, StudentFeeAccount } from "@/lib/school/fee-types";

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>) {
  return {
    canView: hasPerm(user, VIEW) || hasPerm(user, MANAGE) || hasPerm(user, RECORD) || hasPerm(user, VERIFY),
    canRecord: hasPerm(user, RECORD),
    canVerify: hasPerm(user, VERIFY),
    canReceipt: hasPerm(user, RECEIPT),
    canManageStructures: hasPerm(user, MANAGE),
  };
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

function methodValue(value: unknown): "CASH" | "MOBILE_MONEY" | "BANK" {
  const next = str(value).toUpperCase();
  if (next === "CASH" || next === "MOBILE_MONEY" || next === "BANK") return next;
  throw new SchoolError("Choose a valid payment method.", "VALIDATION");
}

async function audit(input: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  businessUnitId: string;
}) {
  await writeAuditEvent({
    ...input,
    module: "school",
    severity: "medium",
  });
}

function applyAccountFilters<T extends { eq: (column: string, value: string) => T; or: (filters: string) => T }>(
  query: T,
  businessUnitId: string,
  input: FeeListFilter,
) {
  let next = query.eq("business_unit_id", businessUnitId);
  if (str(input.academicYearId)) next = next.eq("academic_year_id", str(input.academicYearId));
  if (str(input.levelId)) next = next.eq("level_id", str(input.levelId));
  if (str(input.classId)) next = next.eq("class_id", str(input.classId));
  const status = str(input.status);
  if (status === "outstanding" || status === "partial" || status === "paid" || status === "no_structure") {
    next = next.eq("fee_status", status);
  }
  const q = searchNeedle(input.q);
  if (q) {
    next = next.or(`student_name.ilike.%${q}%,student_number.ilike.%${q}%,admission_number.ilike.%${q}%`);
  }
  return next;
}

async function attachCurrentTerms(
  supabase: Awaited<ReturnType<typeof requireAnySchoolPermission>>["supabase"],
  businessUnitId: string,
  rows: FeeAccountListRow[],
) {
  const yearIds = [...new Set(rows.map((row) => row.academicYearId).filter(Boolean))];
  const classIds = [...new Set(rows.map((row) => row.classId).filter(Boolean))];
  if (!yearIds.length) return rows;
  const today = new Date().toISOString().slice(0, 10);
  const [termsRes, structuresRes] = await Promise.all([
    supabase
      .from("sch_terms")
      .select("id, name, academic_year_id, start_date, end_date")
      .eq("business_unit_id", businessUnitId)
      .in("academic_year_id", yearIds)
      .eq("is_active", true)
      .order("sort_order"),
    classIds.length
      ? supabase
          .from("sch_fee_structures")
          .select("id, academic_year_id, class_id")
          .eq("business_unit_id", businessUnitId)
          .eq("is_active", true)
          .in("academic_year_id", yearIds)
          .in("class_id", classIds)
      : Promise.resolve({ data: [] as Array<{ id: string; academic_year_id: string; class_id: string }>, error: null }),
  ]);
  const currentByYear = new Map<string, { id: string; name: string }>();
  for (const term of termsRes.data ?? []) {
    const yearId = String(term.academic_year_id);
    if (currentByYear.has(yearId)) continue;
    const start = String(term.start_date ?? "");
    const end = String(term.end_date ?? "");
    if (start && end && start <= today && today <= end) currentByYear.set(yearId, { id: String(term.id), name: String(term.name) });
  }
  const structures = structuresRes.data ?? [];
  const structureIds = structures.map((row) => String(row.id));
  const amountsRes = structureIds.length
    ? await supabase
        .from("sch_fee_structure_terms")
        .select("fee_structure_id, term_id, amount")
        .eq("business_unit_id", businessUnitId)
        .in("fee_structure_id", structureIds)
    : { data: [] as Array<{ fee_structure_id: string; term_id: string; amount: number }> };
  const amountByStructureTerm = new Map<string, number>();
  for (const row of amountsRes.data ?? []) {
    amountByStructureTerm.set(`${row.fee_structure_id}:${row.term_id}`, num(row.amount));
  }
  const structureByClassYear = new Map(structures.map((row) => [`${row.academic_year_id}:${row.class_id}`, String(row.id)]));
  for (const row of rows) {
    const current = currentByYear.get(row.academicYearId);
    row.currentTermName = current?.name ?? null;
    const structureId = structureByClassYear.get(`${row.academicYearId}:${row.classId}`);
    if (structureId && current) {
      const amount = amountByStructureTerm.get(`${structureId}:${current.id}`);
      row.currentTermAmount = amount == null ? null : amount;
    }
  }
  return rows;
}

async function attachLifetimeOutstanding(
  supabase: Awaited<ReturnType<typeof requireAnySchoolPermission>>["supabase"],
  businessUnitId: string,
  rows: FeeAccountListRow[],
) {
  const studentIds = [...new Set(rows.map((row) => row.studentId).filter(Boolean))];
  if (!studentIds.length) return rows;
  const result = await supabase
    .from("sch_v_fee_accounts")
    .select("student_id, outstanding_amount")
    .eq("business_unit_id", businessUnitId)
    .in("student_id", studentIds);
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return rows;
  const related = result.data ?? [];
  const totals = new Map<string, number | null>();
  for (const row of related) {
    const studentId = String(row.student_id);
    if (row.outstanding_amount == null) continue;
    totals.set(studentId, (totals.get(studentId) ?? 0) + num(row.outstanding_amount));
  }
  for (const row of rows) {
    row.totalOutstanding = totals.has(row.studentId) ? totals.get(row.studentId)! : row.outstandingAmount;
  }
  return rows;
}

async function loadAccounts(
  supabase: Awaited<ReturnType<typeof requireAnySchoolPermission>>["supabase"],
  businessUnitId: string,
  input: FeeListFilter,
) {
  const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
  let query = supabase
    .from("sch_v_fee_accounts")
    .select(
      "enrollment_id, student_id, student_name, student_number, admission_number, level_id, level_name, class_id, class_name, class_code, stream_name, academic_year_id, academic_year_name, due_amount, paid_amount, outstanding_amount, fee_status, charge_id, fee_structure_id",
      { count: "exact" },
    )
    .order("student_name");
  query = applyAccountFilters(query, businessUnitId, input);
  const result = await query.range(from, to);
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  const rows: FeeAccountListRow[] = (result.data ?? []).map((row) => ({
    enrollmentId: String(row.enrollment_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name ?? ""),
    studentNumber: String(row.student_number ?? ""),
    admissionNumber: String(row.admission_number ?? ""),
    levelId: String(row.level_id ?? ""),
    levelName: String(row.level_name ?? ""),
    classId: String(row.class_id ?? ""),
    className: String(row.class_name ?? ""),
    classCode: String(row.class_code ?? row.class_name ?? ""),
    streamName: String(row.stream_name ?? ""),
    academicYearId: String(row.academic_year_id ?? ""),
    academicYearName: String(row.academic_year_name ?? ""),
    annualAmount: row.due_amount == null ? null : num(row.due_amount),
    currentTermName: null,
    currentTermAmount: null,
    paidAmount: num(row.paid_amount),
    outstandingAmount: row.outstanding_amount == null ? null : num(row.outstanding_amount),
    totalOutstanding: row.outstanding_amount == null ? null : num(row.outstanding_amount),
    status: asFeeStatus(row.fee_status),
    chargeId: row.charge_id ? String(row.charge_id) : null,
  }));
  await Promise.all([
    attachCurrentTerms(supabase, businessUnitId, rows),
    attachLifetimeOutstanding(supabase, businessUnitId, rows),
  ]);
  return { rows, page: schoolPageMeta(page, result.count ?? 0, pageSize) };
}

async function loadSummary(
  supabase: Awaited<ReturnType<typeof requireAnySchoolPermission>>["supabase"],
  businessUnitId: string,
  input: FeeListFilter,
): Promise<FeeSummary> {
  let query = supabase.from("sch_v_fee_accounts").select("student_id, charge_id, due_amount, paid_amount, outstanding_amount");
  query = applyAccountFilters(query, businessUnitId, { ...input, page: undefined });
  const result = await query;
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  const rows = result.data ?? [];
  let totalFees = 0;
  let collected = 0;
  let outstanding = 0;
  let studentsWithBalance = 0;
  for (const row of rows) {
    const billed = row.due_amount == null ? null : num(row.due_amount);
    const paid = num(row.paid_amount);
    const remaining = row.outstanding_amount == null ? (billed == null ? null : Math.max(0, billed - paid)) : num(row.outstanding_amount);
    if (billed != null) totalFees += billed;
    collected += paid;
    if (remaining != null) {
      outstanding += remaining;
      if (remaining > 0) studentsWithBalance += 1;
    }
  }
  return { totalFees, collected, outstanding, studentsWithBalance };
}

export async function getSchoolFeesWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, RECORD, VERIFY, RECEIPT]);
    const [yearsRes, levelsRes] = await Promise.all([
      supabase
        .from("sch_academic_years")
        .select("id, name, is_current")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("start_date", { ascending: false }),
      supabase
        .from("sch_class_levels")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    const years =
      yearsRes.error && !isSchoolUnconfiguredRead(yearsRes.error)
        ? []
        : (yearsRes.data ?? []).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            isCurrent: Boolean(row.is_current),
          }));
    const levels =
      levelsRes.error && !isSchoolUnconfiguredRead(levelsRes.error)
        ? []
        : (levelsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
    const academicYearId = years.find((row) => row.isCurrent)?.id ?? years[0]?.id ?? "";
    const filter = { academicYearId, page: 1 };
    const [list, summary] = await Promise.all([
      loadAccounts(supabase, businessUnitId, filter),
      loadSummary(supabase, businessUnitId, filter),
    ]);
    return {
      ok: true as const,
      accounts: list.rows,
      page: list.page,
      summary,
      years,
      levels,
      academicYearId,
      capabilities: caps(user),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type SchoolFeesWorkspaceResult = Awaited<ReturnType<typeof getSchoolFeesWorkspaceAction>>;

export async function listSchoolFeeAccountsAction(input: FeeListFilter) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, RECORD, VERIFY, RECEIPT]);
    const [list, summary] = await Promise.all([
      loadAccounts(supabase, businessUnitId, input),
      loadSummary(supabase, businessUnitId, input),
    ]);
    return { ok: true as const, accounts: list.rows, page: list.page, summary, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolFeeAccountAction(enrollmentId: string) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, RECORD, VERIFY, RECEIPT]);
    const account = await getStudentFeeAccount({ supabase, businessUnitId, enrollmentId: str(enrollmentId) });
    if (!account) throw new SchoolError("Fee account was not found.", "NOT_FOUND");
    return { ok: true as const, account, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function recordSchoolFeePaymentAction(input: {
  enrollmentId: string;
  chargeId?: string;
  amount: string;
  method: string;
  paymentDate: string;
  reference: string;
  notes: string;
  requestId: string;
}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([RECORD]);
    const amount = Number(str(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new SchoolError("Enter a valid payment amount.", "VALIDATION");
    const method = methodValue(input.method);
    if (method !== "CASH" && !str(input.reference)) {
      throw new SchoolError("A payment reference is required for this method.", "VALIDATION");
    }
    const paymentDate = str(input.paymentDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new SchoolError("Payment date is required.", "VALIDATION");
    const requestId = str(input.requestId);
    if (!requestId) throw new SchoolError("Payment request is invalid.", "VALIDATION");
    const account = await getStudentFeeAccount({
      supabase,
      businessUnitId,
      enrollmentId: str(input.enrollmentId),
    });
    if (!account) throw new SchoolError("Fee account was not found.", "NOT_FOUND");
    const chargeId = str(input.chargeId);
    const target = chargeId ? account.obligations.find((row) => row.chargeId === chargeId) : account.obligations.find((row) => row.chargeKind === "TUITION") ?? account.obligations[0];
    if (!target && !account.feeStructureId && !account.chargeId) {
      throw new SchoolError("Fee structure not configured for this class.", "VALIDATION");
    }
    const { data, error } = await supabase.rpc("sch_record_fee_payment", {
      p_enrollment_id: target?.enrollmentId || account.enrollmentId,
      p_amount: amount,
      p_method: method,
      p_payment_date: paymentDate,
      p_reference: str(input.reference),
      p_notes: str(input.notes).slice(0, 240),
      p_request_id: requestId,
      p_actor_id: userId,
      p_charge_id: target?.chargeId || chargeId || null,
    });
    if (error) throw new SchoolError(error.message || "Couldn't save this payment.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; payment_number?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: "school.fee_payment_recorded",
        description: `School fee payment recorded · ${account.studentNumber} · ${amount}`,
        entityType: "sch_fee_payments",
        entityId: payload.id ?? null,
        businessUnitId,
      });
    }
    const next = await getStudentFeeAccount({ supabase, businessUnitId, enrollmentId: account.enrollmentId });
    revalidatePath("/school/fees");
    revalidatePath("/school");
    revalidatePath("/owner");
    revalidatePath("/owner/finance");
    revalidatePath("/owner/reports");
    return { ok: true as const, account: next, paymentId: payload.id ?? null, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function verifySchoolFeePaymentAction(paymentId: string) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([VERIFY]);
    const id = str(paymentId);
    const existing = await supabase
      .from("sch_fee_payments")
      .select("id, payment_number, recorded_by, status, enrollment_id, amount")
      .eq("business_unit_id", businessUnitId)
      .eq("id", id)
      .maybeSingle();
    if (!existing.data) throw new SchoolError("Payment was not found.", "NOT_FOUND");
    if (!isOwnerRole(user.roleCode) && existing.data.recorded_by && String(existing.data.recorded_by) === userId) {
      throw new SchoolError("You cannot verify a payment you recorded.", "PRIVILEGE");
    }
    const { data, error } = await supabase.rpc("sch_verify_fee_payment", {
      p_payment_id: id,
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't verify this payment.", "DATABASE");
    const payload = (data ?? {}) as { already_posted?: boolean; payment_number?: string };
    if (!payload.already_posted) {
      await audit({
        action: "school.fee_payment_verified",
        description: `School fee payment verified · ${String(existing.data.payment_number)}`,
        entityType: "sch_fee_payments",
        entityId: id,
        businessUnitId,
      });
    }
    const account = await getStudentFeeAccount({
      supabase,
      businessUnitId,
      enrollmentId: String(existing.data.enrollment_id),
    });
    revalidatePath("/school/fees");
    revalidatePath("/school");
    revalidatePath("/owner");
    revalidatePath("/owner/finance");
    revalidatePath("/owner/reports");
    return { ok: true as const, account, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolFeeReceiptAction(paymentId: string, options?: { audit?: boolean }) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([RECEIPT]);
    const id = str(paymentId);
    const payment = await supabase
      .from("sch_fee_payments")
      .select(
        "id, payment_number, amount, method, payment_date, reference, status, recorded_by, verified_by, enrollment_id",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("id", id)
      .maybeSingle();
    if (!payment.data) throw new SchoolError("Payment was not found.", "NOT_FOUND");
    if (String(payment.data.status) !== "posted") {
      throw new SchoolError("A receipt is available after the payment is verified.", "VALIDATION");
    }
    const account = await getStudentFeeAccount({
      supabase,
      businessUnitId,
      enrollmentId: String(payment.data.enrollment_id),
    });
    if (!account) throw new SchoolError("Fee account was not found.", "NOT_FOUND");
    const school = await supabase
      .from("sch_school_profiles")
      .select("name")
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    const namesNeeded = [payment.data.recorded_by, payment.data.verified_by].filter(Boolean).map(String);
    const profiles = namesNeeded.length
      ? await supabase.from("profiles").select("id, full_name").in("id", namesNeeded)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const nameMap = new Map((profiles.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "")]));
    const receipt: FeeReceiptPayload = {
      schoolName: str(school.data?.name) || "School Management",
      studentName: account.studentName,
      studentNumber: account.studentNumber,
      admissionNumber: account.admissionNumber,
      academicYearName: account.academicYearName,
      levelName: account.levelName,
      className: account.className,
      streamName: account.streamName,
      feeContext: "Annual school fees",
      paymentNumber: String(payment.data.payment_number),
      paymentDate: String(payment.data.payment_date ?? ""),
      amount: num(payment.data.amount),
      methodLabel: paymentMethodLabel(String(payment.data.method)),
      reference: str(payment.data.reference) || "—",
      recordedByName: payment.data.recorded_by ? nameMap.get(String(payment.data.recorded_by)) ?? "" : "",
      verifiedByName: payment.data.verified_by ? nameMap.get(String(payment.data.verified_by)) ?? "" : "",
      outstandingAmount: account.outstandingAmount,
    };
    if (options?.audit !== false) {
      await audit({
        action: "school.fee_receipt_generated",
        description: `School fee receipt generated · ${receipt.paymentNumber}`,
        entityType: "sch_fee_payments",
        entityId: id,
        businessUnitId,
      });
    }
    return { ok: true as const, receipt, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
