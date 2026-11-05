"use server";

import { hasPermission } from "@/lib/auth/rbac";
import { requireAuth, identityFromUser } from "@/lib/auth/session";
import { isSchoolUnconfiguredRead, requireSchoolContext, schoolActionError, SchoolError } from "@/lib/school/access";
import type { ConfigStatus, OverviewMetric, SchoolOverviewView } from "@/lib/school/overview";
import { countDistinctTeachers } from "@/lib/school/teacher-staff";

async function teacherMetric(
  supabase: Awaited<ReturnType<typeof requireSchoolContext>>["supabase"],
  teacherCountRes: {
    data: Array<{ id?: unknown; role_id?: unknown; sch_staff_types?: { kind?: string } | { kind?: string }[] | null }> | null;
    error: { message?: string; code?: string } | null;
  },
): Promise<OverviewMetric<number>> {
  if (teacherCountRes.error && !isSchoolUnconfiguredRead(teacherCountRes.error)) return { status: "error" };
  const rows = teacherCountRes.data ?? [];
  const roleIds = [...new Set(rows.map((row) => String(row.role_id ?? "")).filter(Boolean))];
  const roleCodes = new Map<string, string>();
  if (roleIds.length) {
    const rolesRes = await supabase.from("roles").select("id, code").in("id", roleIds);
    for (const role of rolesRes.data ?? []) roleCodes.set(String(role.id), String(role.code ?? ""));
  }
  return {
    status: "ok",
    value: countDistinctTeachers(
      rows.map((row) => {
        const type = row.sch_staff_types as { kind?: string } | { kind?: string }[] | null;
        const typeKind = Array.isArray(type) ? type[0]?.kind : type?.kind;
        return {
          id: String(row.id ?? ""),
          typeKind: typeKind ?? null,
          roleCode: roleCodes.get(String(row.role_id ?? "")) ?? null,
        };
      }),
    ),
  };
}

async function sumFeeAccounts(
  supabase: Awaited<ReturnType<typeof requireSchoolContext>>["supabase"],
  businessUnitId: string,
  yearId: string | null,
): Promise<{ collected: OverviewMetric<number>; outstanding: OverviewMetric<number> }> {
  let query = supabase
    .from("sch_v_fee_accounts")
    .select("paid_amount, outstanding_amount")
    .eq("business_unit_id", businessUnitId);
  if (yearId) query = query.eq("academic_year_id", yearId);
  const feeRes = await query;
  if (feeRes.error && !isSchoolUnconfiguredRead(feeRes.error)) {
    return { collected: { status: "error" }, outstanding: { status: "error" } };
  }
  let collected = 0;
  let outstanding = 0;
  for (const row of feeRes.data ?? []) {
    collected += Number(row.paid_amount ?? 0) || 0;
    if (row.outstanding_amount != null) outstanding += Number(row.outstanding_amount) || 0;
  }
  return {
    collected: { status: "ok", value: collected },
    outstanding: { status: "ok", value: outstanding },
  };
}

function aggregateNumber(data: unknown, key: string) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[key];
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function configFromRow(exists: boolean, kind: "flag" | "presence", enabled?: boolean): ConfigStatus {
  if (kind === "flag") {
    if (!exists) return "not_configured";
    return enabled ? "enabled" : "disabled";
  }
  return exists ? "configured" : "not_configured";
}

export async function getSchoolOverviewAction(): Promise<
  { ok: true; overview: SchoolOverviewView } | { ok: false; error: string }
