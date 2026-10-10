"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent, writeAuditEvents } from "@/lib/audit";
import { requireAuth, requireVerifiedOwner } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { canAssignStoredRoleToModule, displayRoleName } from "@/lib/auth/role-options";
import { matchPermission } from "@/lib/config/permissions";
import { syncUserAccessClaims } from "@/lib/auth/effective-access";
import { createUserAction } from "@/actions/users";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import { parseMoney } from "@/lib/school/salary";
import {
  adminOrNull,
  linkedProfileIds,
  setStaffProfileId,
  type StaffLinkUserOption,
} from "@/lib/school/staff-profile-link";

const VIEW = "school.staff.view";
const MANAGE = "school.staff.manage";
const PAYROLL_VIEW = "school.payroll.view";
const PAYROLL_MANAGE = "school.payroll.manage";
const PAYROLL_PAY = "school.payroll.pay";

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

export type SchoolRoleOption = { id: string; code: string; name: string };

export type StaffListRow = {
  id: string;
  staffNumber: string;
  name: string;
  typeName: string;
  roleName: string;
  positionName: string;
  jobTitle: string;
  phone: string;
  primaryAssignment: string;
  status: StaffStatus;
  allowsAcademicAssignments: boolean;
  hasSystemAccess: boolean;
  monthlySalary: number | null;
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
  roleId: string;
  roleCode: string;
  roleName: string;
  positionId: string;
  positionName: string;
  jobTitle: string;
  allowsAcademicAssignments: boolean;
  employmentStatus: StaffStatus;
  employmentDate: string;
  monthlySalary: number | null;
  salaryEffectiveOn: string;
  hasSystemAccess: boolean;
  linkedAccountName: string;
  linkedAccountEmail: string;
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
  staffTypeId?: string;
  roleId?: string;
  positionId?: string;
  jobTitle?: string;
  employmentStatus: StaffStatus;
  employmentDate: string;
  monthlySalary?: number | string | null;
  salaryEffectiveOn?: string;
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

function canManageSystemAccess(user: Awaited<ReturnType<typeof requireAuth>>) {
  return isOwnerRole(user.roleCode);
}

function canViewPayroll(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(PAYROLL_VIEW, matcher));
}

function canManagePayroll(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(PAYROLL_MANAGE, matcher));
}

