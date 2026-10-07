"use server";

import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";

const VIEW = "school.staff.view";
const MANAGE = "school.staff.manage";

export type StaffStatus = "active" | "inactive";
export type StaffTypeKind = "academic" | "administrative" | "support" | "transport";
export type AssignmentType = "CLASS_TEACHER" | "SUBJECT_TEACHER" | "LEVEL_HEAD" | "DEPARTMENT_HEAD";

export type StaffTypeRow = { id: string; name: string; code: string; kind: StaffTypeKind; isActive: boolean };
export type StaffPositionRow = {
  id: string;
  staffTypeId: string;
  name: string;
  code: string;
  allowsAcademicAssignments: boolean;
  isActive: boolean;
};
export type DepartmentRow = { id: string; name: string; code: string; isActive: boolean };
export type SubjectRow = { id: string; name: string; code: string; departmentId: string; isActive: boolean };
export type StaffOption = { id: string; name: string };

export type StaffListRow = {
  id: string;
  staffNumber: string;
  name: string;
  typeName: string;
  positionName: string;
  primaryAssignment: string;
  status: StaffStatus;
  allowsAcademicAssignments: boolean;
};

export type StaffAssignmentRow = {
  id: string;
  assignmentType: AssignmentType;
  academicYearName: string;
  levelName: string;
  className: string;
  streamName: string;
  subjectName: string;
  departmentName: string;
  isPrimary: boolean;
  isActive: boolean;
};

export type StaffProfile = {
  id: string;
  staffNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  staffTypeId: string;
  typeName: string;
  typeKind: StaffTypeKind;
  positionId: string;
  positionName: string;
  allowsAcademicAssignments: boolean;
  employmentStatus: StaffStatus;
  employmentDate: string;
  linkedUser: boolean;
  assignments: StaffAssignmentRow[];
};

export type StaffFormInput = {
  id?: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  staffTypeId: string;
  positionId: string;
  employmentStatus: StaffStatus;
  employmentDate: string;
};

export type StaffAssignmentInput = {
  staffId: string;
  assignmentType: AssignmentType;
  academicYearId: string;
  levelId: string;
  classId: string;
  streamId: string;
  subjectId: string;
  departmentId: string;
  replaceExisting?: boolean;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

function asKind(value: unknown): StaffTypeKind {
  const next = str(value);
  if (next === "academic" || next === "administrative" || next === "support" || next === "transport") return next;
  throw new SchoolError("Choose a valid staff type function.", "VALIDATION");
}

function readKind(value: unknown): StaffTypeKind {
  const next = str(value);
  if (next === "academic" || next === "administrative" || next === "support" || next === "transport") return next;
  return "support";
}

function readAssignmentType(value: unknown): AssignmentType | null {
  const next = str(value);
  if (next === "CLASS_TEACHER" || next === "SUBJECT_TEACHER" || next === "LEVEL_HEAD" || next === "DEPARTMENT_HEAD") return next;
  return null;
}

function asStatus(value: unknown): StaffStatus {
  return str(value) === "inactive" ? "inactive" : "active";
}

function asAssignmentType(value: unknown): AssignmentType {
  const next = str(value);
  if (next === "CLASS_TEACHER" || next === "SUBJECT_TEACHER" || next === "LEVEL_HEAD" || next === "DEPARTMENT_HEAD") return next;
  throw new SchoolError("Choose a valid assignment type.", "VALIDATION");
}

function genderValue(value: unknown) {
  const next = str(value).toLowerCase();
  if (!next) return null;
  if (next === "female" || next === "male" || next === "other") return next;
  throw new SchoolError("Choose a valid gender.", "VALIDATION");
}

function dateValue(value: unknown, label: string) {
  const next = str(value);
  if (!next) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new SchoolError(`${label} is invalid.`, "VALIDATION");
  return next;
}

function codeFromName(name: string) {
  const next = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (!next) throw new SchoolError("A code could not be generated.", "VALIDATION");
  return next;
}

function personName(first: string, middle: string, last: string) {
  return [first, middle, last].filter(Boolean).join(" ");
}

async function audit(input: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  businessUnitId: string;
}) {
  await writeAuditEvent({ ...input, module: "school", severity: "medium" });
}

