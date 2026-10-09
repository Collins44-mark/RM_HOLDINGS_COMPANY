"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeAuditEvent } from "@/lib/audit";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { allocatedPaymentTotal } from "@/lib/school/fee-account";
import {
  isBillableTransportRoute,
  parseTransportBillingFrequency,
  transportBillingFrequencyLabel,
  type StudentTransportAssignment,
  type StudentTransportWorkspace,
  type TransportRouteOption,
} from "@/lib/school/transport-types";

const MANAGE = ["school.students.manage", "school.admissions.manage", "school.fees.manage"];
const VIEW = [
  "school.students.view",
  "school.students.manage",
  "school.admissions.view",
  "school.admissions.manage",
  "school.fees.view",
  "school.fees.manage",
  "school.fees.record",
  "school.routes.view",
  "school.transport.view",
];

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return MANAGE.some((code) => user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher)));
}

export async function listSchoolTransportRouteOptionsAction() {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW);
    const result = await supabase
      .from("sch_transport_routes")
      .select("id, name, price, billing_frequency, is_active")
      .eq("business_unit_id", businessUnitId)
      .order("name");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const routes: TransportRouteOption[] = (result.data ?? []).map((row) => {
      const billingFrequency = parseTransportBillingFrequency(row.billing_frequency);
      const option = {
        id: String(row.id),
        name: String(row.name),
        price: num(row.price),
        billingFrequency,
        isActive: Boolean(row.is_active),
        billable: false,
      };
      option.billable = isBillableTransportRoute(option);
      return option;
    });
    return { ok: true as const, routes };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), routes: [] as TransportRouteOption[] };
  }
}

