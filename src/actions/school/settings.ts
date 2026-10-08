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
  requireAnySchoolPermission,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { applyActiveFilter, schoolPageMeta, schoolPageRange, type SchoolListFilter } from "@/lib/school/pagination";
import { invalidateSchoolStructureCatalog } from "@/lib/school/structure-catalog";

const VIEW = "school.settings.view";
const MANAGE = "school.settings.manage";
const FEES_VIEW = "school.fees.view";
const FEES_MANAGE = "school.fees.manage";

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

export type FeeAssignmentRow = {
  id: string;
  feeCategoryId: string;
  feeName: string;
  classId: string;
  className: string;
  levelId: string;
  levelName: string;
  academicYearId: string;
  academicYearName: string;
  termId: string | null;
  termName: string | null;
  amount: string;
  frequency: FeeCategoryRow["frequency"];
  isActive: boolean;
};

export type FeeStructureTermInput = { termId: string; amount: string };

export type FeeStructureRow = {
  id: string;
  academicYearId: string;
  academicYearName: string;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  annualAmount: string;
  termCount: number;
  terms: Array<{ termId: string; termName: string; amount: string }>;
  isActive: boolean;
};

export type SchoolOption = { id: string; name: string };

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

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  return hasPerm(user, MANAGE);
}

function canManageFees(user: Awaited<ReturnType<typeof requireAuth>>) {
  return hasPerm(user, FEES_MANAGE) || hasPerm(user, MANAGE);
}

function canViewFees(user: Awaited<ReturnType<typeof requireAuth>>) {
  return hasPerm(user, FEES_VIEW) || hasPerm(user, FEES_MANAGE) || hasPerm(user, VIEW) || hasPerm(user, MANAGE);
}

async function requireFeeView() {
  return requireAnySchoolPermission([FEES_VIEW, FEES_MANAGE, VIEW, MANAGE]);
}

async function requireFeeManage() {
  return requireAnySchoolPermission([FEES_MANAGE, MANAGE]);
}

function asFrequency(value: unknown): FeeCategoryRow["frequency"] {
  const next = String(value ?? "").toUpperCase();
  if (next === "TERM" || next === "YEAR" || next === "MONTH" || next === "ONCE" || next === "OTHER") return next;
  return "OTHER";
}