function assignmentLabel(type: AssignmentType, parts: { level?: string; className?: string; stream?: string; subject?: string; department?: string }) {
  if (type === "CLASS_TEACHER") return ["Class Teacher", parts.level, parts.className, parts.stream].filter(Boolean).join(" · ");
  if (type === "SUBJECT_TEACHER") return ["Subject Teacher", parts.subject, parts.className, parts.stream].filter(Boolean).join(" · ");
  if (type === "LEVEL_HEAD") return ["Level Head", parts.level].filter(Boolean).join(" · ");
  return ["Department Head", parts.department].filter(Boolean).join(" · ");
}

export async function getStaffWorkspaceOptionsAction(mode: "view" | "manage" = "view") {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(mode === "manage" ? MANAGE : VIEW);
    const [typesRes, positionsRes, yearsRes, levelsRes, departmentsRes, subjectsRes] = await Promise.all([
      supabase.from("sch_staff_types").select("id, name, code, kind, is_active").eq("business_unit_id", businessUnitId).order("name"),
      supabase
        .from("sch_staff_positions")
        .select("id, staff_type_id, name, code, allows_academic_assignments, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
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
      supabase.from("sch_departments").select("id, name, code, is_active").eq("business_unit_id", businessUnitId).eq("is_active", true).order("name"),
      supabase.from("sch_subjects").select("id, name, code, department_id, is_active").eq("business_unit_id", businessUnitId).eq("is_active", true).order("name"),
    ]);
    if (typesRes.error && !isSchoolUnconfiguredRead(typesRes.error)) mapSchoolDbError(typesRes.error, "load");
    if (positionsRes.error && !isSchoolUnconfiguredRead(positionsRes.error)) mapSchoolDbError(positionsRes.error, "load");
    return {
      ok: true as const,
      types: (typesRes.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        kind: readKind(row.kind),
        isActive: Boolean(row.is_active),
      })),
      positions: (positionsRes.data ?? []).map((row) => ({
        id: String(row.id),
        staffTypeId: String(row.staff_type_id),
        name: String(row.name),
        code: String(row.code),
        allowsAcademicAssignments: Boolean(row.allows_academic_assignments),
        isActive: Boolean(row.is_active),
      })),
      years: (yearsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), isCurrent: Boolean(row.is_current) })),
      levels: (levelsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
      departments: (departmentsRes.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        isActive: Boolean(row.is_active),
      })),
      subjects: (subjectsRes.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        code: String(row.code),
        departmentId: str(row.department_id),
        isActive: Boolean(row.is_active),
      })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getStaffClassesAction(levelId: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const id = str(levelId);
    if (!id) return { ok: true as const, classes: [] as StaffOption[] };
    const result = await supabase
      .from("sch_classes")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("level_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return { ok: true as const, classes: (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getStaffStreamsAction(classId: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const id = str(classId);
    if (!id) return { ok: true as const, streams: [] as StaffOption[] };
    const result = await supabase
      .from("sch_class_streams")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("class_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return { ok: true as const, streams: (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listSchoolStaffAction(input: { page?: number; q?: string; status?: string } = {}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const q = searchNeedle(input.q);
    const status = str(input.status);
    let query = supabase
      .from("sch_staff")
      .select(
        "id, staff_number, first_name, middle_name, last_name, employment_status, staff_type_id, position_id, sch_staff_types(name, kind), sch_staff_positions(name, allows_academic_assignments)",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (status === "active" || status === "inactive") query = query.eq("employment_status", status);
    if (q) {
      const positions = await supabase
        .from("sch_staff_positions")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .ilike("name", `%${q}%`);
      const positionIds = (positions.data ?? []).map((row) => String(row.id));
      const positionFilter = positionIds.length ? `,position_id.in.(${positionIds.join(",")})` : "";
      query = query.or(`staff_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%${positionFilter}`);
    }
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const rows = (result.data ?? []) as Record<string, unknown>[];
    const ids = rows.map((row) => String(row.id));
    const primary = new Map<string, string>();
    if (ids.length) {
      const assigns = await supabase
        .from("sch_staff_assignments")
        .select(
          "staff_id, assignment_type, is_primary, sch_class_levels(name), sch_classes(name), sch_class_streams(name), sch_subjects(name), sch_departments(name)",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .in("staff_id", ids);
      for (const row of assigns.data ?? []) {
        if (primary.has(String(row.staff_id)) && !row.is_primary) continue;
        const type = readAssignmentType(row.assignment_type);
        if (!type) continue;
        primary.set(
          String(row.staff_id),
          assignmentLabel(type, {
            level: str((row.sch_class_levels as { name?: string } | null)?.name),
            className: str((row.sch_classes as { name?: string } | null)?.name),
            stream: str((row.sch_class_streams as { name?: string } | null)?.name),
            subject: str((row.sch_subjects as { name?: string } | null)?.name),
            department: str((row.sch_departments as { name?: string } | null)?.name),
          }),
        );
      }
    }
    return {
      ok: true as const,
      staff: rows.map((row) => {
        const type = row.sch_staff_types as { name?: string } | null;
        const position = row.sch_staff_positions as { name?: string; allows_academic_assignments?: boolean } | null;
        return {
          id: String(row.id),
          staffNumber: str(row.staff_number),
          name: personName(str(row.first_name), str(row.middle_name), str(row.last_name)),
          typeName: str(type?.name),
          positionName: str(position?.name),
          primaryAssignment: primary.get(String(row.id)) ?? "",
          status: asStatus(row.employment_status),
          allowsAcademicAssignments: Boolean(position?.allows_academic_assignments),
        };
      }),
      page: schoolPageMeta(page, result.count ?? rows.length, pageSize),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolStaffAction(id: string) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const staffId = str(id);
    if (!staffId) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_staff")
      .select("*, sch_staff_types(name, kind), sch_staff_positions(name, allows_academic_assignments)")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    if (!result.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const row = result.data as Record<string, unknown>;
    const type = row.sch_staff_types as { name?: string; kind?: string } | null;
    const position = row.sch_staff_positions as { name?: string; allows_academic_assignments?: boolean } | null;
    const assigns = await supabase
      .from("sch_staff_assignments")
      .select(
        "id, assignment_type, is_primary, is_active, sch_academic_years(name), sch_class_levels(name), sch_classes(name), sch_class_streams(name), sch_subjects(name), sch_departments(name)",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false });
    const profile: StaffProfile = {
      id: String(row.id),
      staffNumber: str(row.staff_number),
      firstName: str(row.first_name),
      middleName: str(row.middle_name),
      lastName: str(row.last_name),
      gender: str(row.gender),
      dateOfBirth: String(row.date_of_birth ?? ""),
      phone: str(row.phone),
      email: str(row.email),
      address: str(row.address),
      staffTypeId: str(row.staff_type_id),
      typeName: str(type?.name),
      typeKind: readKind(type?.kind),
      positionId: str(row.position_id),
      positionName: str(position?.name),
      allowsAcademicAssignments: Boolean(position?.allows_academic_assignments),
      employmentStatus: asStatus(row.employment_status),
      employmentDate: String(row.employment_date ?? ""),
      linkedUser: Boolean(row.user_id),
      assignments: (assigns.data ?? []).map((item) => ({
        id: String(item.id),
        assignmentType: readAssignmentType(item.assignment_type) ?? "SUBJECT_TEACHER",
        academicYearName: str((item.sch_academic_years as { name?: string } | null)?.name),
        levelName: str((item.sch_class_levels as { name?: string } | null)?.name),
        className: str((item.sch_classes as { name?: string } | null)?.name),
        streamName: str((item.sch_class_streams as { name?: string } | null)?.name),
        subjectName: str((item.sch_subjects as { name?: string } | null)?.name),
        departmentName: str((item.sch_departments as { name?: string } | null)?.name),
        isPrimary: Boolean(item.is_primary),
        isActive: Boolean(item.is_active),
      })),
    };
    return { ok: true as const, staff: profile, capabilities: { canView: true, canManage: canManage(user) } };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolStaffTypeAction(input: { name: string; kind: StaffTypeKind }) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = str(input.name);
    if (!name) throw new SchoolError("Staff type name is required.", "VALIDATION");
    const kind = asKind(input.kind);
    const inserted = await supabase
      .from("sch_staff_types")
      .insert({ business_unit_id: businessUnitId, name, code: codeFromName(name), kind, is_active: true })
      .select("id, name, code, kind, is_active")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") throw new SchoolError("That staff type already exists.", "CONFLICT");
      mapSchoolDbError(inserted.error, "save");
    }
    return {
      ok: true as const,
      type: {
        id: String(inserted.data!.id),
        name: String(inserted.data!.name),
        code: String(inserted.data!.code),
        kind: asKind(inserted.data!.kind),
        isActive: true,
      },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolStaffPositionAction(input: { staffTypeId: string; name: string; allowsAcademicAssignments: boolean }) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = str(input.name);
    const staffTypeId = str(input.staffTypeId);
    if (!name || !staffTypeId) throw new SchoolError("Position and staff type are required.", "VALIDATION");
    const typeRes = await supabase
      .from("sch_staff_types")
      .select("id, kind")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffTypeId)
      .maybeSingle();
    if (!typeRes.data) throw new SchoolError("Staff type was not found.", "NOT_FOUND");
    const allows = Boolean(input.allowsAcademicAssignments) || str(typeRes.data.kind) === "academic";
    const inserted = await supabase
      .from("sch_staff_positions")
      .insert({
        business_unit_id: businessUnitId,
        staff_type_id: staffTypeId,
        name,
        code: codeFromName(name),
        allows_academic_assignments: allows,
        is_active: true,
      })
      .select("id, staff_type_id, name, code, allows_academic_assignments, is_active")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") throw new SchoolError("That position already exists for this type.", "CONFLICT");
      mapSchoolDbError(inserted.error, "save");
    }
    return {
      ok: true as const,
      position: {
        id: String(inserted.data!.id),
        staffTypeId: String(inserted.data!.staff_type_id),
        name: String(inserted.data!.name),
        code: String(inserted.data!.code),
        allowsAcademicAssignments: Boolean(inserted.data!.allows_academic_assignments),
        isActive: true,
      },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolDepartmentAction(input: { name: string }) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = str(input.name);
    if (!name) throw new SchoolError("Department name is required.", "VALIDATION");
    const inserted = await supabase
      .from("sch_departments")
      .insert({ business_unit_id: businessUnitId, name, code: codeFromName(name), is_active: true })
      .select("id, name, code")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") throw new SchoolError("That department already exists.", "CONFLICT");
      mapSchoolDbError(inserted.error, "save");
    }
    return { ok: true as const, department: { id: String(inserted.data!.id), name: String(inserted.data!.name), code: String(inserted.data!.code), isActive: true } };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolSubjectRecordAction(input: { name: string; departmentId?: string }) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const name = str(input.name);
    if (!name) throw new SchoolError("Subject name is required.", "VALIDATION");
    const inserted = await supabase
      .from("sch_subjects")
      .insert({
        business_unit_id: businessUnitId,
        name,
        code: codeFromName(name),
        department_id: str(input.departmentId) || null,
        is_active: true,
      })
      .select("id, name, code, department_id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") throw new SchoolError("That subject already exists.", "CONFLICT");
      mapSchoolDbError(inserted.error, "save");
    }
    return {
      ok: true as const,
      subject: {
        id: String(inserted.data!.id),
        name: String(inserted.data!.name),
        code: String(inserted.data!.code),
        departmentId: str(inserted.data!.department_id),
        isActive: true,
      },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolStaffAction(input: StaffFormInput) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const firstName = str(input.firstName);
    const lastName = str(input.lastName);
    if (!firstName || !lastName) throw new SchoolError("First and last name are required.", "VALIDATION");
    const staffTypeId = str(input.staffTypeId);
    const positionId = str(input.positionId);
    if (!staffTypeId || !positionId) throw new SchoolError("Staff type and position are required.", "VALIDATION");
    const positionRes = await supabase
      .from("sch_staff_positions")
      .select("id, staff_type_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", positionId)
      .maybeSingle();
    if (!positionRes.data || String(positionRes.data.staff_type_id) !== staffTypeId) {
      throw new SchoolError("The selected position does not belong to that staff type.", "VALIDATION");
    }
    const payload = {
      business_unit_id: businessUnitId,
      first_name: firstName.slice(0, 80),
      middle_name: str(input.middleName).slice(0, 80),
      last_name: lastName.slice(0, 80),
      gender: genderValue(input.gender),
      date_of_birth: dateValue(input.dateOfBirth, "Date of birth"),
      phone: str(input.phone).slice(0, 40),
      email: str(input.email).slice(0, 160),
      address: str(input.address).slice(0, 240),
      staff_type_id: staffTypeId,
      position_id: positionId,
      employment_status: asStatus(input.employmentStatus),
      employment_date: dateValue(input.employmentDate, "Employment date"),
    };
    const existingId = str(input.id);
    const phoneDigits = payload.phone.replace(/\D/g, "");
    if (!existingId && phoneDigits) {
      const dup = await supabase
        .from("sch_staff")
        .select("id, staff_number, phone")
        .eq("business_unit_id", businessUnitId)
        .eq("employment_status", "active")
        .ilike("first_name", firstName)
        .ilike("last_name", lastName);
      const match = (dup.data ?? []).find((row) => str(row.phone).replace(/\D/g, "") === phoneDigits);
      if (match) {
        throw new SchoolError(`This person already exists as ${String(match.staff_number)}. Add an assignment instead.`, "CONFLICT");
      }
    }
    if (existingId) {
      const current = await supabase
        .from("sch_staff")
        .select("id, staff_number")
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .maybeSingle();
      if (!current.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
      const updated = await supabase.from("sch_staff").update(payload).eq("id", existingId);
      if (updated.error) mapSchoolDbError(updated.error, "save");
      await audit({
        action: "school.staff_updated",
        description: `Staff updated · ${String(current.data.staff_number)}`,
        entityType: "sch_staff",
        entityId: existingId,
        businessUnitId,
      });
      return { ok: true as const, id: existingId, staffNumber: String(current.data.staff_number) };
    }
    const { data: number, error: numError } = await supabase.rpc("sch_next_document_number", {
      p_business_unit_id: businessUnitId,
      p_doc_type: "staff",
      p_prefix: "STF",
    });
    if (numError || !number) throw new SchoolError("Couldn't allocate a staff number.", "DATABASE");
    const inserted = await supabase
      .from("sch_staff")
      .insert({ ...payload, staff_number: String(number) })
      .select("id, staff_number")
      .maybeSingle();
    if (inserted.error || !inserted.data) mapSchoolDbError(inserted.error, "save");
    await audit({
      action: "school.staff_created",
      description: `Staff created · ${String(inserted.data!.staff_number)}`,
      entityType: "sch_staff",
      entityId: String(inserted.data!.id),
      businessUnitId,
    });
    return { ok: true as const, id: String(inserted.data!.id), staffNumber: String(inserted.data!.staff_number) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

async function assertPlacement(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  input: StaffAssignmentInput,
) {
  const type = asAssignmentType(input.assignmentType);
  if (type === "CLASS_TEACHER" || (type === "SUBJECT_TEACHER" && str(input.streamId))) {
    const streamId = str(input.streamId);
    const classId = str(input.classId);
    const levelId = str(input.levelId);
    if (type === "CLASS_TEACHER" && (!streamId || !classId || !levelId)) {
      throw new SchoolError("Class teacher requires level, class, and stream.", "VALIDATION");
    }
    if (streamId) {
      const streamRes = await supabase
        .from("sch_class_streams")
        .select("id, class_id")
        .eq("business_unit_id", businessUnitId)
        .eq("id", streamId)
        .maybeSingle();
      const classRes = await supabase
        .from("sch_classes")
        .select("id, level_id")
        .eq("business_unit_id", businessUnitId)
        .eq("id", classId)
        .maybeSingle();
      if (!streamRes.data || !classRes.data) throw new SchoolError("The selected academic placement is not valid.", "VALIDATION");
      if (String(streamRes.data.class_id) !== classId) throw new SchoolError("The selected stream does not belong to that class.", "VALIDATION");
      if (String(classRes.data.level_id) !== levelId) throw new SchoolError("The selected class does not belong to that level.", "VALIDATION");
    }
  }
  if (type === "LEVEL_HEAD" && !str(input.levelId)) throw new SchoolError("Level head requires a level.", "VALIDATION");
  if (type === "DEPARTMENT_HEAD" && !str(input.departmentId)) throw new SchoolError("Department head requires a department.", "VALIDATION");
  if (type === "SUBJECT_TEACHER" && !str(input.subjectId)) throw new SchoolError("Subject teacher requires a subject.", "VALIDATION");
  if (str(input.academicYearId)) {
    const year = await supabase.from("sch_academic_years").select("id").eq("business_unit_id", businessUnitId).eq("id", str(input.academicYearId)).maybeSingle();
    if (!year.data) throw new SchoolError("Academic year was not found.", "VALIDATION");
  }
}

export async function saveStaffAssignmentAction(input: StaffAssignmentInput) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const staffId = str(input.staffId);
    const type = asAssignmentType(input.assignmentType);
    const staffRes = await supabase
      .from("sch_staff")
      .select("id, first_name, last_name, staff_number, sch_staff_positions(allows_academic_assignments, name)")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRes.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const allows = Boolean((staffRes.data.sch_staff_positions as { allows_academic_assignments?: boolean } | null)?.allows_academic_assignments);
    if (!allows) throw new SchoolError("This position does not take academic assignments.", "VALIDATION");
    await assertPlacement(supabase, businessUnitId, input);

    const yearId = str(input.academicYearId) || null;
    const streamId = str(input.streamId) || null;
    const levelId = str(input.levelId) || null;
    const departmentId = str(input.departmentId) || null;
    const staffName = personName(str(staffRes.data.first_name), "", str(staffRes.data.last_name));

    if (type === "CLASS_TEACHER" && streamId) {
      let conflictQuery = supabase
        .from("sch_staff_assignments")
        .select("id, staff_id, sch_staff(first_name, last_name), sch_class_streams(name)")
        .eq("business_unit_id", businessUnitId)
        .eq("assignment_type", "CLASS_TEACHER")
        .eq("is_active", true)
        .eq("is_primary", true)
        .eq("stream_id", streamId)
        .neq("staff_id", staffId);
      conflictQuery = yearId ? conflictQuery.eq("academic_year_id", yearId) : conflictQuery.is("academic_year_id", null);
      const conflict = await conflictQuery.maybeSingle();
      if (conflict.data && !input.replaceExisting) {
        const other = conflict.data.sch_staff as { first_name?: string; last_name?: string } | null;
        const stream = conflict.data.sch_class_streams as { name?: string } | null;
        return {
          ok: false as const,
          error: `${str(stream?.name) || "This stream"} already has a Class Teacher.`,
          conflict: { id: String(conflict.data.id), holder: personName(str(other?.first_name), "", str(other?.last_name)) },
        };
      }
      if (conflict.data && input.replaceExisting) {
        await supabase.from("sch_staff_assignments").update({ is_active: false }).eq("id", String(conflict.data.id));
      }
    }
    if (type === "LEVEL_HEAD" && levelId) {
      let conflictQuery = supabase
        .from("sch_staff_assignments")
        .select("id, staff_id, sch_staff(first_name, last_name), sch_class_levels(name)")
        .eq("business_unit_id", businessUnitId)
        .eq("assignment_type", "LEVEL_HEAD")
        .eq("is_active", true)
        .eq("level_id", levelId)
        .neq("staff_id", staffId);
      conflictQuery = yearId ? conflictQuery.eq("academic_year_id", yearId) : conflictQuery.is("academic_year_id", null);
      const conflict = await conflictQuery.maybeSingle();
      if (conflict.data && !input.replaceExisting) {
        const other = conflict.data.sch_staff as { first_name?: string; last_name?: string } | null;
        const level = conflict.data.sch_class_levels as { name?: string } | null;
        return {
          ok: false as const,
          error: `${str(level?.name) || "This level"} already has a Head.`,
          conflict: { id: String(conflict.data.id), holder: personName(str(other?.first_name), "", str(other?.last_name)) },
        };
      }
      if (conflict.data && input.replaceExisting) {
        await supabase.from("sch_staff_assignments").update({ is_active: false }).eq("id", String(conflict.data.id));
      }
    }
    if (type === "DEPARTMENT_HEAD" && departmentId) {
      let conflictQuery = supabase
        .from("sch_staff_assignments")
        .select("id, staff_id, sch_staff(first_name, last_name), sch_departments(name)")
        .eq("business_unit_id", businessUnitId)
        .eq("assignment_type", "DEPARTMENT_HEAD")
        .eq("is_active", true)
        .eq("department_id", departmentId)
        .neq("staff_id", staffId);
      conflictQuery = yearId ? conflictQuery.eq("academic_year_id", yearId) : conflictQuery.is("academic_year_id", null);
      const conflict = await conflictQuery.maybeSingle();
      if (conflict.data && !input.replaceExisting) {
        const other = conflict.data.sch_staff as { first_name?: string; last_name?: string } | null;
        const dept = conflict.data.sch_departments as { name?: string } | null;
        return {
          ok: false as const,
          error: `${str(dept?.name) || "This department"} already has a Head.`,
          conflict: { id: String(conflict.data.id), holder: personName(str(other?.first_name), "", str(other?.last_name)) },
        };
      }
      if (conflict.data && input.replaceExisting) {
        await supabase.from("sch_staff_assignments").update({ is_active: false }).eq("id", String(conflict.data.id));
      }
    }

    const inserted = await supabase
      .from("sch_staff_assignments")
      .insert({
        business_unit_id: businessUnitId,
        staff_id: staffId,
        assignment_type: type,
        academic_year_id: yearId,
        term_id: null,
        level_id: type === "LEVEL_HEAD" || type === "CLASS_TEACHER" || type === "SUBJECT_TEACHER" ? levelId : null,
        class_id: type === "CLASS_TEACHER" || type === "SUBJECT_TEACHER" ? str(input.classId) || null : null,
        stream_id: type === "CLASS_TEACHER" || type === "SUBJECT_TEACHER" ? streamId : null,
        subject_id: type === "SUBJECT_TEACHER" ? str(input.subjectId) || null : null,
        department_id: type === "DEPARTMENT_HEAD" ? departmentId : null,
        is_primary: true,
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      if (inserted.error?.code === "23505") throw new SchoolError("That assignment is already held by another staff member.", "CONFLICT");
      mapSchoolDbError(inserted.error, "save");
    }

    const description =
      type === "CLASS_TEACHER"
        ? `Teacher assignment created · ${staffName} → class teacher`
        : type === "LEVEL_HEAD"
          ? `Level head assigned · ${staffName}`
          : type === "DEPARTMENT_HEAD"
            ? `Department head assigned · ${staffName}`
            : `Teacher assignment created · ${staffName}`;
    await audit({
      action:
        type === "LEVEL_HEAD"
          ? "school.level_head_assigned"
          : type === "DEPARTMENT_HEAD"
            ? "school.department_head_assigned"
            : "school.staff_assignment_created",
      description,
      entityType: "sch_staff_assignments",
      entityId: String(inserted.data!.id),
      businessUnitId,
    });
    return { ok: true as const, id: String(inserted.data!.id) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveStaffAssignmentAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const assignmentId = str(id);
    const current = await supabase
      .from("sch_staff_assignments")
      .select("id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", assignmentId)
      .maybeSingle();
    if (!current.data) throw new SchoolError("Assignment was not found.", "NOT_FOUND");
    const updated = await supabase.from("sch_staff_assignments").update({ is_active: false }).eq("id", assignmentId);
    if (updated.error) mapSchoolDbError(updated.error, "save");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