> {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolContext();
    const identity = identityFromUser(user);

    const calendarYear = new Date().getFullYear();
    const [
      buRes,
      profileRes,
      currentYearsRes,
      classCountRes,
      teacherCountRes,
      gradingRes,
      feeCountRes,
      transportRes,
    ] = await Promise.all([
      supabase.from("business_units").select("name, location").eq("id", businessUnitId).maybeSingle(),
      supabase
        .from("sch_school_profiles")
        .select("name, school_code, city")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
      supabase
        .from("sch_academic_years")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .eq("is_active", true),
      supabase
        .from("sch_class_levels")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true),
      supabase
        .from("sch_staff")
        .select("id, role_id, sch_staff_types(kind)")
        .eq("business_unit_id", businessUnitId)
        .eq("employment_status", "active"),
      supabase
        .from("sch_grading_scales")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("sch_fee_structures")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true),
      supabase
        .from("sch_transport_settings")
        .select("enabled")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
    ]);

    if (buRes.error && !isSchoolUnconfiguredRead(buRes.error) && profileRes.error && !isSchoolUnconfiguredRead(profileRes.error)) {
      throw new SchoolError("Couldn't load school overview.", "DATABASE");
    }

    const buName = String(buRes.data?.name ?? "").trim();
    const buLocation = String(buRes.data?.location ?? "").trim();
    const profileName = String(profileRes.data?.name ?? "").trim();
    const profileCode = String(profileRes.data?.school_code ?? "").trim();
    const profileCity = String(profileRes.data?.city ?? "").trim();

    const schoolName = profileName || buName || "Not configured";
    const schoolCode = profileCode || "Not configured";
    const location = profileCity || buLocation || "Not configured";

    let academicYear: SchoolOverviewView["academicYear"];
    if (currentYearsRes.error && !isSchoolUnconfiguredRead(currentYearsRes.error)) academicYear = { status: "error" };
    else if ((currentYearsRes.data ?? []).length > 1) academicYear = { status: "conflict" };
    else if ((currentYearsRes.data ?? []).length === 1) {
      academicYear = { status: "ok", name: String(currentYearsRes.data![0].name) };
    } else academicYear = { status: "not_configured" };

    let currentTerm: SchoolOverviewView["currentTerm"] = { status: "none" };
    const yearId =
      academicYear.status === "ok" && currentYearsRes.data?.[0]?.id ? String(currentYearsRes.data[0].id) : null;
    let enrollmentQuery = supabase
      .from("sch_student_enrollments")
      .select("id, sch_students!inner(status)", { count: "exact", head: true })
      .eq("business_unit_id", businessUnitId)
      .eq("status", "active")
      .eq("sch_students.status", "active");
    if (yearId) enrollmentQuery = enrollmentQuery.eq("academic_year_id", yearId);
    let feeQuery = supabase
      .from("sch_v_fee_accounts")
      .select("paid:paid_amount.sum(),outstanding:outstanding_amount.sum()")
      .eq("business_unit_id", businessUnitId);
    if (yearId) feeQuery = feeQuery.eq("academic_year_id", yearId);

    const [termsRes, enrollmentCount, feeRes, expenseRes, teachers] = await Promise.all([
      yearId
        ? supabase
            .from("sch_terms")
            .select("id, name")
            .eq("business_unit_id", businessUnitId)
            .eq("academic_year_id", yearId)
            .eq("is_active", true)
        : Promise.resolve(null),
      enrollmentQuery,
      feeQuery,
      supabase
        .from("sch_expenses")
        .select("total:amount.sum()")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .gte("expense_date", `${calendarYear}-01-01`)
        .lte("expense_date", `${calendarYear}-12-31`),
      teacherMetric(supabase, teacherCountRes),
    ]);

    if (academicYear.status === "error") currentTerm = { status: "error" };
    else if (academicYear.status === "conflict") currentTerm = { status: "none" };
    else if (termsRes) {
      if (termsRes.error && !isSchoolUnconfiguredRead(termsRes.error)) currentTerm = { status: "error" };
      else if ((termsRes.data ?? []).length === 1) {
        currentTerm = { status: "ok", name: String(termsRes.data![0].name) };
      } else if ((termsRes.data ?? []).length > 1) currentTerm = { status: "multiple" };
      else currentTerm = { status: "none" };
    }

    let feesCollected: OverviewMetric<number> = { status: "ok", value: 0 };
    let outstandingFees: OverviewMetric<number> = { status: "ok", value: 0 };
    const paidTotal = aggregateNumber(feeRes.data, "paid");
    const outstandingTotal = aggregateNumber(feeRes.data, "outstanding");
    if (feeRes.error && !isSchoolUnconfiguredRead(feeRes.error)) {
      const fallback = await sumFeeAccounts(supabase, businessUnitId, yearId);
      feesCollected = fallback.collected;
      outstandingFees = fallback.outstanding;
    } else {
      feesCollected = { status: "ok", value: paidTotal ?? 0 };
      outstandingFees = { status: "ok", value: outstandingTotal ?? 0 };
    }

    let operatingExpenses: OverviewMetric<number> = { status: "ok", value: aggregateNumber(expenseRes.data, "total") ?? 0 };
    if (expenseRes.error && !isSchoolUnconfiguredRead(expenseRes.error)) {
      const fallback = await supabase
        .from("sch_expenses")
        .select("amount")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .gte("expense_date", `${calendarYear}-01-01`)
        .lte("expense_date", `${calendarYear}-12-31`);
      operatingExpenses =
        fallback.error && !isSchoolUnconfiguredRead(fallback.error)
          ? { status: "error" }
          : {
              status: "ok",
              value: (fallback.data ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
            };
    }

    const classLevels: OverviewMetric<number> =
      classCountRes.error && !isSchoolUnconfiguredRead(classCountRes.error)
        ? { status: "error" }
        : typeof classCountRes.count === "number"
          ? { status: "ok", value: classCountRes.count }
          : { status: "error" };

    const grading: ConfigStatus =
      gradingRes.error && !isSchoolUnconfiguredRead(gradingRes.error)
        ? "error"
        : configFromRow(Boolean(gradingRes.data?.id), "presence");
    const feeStructure: ConfigStatus =
      feeCountRes.error && !isSchoolUnconfiguredRead(feeCountRes.error)
        ? "error"
        : typeof feeCountRes.count === "number"
          ? configFromRow(feeCountRes.count > 0, "presence")
          : "not_configured";
    const transport: ConfigStatus =
      transportRes.error && !isSchoolUnconfiguredRead(transportRes.error)
        ? "error"
        : configFromRow(Boolean(transportRes.data), "flag", Boolean(transportRes.data?.enabled));

    const attention: string[] = [];
    if (academicYear.status === "not_configured") attention.push("No active academic year");
    if (academicYear.status === "conflict") attention.push("More than one current academic year");
    if (academicYear.status === "ok" && currentTerm.status === "none") attention.push("No active term");
    if (currentTerm.status === "multiple") attention.push("More than one active term");
    if (grading === "not_configured") attention.push("No grading scale configured");

    return {
      ok: true,
      overview: {
        schoolName,
        schoolCode,
        location,
        academicYear,
        currentTerm,
        classLevels,
        students:
          enrollmentCount.error && !isSchoolUnconfiguredRead(enrollmentCount.error)
            ? { status: "error" as const }
            : typeof enrollmentCount.count === "number"
              ? { status: "ok" as const, value: enrollmentCount.count }
              : { status: "ok" as const, value: 0 },
        teachers,
        feesCollected,
        outstandingFees,
        operatingExpenses,
        grading,
        feeStructure,
        transport,
        capabilities: {
          canConfigure: hasPermission(identity, "school.settings.view") || hasPermission(identity, "school.settings.manage"),
        },
        attention,
      },
    };
  } catch (error) {
    return { ok: false, error: schoolActionError(error) };
  }
}