async function hydrateFeeAssignments(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  rows: Record<string, unknown>[],
): Promise<FeeAssignmentRow[]> {
  if (!rows.length) return [];
  const classIds = [...new Set(rows.map((row) => String(row.class_id)))];
  const categoryIds = [...new Set(rows.map((row) => String(row.fee_category_id)))];
  const yearIds = [...new Set(rows.map((row) => String(row.academic_year_id)))];
  const termIds = [...new Set(rows.map((row) => row.term_id).filter(Boolean).map(String))];
  const [classesRes, categoriesRes, yearsHydrate, termsHydrate] = await Promise.all([
    supabase.from("sch_classes").select("id, name, level_id").eq("business_unit_id", businessUnitId).in("id", classIds),
    supabase.from("sch_fee_categories").select("id, name").eq("business_unit_id", businessUnitId).in("id", categoryIds),
    supabase.from("sch_academic_years").select("id, name").eq("business_unit_id", businessUnitId).in("id", yearIds),
    termIds.length
      ? supabase.from("sch_terms").select("id, name").eq("business_unit_id", businessUnitId).in("id", termIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
  ]);
  const classMap = new Map((classesRes.data ?? []).map((row) => [String(row.id), row]));
  const levelIds = [...new Set((classesRes.data ?? []).map((row) => String(row.level_id)))];
  const levelsRes = levelIds.length
    ? await supabase.from("sch_class_levels").select("id, name").eq("business_unit_id", businessUnitId).in("id", levelIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const levelMap = new Map((levelsRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const feeMap = new Map((categoriesRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const yearMap = new Map((yearsHydrate.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const termMap = new Map((termsHydrate.data ?? []).map((row) => [String(row.id), String(row.name)]));
  return rows.map((row) => {
    const classRow = classMap.get(String(row.class_id));
    const levelId = classRow ? String(classRow.level_id) : "";
    return {
      id: String(row.id),
      feeCategoryId: String(row.fee_category_id),
      feeName: feeMap.get(String(row.fee_category_id)) ?? "Fee",
      classId: String(row.class_id),
      className: classRow ? String(classRow.name) : "Class",
      levelId,
      levelName: levelMap.get(levelId) ?? "Level",
      academicYearId: String(row.academic_year_id),
      academicYearName: yearMap.get(String(row.academic_year_id)) ?? "Year",
      termId: row.term_id ? String(row.term_id) : null,
      termName: row.term_id ? termMap.get(String(row.term_id)) ?? "Term" : null,
      amount: String(row.amount),
      frequency: asFrequency(row.frequency),
      isActive: Boolean(row.is_active),
    };
  });
}

async function hydrateFeeStructures(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  rows: Record<string, unknown>[],
): Promise<FeeStructureRow[]> {
  if (!rows.length) return [];
  const classIds = [...new Set(rows.map((row) => String(row.class_id)))];
  const levelIds = [...new Set(rows.map((row) => String(row.level_id)))];
  const yearIds = [...new Set(rows.map((row) => String(row.academic_year_id)))];
  const structureIds = rows.map((row) => String(row.id));
  const [classesRes, levelsRes, yearsHydrate, termsHydrate] = await Promise.all([
    supabase.from("sch_classes").select("id, name").eq("business_unit_id", businessUnitId).in("id", classIds),
    supabase.from("sch_class_levels").select("id, name").eq("business_unit_id", businessUnitId).in("id", levelIds),
    supabase.from("sch_academic_years").select("id, name").eq("business_unit_id", businessUnitId).in("id", yearIds),
    supabase
      .from("sch_fee_structure_terms")
      .select("fee_structure_id, term_id, amount")
      .eq("business_unit_id", businessUnitId)
      .in("fee_structure_id", structureIds),
  ]);
  const termIds = [...new Set((termsHydrate.data ?? []).map((row) => String(row.term_id)))];
  const termNamesRes = termIds.length
    ? await supabase.from("sch_terms").select("id, name").eq("business_unit_id", businessUnitId).in("id", termIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const classMap = new Map((classesRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const levelMap = new Map((levelsRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const yearMap = new Map((yearsHydrate.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const termNameMap = new Map((termNamesRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const termsByStructure = new Map<string, Array<{ termId: string; termName: string; amount: string }>>();
  for (const row of termsHydrate.data ?? []) {
    const structureId = String(row.fee_structure_id);
    const list = termsByStructure.get(structureId) ?? [];
    list.push({
      termId: String(row.term_id),
      termName: termNameMap.get(String(row.term_id)) ?? "Term",
      amount: String(row.amount),
    });
    termsByStructure.set(structureId, list);
  }
  return rows.map((row) => {
    const terms = termsByStructure.get(String(row.id)) ?? [];
    return {
      id: String(row.id),
      academicYearId: String(row.academic_year_id),
      academicYearName: yearMap.get(String(row.academic_year_id)) ?? "Year",
      levelId: String(row.level_id),
      levelName: levelMap.get(String(row.level_id)) ?? "Level",
      classId: String(row.class_id),
      className: classMap.get(String(row.class_id)) ?? "Class",
      annualAmount: String(row.annual_amount),
      termCount: terms.length,
      terms,
      isActive: Boolean(row.is_active),
    };
  });
}

export async function getSchoolSettingsWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, FEES_VIEW, FEES_MANAGE]);
    const [
      buRes,
      profileRes,
      yearsRes,
      termsRes,
      scalesRes,
      bandsRes,
      structuresRes,
      attendanceRes,
      statusesRes,
      transportRes,
      levelOptionsRes,
      yearOptionsRes,
    ] = await Promise.all([
      supabase.from("business_units").select("name, location").eq("id", businessUnitId).maybeSingle(),
      supabase.from("sch_school_profiles").select("*").eq("business_unit_id", businessUnitId).maybeSingle(),
      supabase
        .from("sch_academic_years")
        .select("id, name, start_date, end_date, is_current, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("start_date", { ascending: false })
        .range(0, 19),
      supabase
        .from("sch_terms")
        .select("id, academic_year_id, name, sort_order, start_date, end_date, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("sort_order")
        .range(0, 19),
      supabase
        .from("sch_grading_scales")
        .select("id, name, is_current, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .maybeSingle(),
      supabase
        .from("sch_grading_bands")
        .select("id, scale_id, grade, min_mark, max_mark, remark, sort_order, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("sort_order")
        .range(0, 19),
      supabase
        .from("sch_fee_structures")
        .select("id, academic_year_id, level_id, class_id, annual_amount, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("created_at", { ascending: false })
        .range(0, 19),
      supabase
        .from("sch_attendance_settings")
        .select("school_start, school_end, late_threshold_minutes")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
      supabase
        .from("sch_attendance_statuses")
        .select("id, code, name, counts_as_present, sort_order, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("sort_order")
        .range(0, 19),
      supabase
        .from("sch_transport_settings")
        .select("enabled, pickup_dropoff_enabled")
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
      supabase
        .from("sch_class_levels")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("sch_academic_years")
        .select("id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("start_date", { ascending: false }),
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
    const structureRows =
      structuresRes.error && !isSchoolUnconfiguredRead(structuresRes.error)
        ? mapSchoolDbError(structuresRes.error, "load")
        : (structuresRes.data ?? []);
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

    const feeStructures = await hydrateFeeStructures(
      supabase,
      businessUnitId,
      structureRows as Record<string, unknown>[],
    );
    const yearOptions =
      yearOptionsRes.error && !isSchoolUnconfiguredRead(yearOptionsRes.error)
        ? []
        : (yearOptionsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
    const levelOptions =
      levelOptionsRes.error && !isSchoolUnconfiguredRead(levelOptionsRes.error)
        ? []
        : (levelOptionsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));

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
      fees: [] as FeeCategoryRow[],
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
      feeStructures,
      levelOptions,
      yearOptions,
      pages: {
        years: schoolPageMeta(1, yearsRes.count ?? yearsRows.length),
        terms: schoolPageMeta(1, termsRes.count ?? termsRows.length),
        bands: schoolPageMeta(1, bandsRes.count ?? bandRows.length),
        fees: schoolPageMeta(1, 0),
        statuses: schoolPageMeta(1, statusesRes.count ?? statusRows.length),
        structures: schoolPageMeta(1, structuresRes.count ?? structureRows.length),
      },
      capabilities: {
        canView: true,
        canViewSettings: hasPerm(user, VIEW) || hasPerm(user, MANAGE),
        canManage: canManage(user),
        canViewFees: canViewFees(user),
        canManageFees: canManageFees(user),
      },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type SchoolSettingsWorkspaceResult = Awaited<ReturnType<typeof getSchoolSettingsWorkspaceAction>>;

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
    invalidateSchoolStructureCatalog();
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
    invalidateSchoolStructureCatalog();
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

export async function listSchoolSettingsAction(input: {
  kind: "years" | "terms" | "bands" | "fees" | "statuses" | "structures";
  page?: number;
  status?: SchoolListFilter;
  academicYearId?: string;
  levelId?: string;
  classId?: string;
}) {
  try {
    const { supabase, businessUnitId } =
      input.kind === "structures" ? await requireFeeView() : await requireSchoolPermission(VIEW);
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const status = input.status ?? "all";
    if (input.kind === "structures") {
      let query = supabase
        .from("sch_fee_structures")
        .select("id, academic_year_id, level_id, class_id, annual_amount, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("created_at", { ascending: false });
      query = applyActiveFilter(query, status);
      if (str(input.academicYearId)) query = query.eq("academic_year_id", str(input.academicYearId));
      if (str(input.levelId)) query = query.eq("level_id", str(input.levelId));
      if (str(input.classId)) query = query.eq("class_id", str(input.classId));
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      return {
        ok: true as const,
        structures: await hydrateFeeStructures(supabase, businessUnitId, (result.data ?? []) as Record<string, unknown>[]),
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
      };
    }
    if (input.kind === "years") {
      let query = supabase
        .from("sch_academic_years")
        .select("id, name, start_date, end_date, is_current, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("start_date", { ascending: false });
      query = applyActiveFilter(query, status);
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      return {
        ok: true as const,
        years: (result.data ?? []).map((row) => ({
          id: String(row.id),
          name: String(row.name),
          startDate: String(row.start_date),
          endDate: String(row.end_date),
          isCurrent: Boolean(row.is_current),
          isActive: Boolean(row.is_active),
        })),
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
      };
    }
    if (input.kind === "terms") {
      let query = supabase
        .from("sch_terms")
        .select("id, academic_year_id, name, sort_order, start_date, end_date, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("sort_order");
      query = applyActiveFilter(query, status);
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      return {
        ok: true as const,
        terms: (result.data ?? []).map((row) => ({
          id: String(row.id),
          academicYearId: String(row.academic_year_id),
          name: String(row.name),
          sortOrder: Number(row.sort_order),
          startDate: String(row.start_date),
          endDate: String(row.end_date),
          isActive: Boolean(row.is_active),
        })),
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
      };
    }
    if (input.kind === "bands") {
      let query = supabase
        .from("sch_grading_bands")
        .select("id, scale_id, grade, min_mark, max_mark, remark, sort_order, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("sort_order");
      query = applyActiveFilter(query, status);
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      return {
        ok: true as const,
        gradingBands: (result.data ?? []).map((row) => ({
          id: String(row.id),
          scaleId: String(row.scale_id),
          grade: String(row.grade),
          minMark: Number(row.min_mark),
          maxMark: Number(row.max_mark),
          remark: String(row.remark ?? ""),
          sortOrder: Number(row.sort_order),
          isActive: Boolean(row.is_active),
        })),
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
      };
    }
    if (input.kind === "fees") {
      let query = supabase
        .from("sch_fee_categories")
        .select("id, name, code, amount, frequency, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("name");
      query = applyActiveFilter(query, status);
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      return {
        ok: true as const,
        fees: (result.data ?? []).map((row) => ({
          id: String(row.id),
          name: String(row.name),
          code: String(row.code),
          amount: row.amount == null ? null : String(row.amount),
          frequency: asFrequency(row.frequency),
          isActive: Boolean(row.is_active),
        })),
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
      };
    }
    let query = supabase
      .from("sch_attendance_statuses")
      .select("id, code, name, counts_as_present, sort_order, is_active", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("sort_order");
    query = applyActiveFilter(query, status);
    const result = await query.range(from, to);
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      attendanceStatuses: (result.data ?? []).map((row) => ({
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        countsAsPresent: Boolean(row.counts_as_present),
        sortOrder: Number(row.sort_order),
        isActive: Boolean(row.is_active),
      })),
      page: schoolPageMeta(page, result.count ?? 0, pageSize),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveFeeAssignmentAction(input: {
  id?: string;
  feeCategoryId: string;
  levelId: string;
  classId: string;
  academicYearId: string;
  termId?: string | null;
  amount: string;
  frequency: FeeCategoryRow["frequency"];
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const amount = amountValue(input.amount);
    if (amount == null) throw new SchoolError("Amount is required.", "VALIDATION");
    const classId = str(input.classId);
    const levelId = str(input.levelId);
    const feeCategoryId = str(input.feeCategoryId);
    const academicYearId = str(input.academicYearId);
    const termId = str(input.termId) || null;
    if (!feeCategoryId) throw new SchoolError("Fee category is required.", "VALIDATION");
    if (!levelId) throw new SchoolError("Level is required.", "VALIDATION");
    if (!classId) throw new SchoolError("Class is required.", "VALIDATION");
    if (!academicYearId) throw new SchoolError("Academic year is required.", "VALIDATION");
    const classRes = await supabase
      .from("sch_classes")
      .select("id, level_id")
      .eq("id", classId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (classRes.error && !isSchoolUnconfiguredRead(classRes.error)) mapSchoolDbError(classRes.error);
    if (!classRes.data || String(classRes.data.level_id) !== levelId) {
      throw new SchoolError("That class does not belong to the selected level.", "VALIDATION");
    }
    if (termId) {
      const termRes = await supabase
        .from("sch_terms")
        .select("id, academic_year_id")
        .eq("id", termId)
        .eq("business_unit_id", businessUnitId)
        .maybeSingle();
      if (termRes.error && !isSchoolUnconfiguredRead(termRes.error)) mapSchoolDbError(termRes.error);
      if (!termRes.data || String(termRes.data.academic_year_id) !== academicYearId) {
        throw new SchoolError("That term does not belong to the selected academic year.", "VALIDATION");
      }
    }
    const row = {
      business_unit_id: businessUnitId,
      fee_category_id: feeCategoryId,
      class_id: classId,
      academic_year_id: academicYearId,
      term_id: termId,
      amount,
      frequency: frequencyValue(input.frequency),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase
          .from("sch_fee_assignments")
          .update(row)
          .eq("id", input.id)
          .eq("business_unit_id", businessUnitId)
          .select("id, fee_category_id, class_id, academic_year_id, term_id, amount, frequency, is_active")
          .maybeSingle()
      : await supabase
          .from("sch_fee_assignments")
          .insert(row)
          .select("id, fee_category_id, class_id, academic_year_id, term_id, amount, frequency, is_active")
          .maybeSingle();
    if (result.error?.code === "23505") throw new SchoolError("This fee structure already exists for this class.", "CONFLICT");
    if (result.error) mapSchoolDbError(result.error);
    if (!result.data) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    const [hydrated] = await hydrateFeeAssignments(supabase, businessUnitId, [result.data as Record<string, unknown>]);
    if (!hydrated) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    await audit({
      action: input.id ? "school.fee_structure_updated" : "school.fee_structure_created",
      description: input.id
        ? `Fee structure updated · ${hydrated.feeName} · ${hydrated.className}`
        : `Fee structure created · ${hydrated.feeName} · ${hydrated.className}`,
      entityType: "sch_fee_assignments",
      entityId: String(result.data.id),
      businessUnitId,
    });
    return { ok: true as const, assignment: hydrated };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveFeeAssignmentAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const existing = await supabase
      .from("sch_fee_assignments")
      .select("id")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (existing.error && !isSchoolUnconfiguredRead(existing.error)) mapSchoolDbError(existing.error);
    if (!existing.data) throw new SchoolError("Fee structure was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_fee_assignments")
      .update({ is_active: false })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: "school.fee_structure_archived",
      description: "Fee structure archived",
      entityType: "sch_fee_assignments",
      entityId: id,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listFeeStructureClassesAction(levelId: string) {
  try {
    const { supabase, businessUnitId } = await requireFeeView();
    const id = str(levelId);
    if (!id) return { ok: true as const, classes: [] as Array<{ id: string; name: string }> };
    const result = await supabase
      .from("sch_classes")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("level_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      classes: (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listSchoolTermsForYearAction(academicYearId: string) {
  try {
    const { supabase, businessUnitId } = await requireFeeView();
    const yearId = str(academicYearId);
    if (!yearId) return { ok: true as const, terms: [] as TermRow[] };
    const result = await supabase
      .from("sch_terms")
      .select("id, academic_year_id, name, sort_order, start_date, end_date, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("academic_year_id", yearId)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      terms: (result.data ?? []).map((row) => ({
        id: String(row.id),
        academicYearId: String(row.academic_year_id),
        name: String(row.name),
        sortOrder: Number(row.sort_order),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        isActive: Boolean(row.is_active),
      })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveFeeStructureAction(input: {
  id?: string;
  academicYearId: string;
  levelId: string;
  classId: string;
  annualAmount: string;
  termAmounts: FeeStructureTermInput[];
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireFeeManage();
    const annualAmount = amountValue(input.annualAmount);
    if (annualAmount == null) throw new SchoolError("Annual fee is required.", "VALIDATION");
    if (!Number.isFinite(annualAmount) || annualAmount < 0) {
      throw new SchoolError("Enter a valid annual fee.", "VALIDATION");
    }
    const academicYearId = str(input.academicYearId);
    const levelId = str(input.levelId);
    const classId = str(input.classId);
    if (!academicYearId) throw new SchoolError("Academic year is required.", "VALIDATION");
    if (!levelId) throw new SchoolError("Level is required.", "VALIDATION");
    if (!classId) throw new SchoolError("Class is required.", "VALIDATION");
    const classRes = await supabase
      .from("sch_classes")
      .select("id, level_id")
      .eq("id", classId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (classRes.error && !isSchoolUnconfiguredRead(classRes.error)) mapSchoolDbError(classRes.error);
    if (!classRes.data || String(classRes.data.level_id) !== levelId) {
      throw new SchoolError("That class does not belong to the selected level.", "VALIDATION");
    }
    const yearRes = await supabase
      .from("sch_academic_years")
      .select("id")
      .eq("id", academicYearId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (!yearRes.data) throw new SchoolError("Academic year was not found.", "VALIDATION");

    const parsedTerms: Array<{ termId: string; amount: number }> = [];
    for (const row of input.termAmounts) {
      const termId = str(row.termId);
      const raw = str(row.amount);
      if (!termId || !raw) continue;
      const amount = amountValue(raw);
      if (amount == null) continue;
      parsedTerms.push({ termId, amount });
    }
    if (parsedTerms.length) {
      const termsRes = await supabase
        .from("sch_terms")
        .select("id, academic_year_id")
        .eq("business_unit_id", businessUnitId)
        .eq("academic_year_id", academicYearId)
        .in("id", parsedTerms.map((row) => row.termId));
      if (termsRes.error && !isSchoolUnconfiguredRead(termsRes.error)) mapSchoolDbError(termsRes.error);
      const valid = new Set((termsRes.data ?? []).map((row) => String(row.id)));
      if (parsedTerms.some((row) => !valid.has(row.termId))) {
        throw new SchoolError("A term fee does not belong to the selected academic year.", "VALIDATION");
      }
    }

    const payload = {
      business_unit_id: businessUnitId,
      academic_year_id: academicYearId,
      level_id: levelId,
      class_id: classId,
      annual_amount: annualAmount,
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase
          .from("sch_fee_structures")
          .update(payload)
          .eq("id", input.id)
          .eq("business_unit_id", businessUnitId)
          .select("id, academic_year_id, level_id, class_id, annual_amount, is_active")
          .maybeSingle()
      : await supabase
          .from("sch_fee_structures")
          .insert(payload)
          .select("id, academic_year_id, level_id, class_id, annual_amount, is_active")
          .maybeSingle();
    if (result.error?.code === "23505") {
      throw new SchoolError("An active fee structure already exists for this class and academic year.", "CONFLICT");
    }
    if (result.error) mapSchoolDbError(result.error);
    if (!result.data) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    const structureId = String(result.data.id);
    await supabase.from("sch_fee_structure_terms").delete().eq("fee_structure_id", structureId).eq("business_unit_id", businessUnitId);
    if (parsedTerms.length) {
      const insertTerms = await supabase.from("sch_fee_structure_terms").insert(
        parsedTerms.map((row) => ({
          business_unit_id: businessUnitId,
          fee_structure_id: structureId,
          term_id: row.termId,
          amount: row.amount,
        })),
      );
      if (insertTerms.error) mapSchoolDbError(insertTerms.error);
    }
    const [hydrated] = await hydrateFeeStructures(supabase, businessUnitId, [result.data as Record<string, unknown>]);
    if (!hydrated) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    await audit({
      action: input.id ? "school.fee_structure_updated" : "school.fee_structure_created",
      description: input.id
        ? `Fee structure updated · ${hydrated.levelName} · ${hydrated.className} · ${hydrated.academicYearName}`
        : `Fee structure created · ${hydrated.levelName} · ${hydrated.className} · ${hydrated.academicYearName}`,
      entityType: "sch_fee_structures",
      entityId: structureId,
      businessUnitId,
    });
    return { ok: true as const, structure: hydrated };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function setFeeStructureActiveAction(id: string, isActive: boolean) {
  try {
    const { supabase, businessUnitId } = await requireFeeManage();
    const existing = await supabase
      .from("sch_fee_structures")
      .select("id")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (existing.error && !isSchoolUnconfiguredRead(existing.error)) mapSchoolDbError(existing.error);
    if (!existing.data) throw new SchoolError("Fee structure was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_fee_structures")
      .update({ is_active: Boolean(isActive) })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .select("id, academic_year_id, level_id, class_id, annual_amount, is_active")
      .maybeSingle();
    if (result.error?.code === "23505") {
      throw new SchoolError("An active fee structure already exists for this class and academic year.", "CONFLICT");
    }
    if (result.error) mapSchoolDbError(result.error);
    const [hydrated] = result.data
      ? await hydrateFeeStructures(supabase, businessUnitId, [result.data as Record<string, unknown>])
      : [];
    await audit({
      action: isActive ? "school.fee_structure_updated" : "school.fee_structure_archived",
      description: isActive
        ? `Fee structure activated · ${hydrated?.levelName ?? ""} · ${hydrated?.className ?? ""} · ${hydrated?.academicYearName ?? ""}`.trim()
        : `Fee structure deactivated · ${hydrated?.levelName ?? ""} · ${hydrated?.className ?? ""} · ${hydrated?.academicYearName ?? ""}`.trim(),
      entityType: "sch_fee_structures",
      entityId: id,
      businessUnitId,
    });
    return { ok: true as const, structure: hydrated ?? null };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
