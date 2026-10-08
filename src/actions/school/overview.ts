"use server";

import { hasPermission } from "@/lib/auth/rbac";
import { requireAuth, identityFromUser } from "@/lib/auth/session";
import { isSchoolUnconfiguredRead, requireSchoolContext, schoolActionError, SchoolError } from "@/lib/school/access";
import type { ConfigStatus, OverviewMetric, SchoolOverviewView } from "@/lib/school/overview";

function unavailable(): OverviewMetric<number> {
  return { status: "unavailable", reason: "not_implemented" };
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

    const [
      buRes,
      profileRes,
      currentYearsRes,
      classCountRes,
      enrollmentCountRes,
      teacherCountRes,
      gradingRes,
      attendanceRes,
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
        .from("sch_student_enrollments")
        .select("id, sch_students!inner(status)", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .eq("sch_students.status", "active"),
      supabase
        .from("sch_staff")
        .select("id, sch_staff_types!inner(kind)", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("employment_status", "active")
        .eq("sch_staff_types.kind", "academic"),
      supabase
        .from("sch_grading_scales")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("sch_attendance_settings")
        .select("business_unit_id")
        .eq("business_unit_id", businessUnitId)
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
    if (academicYear.status === "error") currentTerm = { status: "error" };
    else if (academicYear.status === "conflict") currentTerm = { status: "none" };
    else if (yearId) {
      const termsRes = await supabase
        .from("sch_terms")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("academic_year_id", yearId)
        .eq("is_active", true);
      if (termsRes.error && !isSchoolUnconfiguredRead(termsRes.error)) currentTerm = { status: "error" };
      else if ((termsRes.data ?? []).length === 1) {
        currentTerm = { status: "ok", name: String(termsRes.data![0].name) };
      } else if ((termsRes.data ?? []).length > 1) currentTerm = { status: "multiple" };
      else currentTerm = { status: "none" };
    }

    let enrollmentCount = enrollmentCountRes;
    if (yearId) {
      const currentEnroll = await supabase
        .from("sch_student_enrollments")
        .select("id, sch_students!inner(status)", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .eq("academic_year_id", yearId)
        .eq("sch_students.status", "active");
      if (!currentEnroll.error || isSchoolUnconfiguredRead(currentEnroll.error)) enrollmentCount = currentEnroll;
    }

    let feesCollected: OverviewMetric<number> = { status: "ok", value: 0 };
    let outstandingFees: OverviewMetric<number> = { status: "ok", value: 0 };
    let feeQuery = supabase.from("sch_v_fee_accounts").select("paid_amount, outstanding_amount").eq("business_unit_id", businessUnitId);
    if (yearId) feeQuery = feeQuery.eq("academic_year_id", yearId);
    const feeRes = await feeQuery;
    if (feeRes.error && !isSchoolUnconfiguredRead(feeRes.error)) {
      feesCollected = { status: "error" };
      outstandingFees = { status: "error" };
    } else {
      let collected = 0;
      let outstanding = 0;
      for (const row of feeRes.data ?? []) {
        collected += Number(row.paid_amount ?? 0) || 0;
        outstanding += Number(row.outstanding_amount ?? 0) || 0;
      }
      feesCollected = { status: "ok", value: collected };
      outstandingFees = { status: "ok", value: outstanding };
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
    const attendanceRules: ConfigStatus =
      attendanceRes.error && !isSchoolUnconfiguredRead(attendanceRes.error)
        ? "error"
        : configFromRow(Boolean(attendanceRes.data), "presence");
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
    if (attendanceRules === "not_configured") attention.push("Attendance rules not configured");

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
        teachers:
          teacherCountRes.error && !isSchoolUnconfiguredRead(teacherCountRes.error)
            ? { status: "error" as const }
            : typeof teacherCountRes.count === "number"
              ? { status: "ok" as const, value: teacherCountRes.count }
              : { status: "ok" as const, value: 0 },
        attendance: unavailable(),
        feesCollected,
        outstandingFees,
        grading,
        attendanceRules,
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
