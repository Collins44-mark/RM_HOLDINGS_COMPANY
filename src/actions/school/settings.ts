"use server";

import { updateTag } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { BUSINESS_UNITS_CACHE_TAG } from "@/lib/data/business-units";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isSchoolEmptyRead,
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";

const VIEW = "school.settings.view";
const MANAGE = "school.settings.manage";

export type SchoolProfile = {
  name: string;
  shortName: string;
  schoolCode: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  principalName: string;
  logoUrl: string;
  isActive: boolean;
};

export type AcademicYearRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
};

export type TermRow = {
  id: string;
  academicYearId: string;
  name: string;
  sortOrder: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type GradingBandRow = {
  id: string;
  scaleId: string;
  grade: string;
  minMark: number;
  maxMark: number;
  remark: string;
  sortOrder: number;
  isActive: boolean;
};

export type FeeCategoryRow = {
  id: string;
  name: string;
  code: string;
  amount: string | null;
  frequency: "TERM" | "YEAR" | "MONTH" | "ONCE" | "OTHER";
  isActive: boolean;
};

export type AttendanceStatusRow = {
  id: string;
  code: string;
  name: string;
  countsAsPresent: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type AttendanceSettings = {
  schoolStart: string;
  schoolEnd: string;
  lateThresholdMinutes: number;
};

export type TransportSettings = {
  enabled: boolean;
  pickupDropoffEnabled: boolean;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function requiredName(value: unknown, label: string, max = 80) {
  const next = str(value);
  if (!next) throw new SchoolError(`${label} is required.`, "VALIDATION");
  if (next.length > max) throw new SchoolError(`${label} is too long.`, "VALIDATION");
  return next;
}

function dateOnly(value: unknown, label: string) {
  const next = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new SchoolError(`${label} is required.`, "VALIDATION");
  return next;
}

function assertStartBeforeEnd(start: string, end: string) {
  if (start >= end) throw new SchoolError("Start must be before end.", "VALIDATION");
}

function timeValue(value: unknown, label: string) {
  const next = str(value);
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(next)) throw new SchoolError(`${label} is invalid.`, "VALIDATION");
  return next.length === 5 ? `${next}:00` : next;
}

function markValue(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SchoolError(`${label} is invalid.`, "VALIDATION");
  return Math.round(n * 100) / 100;
}

function amountValue(value: unknown) {
  const raw = str(value);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new SchoolError("Amount cannot be negative.", "VALIDATION");
  return n;
}

function sortValue(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new SchoolError("Order must be 1 or greater.", "VALIDATION");
  return n;
}

function frequencyValue(value: unknown): FeeCategoryRow["frequency"] {
  const next = str(value).toUpperCase();
  if (next === "TERM" || next === "YEAR" || next === "MONTH" || next === "ONCE" || next === "OTHER") return next;
  throw new SchoolError("Choose a valid fee frequency.", "VALIDATION");
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

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

export async function getSchoolSettingsWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const [
      buRes,
      profileRes,
      yearsRes,
      termsRes,
      scalesRes,
      bandsRes,
      feesRes,
      attendanceRes,
      statusesRes,
      transportRes,
    ] = await Promise.all([
      supabase.from("business_units").select("name, location").eq("id", businessUnitId).maybeSingle(),
      supabase.from("sch_school_profiles").select("*").eq("business_unit_id", businessUnitId).maybeSingle(),
      supabase
        .from("sch_academic_years")
        .select("id, name, start_date, end_date, is_current, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("start_date", { ascending: false }),
      supabase
        .from("sch_terms")
        .select("id, academic_year_id, name, sort_order, start_date, end_date, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order"),
      supabase
        .from("sch_grading_scales")
        .select("id, name, is_current, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .maybeSingle(),
      supabase
        .from("sch_grading_bands")
        .select("id, scale_id, grade, min_mark, max_mark, remark, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order"),
      supabase
        .from("sch_fee_categories")
        .select("id, name, code, amount, frequency, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sch_attendance_settings")
        .select("school_start, school_end, late_threshold_minutes")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
      supabase
        .from("sch_attendance_statuses")
        .select("id, code, name, counts_as_present, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order"),
      supabase
        .from("sch_transport_settings")
        .select("enabled, pickup_dropoff_enabled")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
    ]);

    const buErr = buRes.error && !isSchoolUnconfiguredRead(buRes.error) ? buRes.error : null;
    if (buErr) mapSchoolDbError(buErr, "load");

    const profileRow =
      profileRes.error && !isSchoolUnconfiguredRead(profileRes.error)
        ? mapSchoolDbError(profileRes.error, "load")
        : profileRes.data;
    const yearsRows =
      yearsRes.error && !isSchoolUnconfiguredRead(yearsRes.error) ? mapSchoolDbError(yearsRes.error, "load") : (yearsRes.data ?? []);
    const termsRows =
      termsRes.error && !isSchoolUnconfiguredRead(termsRes.error) ? mapSchoolDbError(termsRes.error, "load") : (termsRes.data ?? []);
    const scaleRow =
      scalesRes.error && !isSchoolUnconfiguredRead(scalesRes.error) ? mapSchoolDbError(scalesRes.error, "load") : scalesRes.data;
    const bandRows =
      bandsRes.error && !isSchoolUnconfiguredRead(bandsRes.error) ? mapSchoolDbError(bandsRes.error, "load") : (bandsRes.data ?? []);
    const feeRows =
      feesRes.error && !isSchoolUnconfiguredRead(feesRes.error) ? mapSchoolDbError(feesRes.error, "load") : (feesRes.data ?? []);
    const attendanceRow =
      attendanceRes.error && !isSchoolUnconfiguredRead(attendanceRes.error)
        ? mapSchoolDbError(attendanceRes.error, "load")
        : attendanceRes.data;
    const statusRows =
      statusesRes.error && !isSchoolUnconfiguredRead(statusesRes.error)
        ? mapSchoolDbError(statusesRes.error, "load")
        : (statusesRes.data ?? []);
    const transportRow =
      transportRes.error && !isSchoolUnconfiguredRead(transportRes.error)
        ? mapSchoolDbError(transportRes.error, "load")
        : transportRes.data;

    const buName = str(buRes.data?.name) || "School Management";
    const buCity = str(buRes.data?.location);
    const profile: SchoolProfile = {
      name: str(profileRow?.name) || buName,
      shortName: str(profileRow?.short_name),
      schoolCode: str(profileRow?.school_code),
      address: str(profileRow?.address),
      city: str(profileRow?.city) || buCity,
      phone: str(profileRow?.phone),
      email: str(profileRow?.email),
      website: str(profileRow?.website),
      principalName: str(profileRow?.principal_name),
      logoUrl: str(profileRow?.logo_url),
      isActive: profileRow ? Boolean(profileRow.is_active) : true,
    };

    return {
      ok: true as const,
      profileSaved: Boolean(profileRow),
      profile,
      years: yearsRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        isCurrent: Boolean(row.is_current),
        isActive: Boolean(row.is_active),
      })),
      terms: termsRows.map((row) => ({
        id: String(row.id),
        academicYearId: String(row.academic_year_id),
        name: String(row.name),
        sortOrder: Number(row.sort_order),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        isActive: Boolean(row.is_active),
      })),
      gradingScaleId: scaleRow?.id ? String(scaleRow.id) : null,
      gradingBands: bandRows.map((row) => ({
        id: String(row.id),
        scaleId: String(row.scale_id),
        grade: String(row.grade),
        minMark: Number(row.min_mark),
        maxMark: Number(row.max_mark),
        remark: String(row.remark ?? ""),
        sortOrder: Number(row.sort_order),
        isActive: Boolean(row.is_active),
      })),
      fees: feeRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        amount: row.amount == null ? null : String(row.amount),
        frequency: (["TERM", "YEAR", "MONTH", "ONCE", "OTHER"].includes(String(row.frequency))
          ? (row.frequency as FeeCategoryRow["frequency"])
          : "OTHER"),
        isActive: Boolean(row.is_active),
      })),
      attendance: attendanceRow
        ? {
            schoolStart: String(attendanceRow.school_start).slice(0, 5),
            schoolEnd: String(attendanceRow.school_end).slice(0, 5),
            lateThresholdMinutes: Number(attendanceRow.late_threshold_minutes),
          }
        : { schoolStart: "", schoolEnd: "", lateThresholdMinutes: 0 },
      attendanceSaved: Boolean(attendanceRow),
      attendanceStatuses: statusRows.map((row) => ({
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        countsAsPresent: Boolean(row.counts_as_present),
        sortOrder: Number(row.sort_order),
        isActive: Boolean(row.is_active),
      })),
      transport: transportRow
        ? {
            enabled: Boolean(transportRow.enabled),
            pickupDropoffEnabled: Boolean(transportRow.pickup_dropoff_enabled),
          }
        : { enabled: false, pickupDropoffEnabled: false },
      transportSaved: Boolean(transportRow),
      capabilities: {
        canView: true,
        canManage: canManage(user),
      },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolProfileAction(input: SchoolProfile) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = requiredName(input.name, "School name", 160);
    const email = str(input.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new SchoolError("Enter a valid email address.", "VALIDATION");
    }
    const payload = {
      business_unit_id: businessUnitId,
      name,
      short_name: str(input.shortName).slice(0, 80),
      school_code: str(input.schoolCode).slice(0, 40),
      address: str(input.address).slice(0, 240),
      city: str(input.city).slice(0, 120),
      phone: str(input.phone).slice(0, 40),
      email: email.slice(0, 160),
      website: str(input.website).slice(0, 160),
      principal_name: str(input.principalName).slice(0, 120),
      logo_url: str(input.logoUrl).slice(0, 240),
      is_active: Boolean(input.isActive),
    };
    const { error } = await supabase.from("sch_school_profiles").upsert(payload, { onConflict: "business_unit_id" });
    if (error) mapSchoolDbError(error);

    const admin = createSupabaseAdminClient();
    if (admin) {
      await admin
        .from("business_units")
        .update({ name, location: payload.city || null })
        .eq("id", businessUnitId)
        .eq("code", "school");
      updateTag(BUSINESS_UNITS_CACHE_TAG);
    }

    await audit({
      action: "school.profile_updated",
      description: "School information updated",
      entityType: "sch_school_profiles",
      entityId: businessUnitId,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveAcademicYearAction(input: {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = requiredName(input.name, "Academic year");
    const startDate = dateOnly(input.startDate, "Start date");
    const endDate = dateOnly(input.endDate, "End date");
    assertStartBeforeEnd(startDate, endDate);
    const row = {
      business_unit_id: businessUnitId,
      name,
      start_date: startDate,
      end_date: endDate,
      is_current: Boolean(input.isCurrent),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_academic_years").update(row).eq("id", input.id).eq("business_unit_id", businessUnitId)
      : await supabase.from("sch_academic_years").insert(row);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: input.id ? "school.academic_year_updated" : "school.academic_year_created",
      description: input.id ? `Academic year updated · ${name}` : `Academic year created · ${name}`,
      entityType: "sch_academic_years",
      entityId: input.id ?? null,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveTermAction(input: {
  id?: string;
  academicYearId: string;
  name: string;
  sortOrder: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = requiredName(input.name, "Term");
    const startDate = dateOnly(input.startDate, "Start date");
    const endDate = dateOnly(input.endDate, "End date");
    assertStartBeforeEnd(startDate, endDate);
    const yearRes = await supabase
      .from("sch_academic_years")
      .select("id, start_date, end_date")
      .eq("id", input.academicYearId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (yearRes.error && !isSchoolEmptyRead(yearRes.error)) mapSchoolDbError(yearRes.error);
    if (!yearRes.data) throw new SchoolError("Select an academic year.", "VALIDATION");
    if (startDate < String(yearRes.data.start_date) || endDate > String(yearRes.data.end_date)) {
      throw new SchoolError("Term dates must fall within the academic year.", "VALIDATION");
    }
    const row = {
      business_unit_id: businessUnitId,
      academic_year_id: input.academicYearId,
      name,
      sort_order: sortValue(input.sortOrder),
      start_date: startDate,
      end_date: endDate,
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_terms").update(row).eq("id", input.id).eq("business_unit_id", businessUnitId)
      : await supabase.from("sch_terms").insert(row);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: input.id ? "school.term_updated" : "school.term_created",
      description: input.id ? `Term updated · ${name}` : `Term created · ${name}`,
      entityType: "sch_terms",
      entityId: input.id ?? null,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

async function ensureCurrentScale(supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"], businessUnitId: string) {
  const existing = await supabase
    .from("sch_grading_scales")
    .select("id")
    .eq("business_unit_id", businessUnitId)
    .eq("is_current", true)
    .maybeSingle();
  if (existing.error && !isSchoolEmptyRead(existing.error)) mapSchoolDbError(existing.error);
  if (existing.data?.id) return String(existing.data.id);
  const created = await supabase
    .from("sch_grading_scales")
    .insert({ business_unit_id: businessUnitId, name: "Default", is_current: true, is_active: true })
    .select("id")
    .single();
  if (created.error) mapSchoolDbError(created.error);
  return String(created.data.id);
}

export async function saveGradingBandAction(input: {
  id?: string;
  grade: string;
  minMark: number;
  maxMark: number;
  remark: string;
  sortOrder: number;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const grade = requiredName(input.grade, "Grade", 20);
    const minMark = markValue(input.minMark, "Minimum mark");
    const maxMark = markValue(input.maxMark, "Maximum mark");
    if (minMark > maxMark) throw new SchoolError("Minimum mark cannot exceed maximum mark.", "VALIDATION");
    const scaleId = await ensureCurrentScale(supabase, businessUnitId);
    const others = await supabase
      .from("sch_grading_bands")
      .select("id, min_mark, max_mark")
      .eq("scale_id", scaleId)
      .eq("is_active", true);
    if (others.error) mapSchoolDbError(others.error);
    for (const row of others.data ?? []) {
      if (input.id && String(row.id) === input.id) continue;
      const otherMin = Number(row.min_mark);
      const otherMax = Number(row.max_mark);
      if (minMark <= otherMax && otherMin <= maxMark) {
        throw new SchoolError("Grading ranges cannot overlap.", "VALIDATION");
      }
    }
    const row = {
      business_unit_id: businessUnitId,
      scale_id: scaleId,
      grade,
      min_mark: minMark,
      max_mark: maxMark,
      remark: str(input.remark).slice(0, 120),
      sort_order: sortValue(input.sortOrder),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_grading_bands").update(row).eq("id", input.id).eq("business_unit_id", businessUnitId)
      : await supabase.from("sch_grading_bands").insert(row);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: input.id ? "school.grading_updated" : "school.grading_created",
      description: input.id ? `Grading rule updated · ${grade}` : `Grading rule created · ${grade}`,
      entityType: "sch_grading_bands",
      entityId: input.id ?? null,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveFeeCategoryAction(input: {
  id?: string;
  name: string;
  code: string;
  amount: string | null;
  frequency: FeeCategoryRow["frequency"];
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = requiredName(input.name, "Fee category");
    const code = requiredName(input.code, "Code", 40);
    const row = {
      business_unit_id: businessUnitId,
      name,
      code,
      amount: amountValue(input.amount),
      frequency: frequencyValue(input.frequency),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_fee_categories").update(row).eq("id", input.id).eq("business_unit_id", businessUnitId)
      : await supabase.from("sch_fee_categories").insert(row);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: input.id ? "school.fee_category_updated" : "school.fee_category_created",
      description: input.id ? `Fee category updated · ${name}` : `Fee category created · ${name}`,
      entityType: "sch_fee_categories",
      entityId: input.id ?? null,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveAttendanceSettingsAction(input: AttendanceSettings) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const schoolStart = timeValue(input.schoolStart, "School start time");
    const schoolEnd = timeValue(input.schoolEnd, "School end time");
    if (schoolStart >= schoolEnd) throw new SchoolError("School start must be before end.", "VALIDATION");
    const late = Number(input.lateThresholdMinutes);
    if (!Number.isInteger(late) || late < 0 || late > 180) {
      throw new SchoolError("Late threshold must be between 0 and 180 minutes.", "VALIDATION");
    }
    const { error } = await supabase.from("sch_attendance_settings").upsert({
      business_unit_id: businessUnitId,
      school_start: schoolStart,
      school_end: schoolEnd,
      late_threshold_minutes: late,
    });
    if (error) mapSchoolDbError(error);
    await audit({
      action: "school.attendance_settings_updated",
      description: "Attendance settings updated",
      entityType: "sch_attendance_settings",
      entityId: businessUnitId,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveAttendanceStatusAction(input: {
  id?: string;
  code: string;
  name: string;
  countsAsPresent: boolean;
  sortOrder: number;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const code = requiredName(input.code, "Code", 40).toUpperCase();
    const name = requiredName(input.name, "Status");
    const row = {
      business_unit_id: businessUnitId,
      code,
      name,
      counts_as_present: Boolean(input.countsAsPresent),
      sort_order: sortValue(input.sortOrder),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_attendance_statuses").update(row).eq("id", input.id).eq("business_unit_id", businessUnitId)
      : await supabase.from("sch_attendance_statuses").insert(row);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: input.id ? "school.attendance_status_updated" : "school.attendance_status_created",
      description: input.id ? `Attendance status updated · ${name}` : `Attendance status created · ${name}`,
      entityType: "sch_attendance_statuses",
      entityId: input.id ?? null,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveTransportSettingsAction(input: TransportSettings) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const { error } = await supabase.from("sch_transport_settings").upsert({
      business_unit_id: businessUnitId,
      enabled: Boolean(input.enabled),
      pickup_dropoff_enabled: Boolean(input.pickupDropoffEnabled),
    });
    if (error) mapSchoolDbError(error);
    await audit({
      action: "school.transport_settings_updated",
      description: "Transport settings updated",
      entityType: "sch_transport_settings",
      entityId: businessUnitId,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