export async function getStudentTransportWorkspaceAction(input: { studentId?: string; enrollmentId?: string }) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW);
    const studentId = str(input.studentId);
    let enrollmentId = str(input.enrollmentId);
    if (!studentId && !enrollmentId) throw new SchoolError("Student was not found.", "NOT_FOUND");
    if (!enrollmentId && studentId) {
      const enrollment = await supabase
        .from("sch_student_enrollments")
        .select("id, student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId)
        .eq("status", "active")
        .maybeSingle();
      enrollmentId = str(enrollment.data?.id);
    }
    const enrollment = enrollmentId
      ? await supabase
          .from("sch_student_enrollments")
          .select("id, student_id")
          .eq("business_unit_id", businessUnitId)
          .eq("id", enrollmentId)
          .maybeSingle()
      : { data: null };
    const resolvedStudentId = str(enrollment.data?.student_id) || studentId;
    if (!resolvedStudentId) throw new SchoolError("Student was not found.", "NOT_FOUND");

    const [assignRes, routesRes, chargesRes] = await Promise.all([
      supabase
        .from("sch_student_transport")
        .select("id, route_id, fare, billing_frequency, status, started_on, ended_on")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", resolvedStudentId)
        .order("started_on", { ascending: false }),
      supabase
        .from("sch_transport_routes")
        .select("id, name, price, billing_frequency, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sch_fee_charges")
        .select("id, annual_amount, route_id, billing_frequency, billing_period, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", resolvedStudentId)
        .eq("charge_kind", "TRANSPORT")
        .order("created_at", { ascending: false }),
    ]);
    if (assignRes.error && !isSchoolUnconfiguredRead(assignRes.error)) mapSchoolDbError(assignRes.error, "load");
    if (chargesRes.error && !isSchoolUnconfiguredRead(chargesRes.error)) mapSchoolDbError(chargesRes.error, "load");

    const routes: TransportRouteOption[] = (routesRes.data ?? []).map((row) => {
      const billingFrequency = parseTransportBillingFrequency(row.billing_frequency);
      const option = {
        id: String(row.id),
        name: String(row.name),
        price: num(row.price),
        billingFrequency,
        isActive: Boolean(row.is_active),
        billable: false,
      };
      option.billable = isBillableTransportRoute(option);
      return option;
    });
    const routeName = new Map(routes.map((row) => [row.id, row.name]));
    const chargeIds = (chargesRes.data ?? []).map((row) => String(row.id));
    const paymentsRes = chargeIds.length
      ? await supabase
          .from("sch_fee_payments")
          .select("id, charge_id, amount, status, payment_date, method, reference")
          .eq("business_unit_id", businessUnitId)
          .in("charge_id", chargeIds)
          .order("payment_date", { ascending: false })
      : { data: [] as Array<{ id: string; charge_id: string; amount: number; status: string; payment_date: string; method: string; reference: string }> };

    const payments = (paymentsRes.data ?? []).map((row) => ({
      id: String(row.id),
      chargeId: str(row.charge_id),
      amount: num(row.amount),
      status: str(row.status),
      paymentDate: str(row.payment_date),
      method: str(row.method),
      reference: str(row.reference),
    }));

    const history: StudentTransportAssignment[] = (assignRes.data ?? []).map((row) => ({
      id: String(row.id),
      routeId: str(row.route_id),
      routeName: routeName.get(str(row.route_id)) || "Route",
      fare: num(row.fare),
      billingFrequency: str(row.billing_frequency),
      status: str(row.status) === "active" ? "active" : "inactive",
      startedOn: str(row.started_on),
      endedOn: str(row.ended_on),
      billingPeriod: "",
    }));
    const assignment = history.find((row) => row.status === "active") ?? null;
    const charges = (chargesRes.data ?? []).map((row) => {
      const paid = allocatedPaymentTotal(payments, String(row.id));
      const amount = num(row.annual_amount);
      const outstanding = Math.max(0, amount - paid);
      return {
        id: String(row.id),
        routeName: routeName.get(str(row.route_id)) || "Route",
        amount,
        paid,
        outstanding,
        status: outstanding <= 0 ? "Paid" : paid > 0 ? "Partially Paid" : "Outstanding",
        billingFrequency: str(row.billing_frequency),
        billingPeriod: str(row.billing_period),
        isActive: Boolean(row.is_active),
      };
    });
    if (assignment && charges[0]) assignment.billingPeriod = charges[0].billingPeriod;
    const billed = charges.reduce((sum, row) => sum + row.amount, 0);
    const collected = charges.reduce((sum, row) => sum + row.paid, 0);
    const outstanding = charges.reduce((sum, row) => sum + row.outstanding, 0);
    const workspace: StudentTransportWorkspace = {
      status: assignment ? "active" : history.length ? "inactive" : "not_enrolled",
      assignment,
      history,
      charges,
      payments: payments.map((row) => ({
        id: row.id,
        amount: row.amount,
        paymentDate: row.paymentDate,
        status: row.status,
        method: row.method,
        reference: row.reference,
      })),
      outstanding,
      billed,
      collected,
      currentPeriod: assignment ? transportBillingFrequencyLabel(assignment.billingFrequency) : "—",
      routes,
      canManage: canManage(user),
    };
    return { ok: true as const, workspace, enrollmentId, studentId: resolvedStudentId };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type StudentTransportWorkspaceResult = Awaited<ReturnType<typeof getStudentTransportWorkspaceAction>>;

export async function setStudentTransportAction(input: {
  studentId?: string;
  enrollmentId: string;
  enabled: boolean;
  routeId?: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission(MANAGE);
    const enrollmentId = str(input.enrollmentId);
    if (!enrollmentId) throw new SchoolError("An active enrollment was not found.", "NOT_FOUND");
    const enabled = Boolean(input.enabled);
    const routeId = str(input.routeId);
    if (enabled && !routeId) throw new SchoolError("Select a school transport route.", "VALIDATION");
    if (enabled) {
      const route = await supabase
        .from("sch_transport_routes")
        .select("id, name, price, billing_frequency, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", routeId)
        .maybeSingle();
      if (!route.data?.id || !route.data.is_active) throw new SchoolError("Select an active school transport route.", "VALIDATION");
      if (num(route.data.price) <= 0) throw new SchoolError("This route has no fare configured.", "VALIDATION");
      if (!parseTransportBillingFrequency(route.data.billing_frequency)) {
        throw new SchoolError("Set a billing frequency on this route before assigning students.", "VALIDATION");
      }
    }
    const { data, error } = await supabase.rpc("sch_apply_student_transport", {
      p_enrollment_id: enrollmentId,
      p_enabled: enabled,
      p_route_id: enabled ? routeId : null,
      p_admission_id: null,
    });
    if (error) throw new SchoolError(error.message || "Couldn't update school transport.", "DATABASE");
    const payload = (data ?? {}) as { status?: string; assignment_id?: string };
    revalidatePath("/school/fees");
    revalidatePath("/school");
    revalidatePath("/owner");
    revalidatePath("/owner/finance");
    await writeAuditEvent({
      action: enabled ? (payload.status === "active" ? "school.transport_activated" : "school.transport_updated") : "school.transport_deactivated",
      description: enabled ? `School transport ${routeId ? "assigned" : "updated"}` : "School transport deactivated",
      entityType: "sch_student_transport",
      entityId: payload.assignment_id ?? enrollmentId,
      businessUnitId,
      module: "school",
      severity: "medium",
    });
    return getStudentTransportWorkspaceAction({ studentId: input.studentId, enrollmentId });
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
