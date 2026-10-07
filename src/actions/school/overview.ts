"use server";

import { hasPermission } from "@/lib/auth/rbac";
import { requireAuth, identityFromUser } from "@/lib/auth/session";
import { isSchoolEmptyRead, requireSchoolContext, schoolActionError, SchoolError } from "@/lib/school/access";
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
        .from("sch_fee_categories")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true),
      supabase
        .from("sch_transport_settings")
        .select("enabled")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
    ]);

    if (buRes.error && !isSchoolEmptyRead(buRes.error) && profileRes.error && !isSchoolEmptyRead(profileRes.error)) {
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
    if (currentYearsRes.error && !isSchoolEmptyRead(currentYearsRes.error)) academicYear = { status: "error" };
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
      if (termsRes.error && !isSchoolEmptyRead(termsRes.error)) currentTerm = { status: "error" };
      else if ((termsRes.data ?? []).length === 1) {
        currentTerm = { status: "ok", name: String(termsRes.data![0].name) };
      } else if ((termsRes.data ?? []).length > 1) currentTerm = { status: "multiple" };
      else currentTerm = { status: "none" };
    }

    const classLevels: OverviewMetric<number> =
      classCountRes.error && !isSchoolEmptyRead(classCountRes.error)
        ? { status: "error" }
        : { status: "ok", value: classCountRes.count ?? 0 };

    const grading: ConfigStatus =
      gradingRes.error && !isSchoolEmptyRead(gradingRes.error)
        ? "error"
        : configFromRow(Boolean(gradingRes.data?.id), "presence");
    const attendanceRules: ConfigStatus =
      attendanceRes.error && !isSchoolEmptyRead(attendanceRes.error)
        ? "error"
        : configFromRow(Boolean(attendanceRes.data), "presence");
    const feeStructure: ConfigStatus =
      feeCountRes.error && !isSchoolEmptyRead(feeCountRes.error)
        ? "error"
        : configFromRow((feeCountRes.count ?? 0) > 0, "presence");
    const transport: ConfigStatus =
      transportRes.error && !isSchoolEmptyRead(transportRes.error)
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
        students: unavailable(),
        teachers: unavailable(),
        attendance: unavailable(),
        feesCollected: unavailable(),
        outstandingFees: unavailable(),
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