function staffCaps(user: Awaited<ReturnType<typeof requireAuth>>) {
  return {
    canView: true,
    canManage: canManage(user),
    canManageSystemAccess: canManageSystemAccess(user),
    canViewPayroll: canViewPayroll(user),
    canManagePayroll: canManagePayroll(user),
    canPayPayroll: isOwnerRole(user.roleCode) || user.permissions.some((matcher) => matcher !== "*" && matchPermission(PAYROLL_PAY, matcher)),
  };
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

function allowsAcademicDuty(typeKind: StaffTypeKind, positionAllows?: boolean) {
  return typeKind === "academic" || Boolean(positionAllows);
}

function asSchoolRoles(rows: Array<{ id: unknown; code: unknown; name: unknown; module?: unknown }>): SchoolRoleOption[] {
  return rows
    .filter((row) =>
      canAssignStoredRoleToModule({ code: str(row.code), module: str(row.module) || "school" }, "school"),
    )
    .map((row) => ({
      id: String(row.id),
      code: str(row.code),
      name: displayRoleName(str(row.code), str(row.name)),
    }));
}

async function loadAssignableSchoolRoles(supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"]) {
  const scoped = await supabase.from("roles").select("id, code, name, module").eq("module", "school").order("name");
  if (!scoped.error && scoped.data) return asSchoolRoles(scoped.data);
  const all = await supabase.from("roles").select("id, code, name, module").order("name");
  if (all.error || !all.data) return [] as SchoolRoleOption[];
  return asSchoolRoles(all.data);
}

async function resolveAssignableSchoolRole(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  roleId: string,
) {
  if (!roleId) return null;
  const result = await supabase.from("roles").select("id, code, name, module").eq("id", roleId).maybeSingle();
  if (!result.data) throw new SchoolError("The selected School role was not found.", "VALIDATION");
  const row = { code: str(result.data.code), module: str(result.data.module) || "school" };
  if (!canAssignStoredRoleToModule(row, "school")) {
    throw new SchoolError("That role cannot be assigned to School staff.", "VALIDATION");
  }
  return {
    id: String(result.data.id),
    code: str(result.data.code),
    name: displayRoleName(str(result.data.code), str(result.data.name)),
  };
}

async function applySchoolRoleToProfile(input: {
  userId: string;
  businessUnitId: string;
  roleId: string;
}) {
  const admin = adminOrNull();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const profile = await admin.from("profiles").select("id, roles(code)").eq("id", input.userId).maybeSingle();
  const linkedRole = profile.data?.roles as { code?: string } | { code?: string }[] | null;
  const roleCode = Array.isArray(linkedRole) ? str(linkedRole[0]?.code) : str(linkedRole?.code);
  if (isOwnerRole(roleCode)) return {};
  const existing = await admin
    .from("user_module_roles")
    .select("user_id")
    .eq("user_id", input.userId)
    .eq("business_unit_id", input.businessUnitId)
    .maybeSingle();
  const written = existing.data
    ? await admin
        .from("user_module_roles")
        .update({ role_id: input.roleId })
        .eq("user_id", input.userId)
        .eq("business_unit_id", input.businessUnitId)
    : await admin.from("user_module_roles").insert({
        user_id: input.userId,
        business_unit_id: input.businessUnitId,
        role_id: input.roleId,
      });
  if (written.error) return { error: "Unable to assign the School role to the linked account." };
  await syncUserAccessClaims(admin, input.userId);
  return {};
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

export async function getStaffFormOptionsAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const [typesRes, positionsRes, roles] = await Promise.all([
      supabase
        .from("sch_staff_types")
        .select("id, name, code, kind, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sch_staff_positions")
        .select("id, staff_type_id, name, code, allows_academic_assignments, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      loadAssignableSchoolRoles(supabase),
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
      roles,
      capabilities: staffCaps(user),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: schoolActionError(error),
      types: [] as StaffTypeRow[],
      positions: [] as StaffPositionRow[],
      roles: [] as SchoolRoleOption[],
    };
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
    const payrollSelect = canViewPayroll(user) ? ", monthly_salary" : "";
    const listSelect = (linkColumn: "profile_id" | "user_id", withRole: boolean) =>
      `id, staff_number, first_name, middle_name, last_name, employment_status, staff_type_id, position_id, job_title, phone${withRole ? ", role_id" : ""}, ${linkColumn}${payrollSelect}, sch_staff_types(name, kind), sch_staff_positions(name, allows_academic_assignments)`;
    async function runList(linkColumn: "profile_id" | "user_id", withRole: boolean) {
      let query = supabase
        .from("sch_staff")
        .select(listSelect(linkColumn, withRole), { count: "exact" })
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
        query = query.or(
          `staff_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%${positionFilter}`,
        );
      }
      return await query;
    }
    let result = await runList("profile_id", true);
    if (result.error) result = await runList("profile_id", false);
    if (result.error) result = await runList("user_id", true);
    if (result.error) result = await runList("user_id", false);
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
    const ids = rows.map((row) => String(row.id));
    const roleIds = [...new Set(rows.map((row) => str(row.role_id)).filter(Boolean))];
    const roleNames = new Map<string, string>();
    if (roleIds.length) {
      const rolesRes = await supabase.from("roles").select("id, code, name").in("id", roleIds);
      for (const role of rolesRes.data ?? []) {
        roleNames.set(String(role.id), displayRoleName(str(role.code), str(role.name)));
      }
    }
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
        const type = row.sch_staff_types as { name?: string; kind?: string } | null;
        const position = row.sch_staff_positions as { name?: string; allows_academic_assignments?: boolean } | null;
        return {
          id: String(row.id),
          staffNumber: str(row.staff_number),
          name: personName(str(row.first_name), str(row.middle_name), str(row.last_name)),
          typeName: str(type?.name),
          roleName: roleNames.get(str(row.role_id)) ?? "",
          positionName: str(row.job_title) || str(position?.name),
          jobTitle: str(row.job_title),
          phone: str(row.phone),
          primaryAssignment: primary.get(String(row.id)) ?? "",
          status: asStatus(row.employment_status),
          allowsAcademicAssignments: allowsAcademicDuty(readKind(type?.kind), position?.allows_academic_assignments),
          hasSystemAccess: Boolean(str(row.profile_id) || str(row.user_id)),
          monthlySalary: canViewPayroll(user) ? parseMoney(row.monthly_salary) : null,
        };
      }),
      page: schoolPageMeta(page, result.count ?? rows.length, pageSize),
      capabilities: staffCaps(user),
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
    const showSalary = canViewPayroll(user);
    const roleId = str(row.role_id);
    let roleCode = "";
    let roleName = "";
    if (roleId) {
      const roleRes = await supabase.from("roles").select("id, code, name").eq("id", roleId).maybeSingle();
      if (roleRes.data) {
        roleCode = str(roleRes.data.code);
        roleName = displayRoleName(roleCode, str(roleRes.data.name));
      }
    }
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
      roleId,
      roleCode,
      roleName,
      positionId: str(row.position_id),
      positionName: str(row.job_title) || str(position?.name),
      jobTitle: str(row.job_title),
      allowsAcademicAssignments: allowsAcademicDuty(readKind(type?.kind), position?.allows_academic_assignments),
      employmentStatus: asStatus(row.employment_status),
      employmentDate: String(row.employment_date ?? ""),
      monthlySalary: showSalary ? parseMoney(row.monthly_salary) : null,
      salaryEffectiveOn: showSalary ? String(row.salary_effective_on ?? "") : "",
      hasSystemAccess: Boolean(str(row.profile_id) || str(row.user_id)),
      linkedAccountName: "",
      linkedAccountEmail: "",
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
    const profileId = str(row.profile_id) || str(row.user_id);
    if (profileId) {
      const admin = adminOrNull();
      const client = admin ?? supabase;
      const linked = await client.from("profiles").select("full_name, email").eq("id", profileId).maybeSingle();
      if (linked.data) {
        profile.linkedAccountName = str(linked.data.full_name);
        const email = str(linked.data.email);
        profile.linkedAccountEmail = email.endsWith("@users.rmholdings.internal") ? "" : email;
      } else {
        profile.linkedAccountName = "Linked account";
      }
    }
    return { ok: true as const, staff: profile, capabilities: staffCaps(user) };
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
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const firstName = str(input.firstName);
    const lastName = str(input.lastName);
    if (!firstName || !lastName) throw new SchoolError("First and last name are required.", "VALIDATION");
    const staffTypeId = str(input.staffTypeId);
    const role = await resolveAssignableSchoolRole(supabase, str(input.roleId));
    let typeRes: { data: { id: string; name: string; kind: string } | null } = { data: null };
    if (staffTypeId) {
      const loaded = await supabase
        .from("sch_staff_types")
        .select("id, name, kind")
        .eq("business_unit_id", businessUnitId)
        .eq("id", staffTypeId)
        .maybeSingle();
      if (!loaded.data) throw new SchoolError("Staff type was not found.", "VALIDATION");
      typeRes = { data: loaded.data as { id: string; name: string; kind: string } };
    }
    const positionId = str(input.positionId);
    let positionName = "";
    if (positionId) {
      const positionRes = await supabase
        .from("sch_staff_positions")
        .select("id, staff_type_id, name")
        .eq("business_unit_id", businessUnitId)
        .eq("id", positionId)
        .maybeSingle();
      if (!positionRes.data || (staffTypeId && String(positionRes.data.staff_type_id) !== staffTypeId)) {
        throw new SchoolError("The selected position does not belong to that staff type.", "VALIDATION");
      }
      if (!staffTypeId) {
        throw new SchoolError("Choose a staff type for that position, or leave both blank.", "VALIDATION");
      }
      positionName = str(positionRes.data.name);
    }
    const jobTitle = str(input.jobTitle).slice(0, 80);
    const salary = canManagePayroll(user) ? parseMoney(input.monthlySalary) : undefined;
    if (salary != null && salary < 0) throw new SchoolError("Monthly salary cannot be negative.", "VALIDATION");
    const salaryEffectiveOn = canManagePayroll(user) ? dateValue(input.salaryEffectiveOn, "Salary effective date") : undefined;
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
      staff_type_id: staffTypeId || null,
      role_id: role?.id ?? null,
      position_id: positionId || null,
      job_title: jobTitle,
      employment_status: asStatus(input.employmentStatus),
      employment_date: dateValue(input.employmentDate, "Employment date"),
      ...(canManagePayroll(user)
        ? {
            monthly_salary: salary ?? null,
            salary_effective_on: salary == null ? null : salaryEffectiveOn || new Date().toISOString().slice(0, 10),
          }
        : {}),
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
    const displayName = personName(firstName, str(input.middleName), lastName);
    const typeKind = typeRes.data ? readKind(typeRes.data.kind) : "support";
    function listRow(id: string, staffNumber: string, hasSystemAccess: boolean): StaffListRow {
      return {
        id,
        staffNumber,
        name: displayName,
        typeName: str(typeRes.data?.name),
        roleName: role?.name ?? "",
        positionName: jobTitle || positionName,
        jobTitle,
        phone: payload.phone,
        primaryAssignment: "",
        status: asStatus(input.employmentStatus),
        allowsAcademicAssignments: allowsAcademicDuty(typeKind),
        hasSystemAccess,
        monthlySalary: canManagePayroll(user) ? salary ?? null : null,
      };
    }
    async function syncDefaultAllocation(staffId: string) {
      if (!canManagePayroll(user) || salary == null) return;
      await supabase.from("sch_staff_salary_allocations").delete().eq("staff_id", staffId).eq("business_unit_id", businessUnitId);
      await supabase.from("sch_staff_salary_allocations").insert({
        business_unit_id: businessUnitId,
        staff_id: staffId,
        cost_business_unit_id: businessUnitId,
        amount: salary,
      });
    }
    if (existingId) {
      const current = await supabase
        .from("sch_staff")
        .select("id, staff_number, profile_id, user_id")
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .maybeSingle();
      if (!current.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
      const updated = await supabase.from("sch_staff").update(payload).eq("id", existingId);
      if (updated.error) {
        if (updated.error.message?.includes("role_id")) {
          throw new SchoolError("Staff role storage is not ready. Apply the latest School migration.", "NOT_CONFIGURED");
        }
        mapSchoolDbError(updated.error, "save");
      }
      const profileId = str(current.data.profile_id) || str(current.data.user_id);
      if (profileId && role) {
        const assigned = await applySchoolRoleToProfile({ userId: profileId, businessUnitId, roleId: role.id });
        if (assigned.error) {
          await supabase.from("sch_staff").update({ role_id: null }).eq("id", existingId);
          throw new SchoolError(assigned.error, "DATABASE");
        }
      }
      await syncDefaultAllocation(existingId);
      await writeAuditEvents([
        {
          action: "school.staff_updated",
          module: "school",
          description: `Staff member updated · ${displayName}`,
          severity: "medium",
          entityType: "sch_staff",
          entityId: existingId,
          businessUnitId,
        },
        ...(role
          ? [
              {
                action: "school.staff_role_assigned",
                module: "school",
                description: `Staff role assigned · ${displayName} · ${role.name}`,
                severity: "medium" as const,
                entityType: "sch_staff",
                entityId: existingId,
                businessUnitId,
              },
            ]
          : []),
      ]);
      return {
        ok: true as const,
        id: existingId,
        staffNumber: String(current.data.staff_number),
        staff: listRow(existingId, String(current.data.staff_number), Boolean(profileId)),
      };
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
    if (inserted.error || !inserted.data) {
      if (inserted.error?.message?.includes("role_id")) {
        throw new SchoolError("Staff role storage is not ready. Apply the latest School migration.", "NOT_CONFIGURED");
      }
      mapSchoolDbError(inserted.error, "save");
    }
    const id = String(inserted.data!.id);
    const staffNumber = String(inserted.data!.staff_number);
    await syncDefaultAllocation(id);
    await writeAuditEvents([
      {
        action: "school.staff_created",
        module: "school",
        description: `Staff member added · ${displayName}`,
        severity: "medium",
        entityType: "sch_staff",
        entityId: id,
        businessUnitId,
      },
      ...(role
        ? [
            {
              action: "school.staff_role_assigned",
              module: "school",
              description: `Staff role assigned · ${displayName} · ${role.name}`,
              severity: "medium" as const,
              entityType: "sch_staff",
              entityId: id,
              businessUnitId,
            },
          ]
        : []),
    ]);
    return { ok: true as const, id, staffNumber, staff: listRow(id, staffNumber, false) };
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
      .select("id, first_name, last_name, staff_number, sch_staff_types(kind), sch_staff_positions(allows_academic_assignments, name)")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRes.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const typeKind = readKind((staffRes.data.sch_staff_types as { kind?: string } | null)?.kind);
    const allows = allowsAcademicDuty(
      typeKind,
      (staffRes.data.sch_staff_positions as { allows_academic_assignments?: boolean } | null)?.allows_academic_assignments,
    );
    if (!allows) throw new SchoolError("This staff type does not take academic assignments.", "VALIDATION");
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

export async function archiveSchoolStaffAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const staffId = str(id);
    const current = await supabase
      .from("sch_staff")
      .select("id, first_name, last_name, staff_number")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!current.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const updated = await supabase
      .from("sch_staff")
      .update({ employment_status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", staffId)
      .eq("business_unit_id", businessUnitId);
    if (updated.error) mapSchoolDbError(updated.error, "save");
    const name = personName(str(current.data.first_name), "", str(current.data.last_name));
    await audit({
      action: "school.staff_archived",
      description: `Staff member deactivated · ${name}`,
      entityType: "sch_staff",
      entityId: staffId,
      businessUnitId,
    });
    revalidatePath("/school/staff");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

function revalidateStaffIdentity(staffId: string) {
  revalidatePath("/school/staff");
  revalidatePath(`/school/staff/${staffId}`);
  revalidatePath("/school");
  revalidatePath("/owner/users");
}

export async function searchUnlinkedUsersAction(q: string): Promise<
  { ok: true; users: StaffLinkUserOption[] } | { ok: false; error: string }
> {
  try {
    await requireVerifiedOwner();
    await requireSchoolPermission(VIEW);
    const admin = adminOrNull();
    if (!admin) throw new SchoolError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", "NOT_CONFIGURED");
    const needle = searchNeedle(q);
    let query = admin.from("profiles").select("id, full_name, email, phone").eq("is_active", true).order("full_name").limit(24);
    if (needle) {
      query = query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%`);
    }
    const result = await query;
    if (result.error) mapSchoolDbError(result.error, "load");
    const taken = await linkedProfileIds(admin);
    return {
      ok: true as const,
      users: (result.data ?? [])
        .filter((row) => !taken.has(String(row.id)))
        .slice(0, 12)
        .map((row) => ({
          id: String(row.id),
          name: str(row.full_name),
          email: str(row.email).endsWith("@users.rmholdings.internal") ? "" : str(row.email),
          phone: str(row.phone),
        })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function linkStaffToUserAction(input: { staffId: string; profileId: string }) {
  try {
    await requireVerifiedOwner();
    const { businessUnitId } = await requireSchoolPermission(MANAGE);
    const admin = adminOrNull();
    if (!admin) throw new SchoolError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", "NOT_CONFIGURED");
    const staffId = str(input.staffId);
    const profileId = str(input.profileId);
    if (!staffId || !profileId) throw new SchoolError("Choose a staff member and a user account.", "VALIDATION");
    const staffRes = await admin
      .from("sch_staff")
      .select("id, first_name, last_name, profile_id, role_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRes.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    if (str(staffRes.data.profile_id) && str(staffRes.data.profile_id) !== profileId) {
      throw new SchoolError("This staff member is already linked to a user account.", "CONFLICT");
    }
    if (str(staffRes.data.profile_id) === profileId) {
      return { ok: true as const };
    }
    const linked = await setStaffProfileId(admin, { staffId, profileId, businessUnitId });
    if ("error" in linked && linked.error) throw new SchoolError(linked.error, "CONFLICT");
    const staffRoleId = str(staffRes.data.role_id);
    if (staffRoleId) {
      const assigned = await applySchoolRoleToProfile({ userId: profileId, businessUnitId, roleId: staffRoleId });
      if (assigned.error) throw new SchoolError(assigned.error, "DATABASE");
    }
    const name = personName(str(staffRes.data.first_name), "", str(staffRes.data.last_name));
    await audit({
      action: "school.staff_linked_user",
      description: `Staff linked to user account · ${name}`,
      entityType: "sch_staff",
      entityId: staffId,
      businessUnitId,
    });
    revalidateStaffIdentity(staffId);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function unlinkStaffFromUserAction(staffId: string) {
  try {
    await requireVerifiedOwner();
    const { businessUnitId } = await requireSchoolPermission(MANAGE);
    const admin = adminOrNull();
    if (!admin) throw new SchoolError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", "NOT_CONFIGURED");
    const id = str(staffId);
    const staffRes = await admin
      .from("sch_staff")
      .select("id, first_name, last_name, profile_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", id)
      .maybeSingle();
    if (!staffRes.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    if (!str(staffRes.data.profile_id)) return { ok: true as const };
    const linked = await setStaffProfileId(admin, { staffId: id, profileId: null, businessUnitId });
    if ("error" in linked && linked.error) throw new SchoolError(linked.error, "DATABASE");
    const name = personName(str(staffRes.data.first_name), "", str(staffRes.data.last_name));
    await audit({
      action: "school.staff_unlinked_user",
      description: `Staff unlinked from user account · ${name}`,
      entityType: "sch_staff",
      entityId: id,
      businessUnitId,
    });
    revalidateStaffIdentity(id);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function grantStaffSystemAccessAction(input: {
  staffId: string;
  email?: string;
  phone?: string;
  roleCode: string;
}) {
  try {
    await requireVerifiedOwner();
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
    const staffId = str(input.staffId);
    const staffRes = await supabase
      .from("sch_staff")
      .select("id, first_name, middle_name, last_name, email, phone, profile_id, role_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRes.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    if (str(staffRes.data.profile_id)) {
      throw new SchoolError("This staff member already has system access.", "CONFLICT");
    }
    let storedRoleCode = str(input.roleCode);
    const storedRoleId = str(staffRes.data.role_id);
    if (storedRoleId) {
      const roleRes = await supabase.from("roles").select("code").eq("id", storedRoleId).maybeSingle();
      if (roleRes.data?.code) storedRoleCode = str(roleRes.data.code);
    }
    if (!storedRoleCode) throw new SchoolError("Assign a School role on the staff record first.", "VALIDATION");
    const name = personName(str(staffRes.data.first_name), str(staffRes.data.middle_name), str(staffRes.data.last_name));
    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", str(input.email) || str(staffRes.data.email));
    formData.set("phone", str(input.phone) || str(staffRes.data.phone));
    formData.set("roleCode", storedRoleCode);
    formData.append("modules", "school");
    formData.set("linkStaffId", staffId);
    const created = await createUserAction(null, formData);
    if (created?.error || !created?.createdUser) {
      throw new SchoolError(created?.error || "Unable to create the user account.", "DATABASE");
    }
    const admin = adminOrNull();
    if (!admin) throw new SchoolError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", "NOT_CONFIGURED");
    const linked = await setStaffProfileId(admin, {
      staffId,
      profileId: created.createdUser.id,
      businessUnitId,
    });
    if ("error" in linked && linked.error) {
      throw new SchoolError(linked.error, "CONFLICT");
    }
    await audit({
      action: "school.staff_system_access_granted",
      description: `System access granted · ${name}`,
      entityType: "sch_staff",
      entityId: staffId,
      businessUnitId,
    });
    revalidateStaffIdentity(staffId);
    return { ok: true as const, credentials: created.credentials };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
