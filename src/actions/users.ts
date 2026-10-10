"use server";

import { revalidatePath, updateTag } from "next/cache";
import { BUSINESS_UNITS_CACHE_TAG } from "@/lib/data/business-units";
import { z } from "zod";
import { requireVerifiedOwner } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  ALL_MODULES_VALUE,
  assignedCodesForRole,
  canAssignCatalogRoleToModule,
  canAssignStoredRoleToModule,
  displayRoleName,
  isRoleAllowedForModules,
  metadataModulesForRole,
  roleDefinition,
} from "@/lib/auth/role-options";
import { isImplementedBusinessModule } from "@/lib/config/permissions";
import { generateTemporaryPassword } from "@/lib/auth/temp-password";
import {
  displayLoginIdentifier,
  normalizeEmail,
  normalizePhone,
  syntheticEmailForPhone,
} from "@/lib/auth/identifiers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ACCESS_CATALOG_CACHE_TAG,
  getAccessCatalog,
  listManagedUsers,
  statusOf,
  type ManagedUser,
} from "@/lib/data/app-users";
import { writeAuditEvent } from "@/lib/audit";
import { syncUserAccessClaims } from "@/lib/auth/effective-access";
import {
  ensureTeacherStaffForProfile,
  insertStaffForProfile,
  schoolBusinessUnitId,
  setStaffProfileId,
  type LinkedStaffInfo,
  type StaffLinkStaffOption,
} from "@/lib/school/staff-profile-link";
import { isSchoolTeacherRole, schoolRoleCodeForAssignment } from "@/lib/school/teacher-staff";
import { upsertSalaryArrangement } from "@/lib/school/salary-arrangement";
import { formatCompactStaffNumber } from "@/lib/school/student-number";
import type { SupabaseClient } from "@supabase/supabase-js";

async function applyOptionalUserSalary(
  admin: SupabaseClient,
  formData: FormData,
  staffId: string | null | undefined,
): Promise<string | undefined> {
  if (String(formData.get("configureSalary") ?? "") !== "1") return;
  if (!staffId) return "Salary was skipped because this account is not linked to a staff record.";
  const home = await schoolBusinessUnitId(admin);
  if (!home) return "School business unit was not found for salary.";
  const code = String(formData.get("salaryBusinessUnitCode") ?? "school").trim() || "school";
  const unit = await admin.from("business_units").select("id").eq("code", code).maybeSingle();
  const saved = await upsertSalaryArrangement(admin, {
    staffHomeBusinessUnitId: home,
    staffId,
    costBusinessUnitId: unit.data?.id ? String(unit.data.id) : home,
    monthlySalary: String(formData.get("monthlySalary") ?? ""),
    payday: String(formData.get("salaryPayday") ?? "28"),
    effectiveOn: String(formData.get("salaryEffectiveOn") ?? ""),
    isActive: String(formData.get("salaryActive") ?? "active") !== "inactive",
  });
  return saved.error;
}

export type CredentialsPayload = {
  name: string;
  loginIdentifier: string;
  temporaryPassword: string;
  modules: string[];
  roleName: string;
};

export type UsersActionState = {
  error?: string;
  warning?: string;
  credentials?: CredentialsPayload;
  createdUser?: ManagedUser;
} | null;

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  roleCode: z.string().min(1),
  modules: z.array(z.string()).min(1),
});

function adminOrError() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  return { ok: true as const, admin };
}

function revalidateUsersWorkspace() {
  updateTag(BUSINESS_UNITS_CACHE_TAG);
  updateTag(ACCESS_CATALOG_CACHE_TAG);
  revalidatePath("/owner/users");
  revalidatePath("/school/staff");
  revalidatePath("/school");
}

function parseModuleRoles(formData: FormData, modules: string[], fallback: string) {
  const map: Record<string, string> = {};
  for (const code of modules) {
    if (code === ALL_MODULES_VALUE) continue;
    const specific = String(formData.get(`moduleRole:${code}`) ?? "").trim();
    map[code] = specific || fallback;
  }
  return map;
}

async function assertRolesForModules(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  moduleRoles: Record<string, string>,
) {
  const codes = [...new Set(Object.values(moduleRoles).filter(Boolean))];
  if (!codes.length) return { error: "Select a role for each module." as const };
  const { data } = await admin.from("roles").select("id, code, name, module").in("code", codes);
  const byCode = new Map((data ?? []).map((row) => [String(row.code), row]));
  for (const [moduleCode, roleCode] of Object.entries(moduleRoles)) {
    if (!isImplementedBusinessModule(moduleCode)) continue;
    const stored = byCode.get(roleCode);
    if (
      !stored ||
      !(
        canAssignCatalogRoleToModule(roleCode, moduleCode) ||
        canAssignStoredRoleToModule(stored, moduleCode)
      )
    ) {
      return { error: "That role is not available for the selected module." as const };
    }
  }
  return { roles: byCode };
}

async function ownerCount() {
  const users = await listManagedUsers();
  return users.filter((user) => isOwnerRole(user.roleCode) && user.isActive).length;
}

function parseModules(formData: FormData) {
  const values = formData.getAll("modules").map(String).filter(Boolean);
  if (values.includes(ALL_MODULES_VALUE)) return [ALL_MODULES_VALUE];
  return [...new Set(values)];
}

async function setUserAccess(input: {
  userId: string;
  roleCode: string;
  moduleCodes: string[];
  moduleRoles?: Record<string, string>;
  name?: string;
  email?: string | null;
  phone?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedAt?: string | null;
}) {
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  const { admin } = ready;

  const assignedCodes = assignedCodesForRole(input.roleCode, input.moduleCodes);
  const [roleResult, unitsResult] = await Promise.all([
    admin.from("roles").select("id, name, code").eq("code", input.roleCode).maybeSingle(),
    assignedCodes.length
      ? admin.from("business_units").select("id, code, name").in("code", assignedCodes)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
  ]);
  const role = roleResult.data;
  if (!role) return { error: "Selected role was not found." };
  const assignedUnits = unitsResult.data ?? [];

  const profilePatch: Record<string, unknown> = {
    role_id: role.id,
    updated_at: new Date().toISOString(),
  };
  if (input.name) profilePatch.full_name = input.name;
  if (input.email !== undefined) profilePatch.email = input.email;
  if (input.phone !== undefined) profilePatch.phone = input.phone;
  if (input.mustChangePassword !== undefined) profilePatch.must_change_password = input.mustChangePassword;
  if (input.isActive !== undefined) profilePatch.is_active = input.isActive;
  if (input.failedLoginAttempts !== undefined) profilePatch.failed_login_attempts = input.failedLoginAttempts;
  if (input.lockedAt !== undefined) profilePatch.locked_at = input.lockedAt;

  const { error: profileError } = await admin.from("profiles").update(profilePatch).eq("id", input.userId);
  if (profileError) return { error: "Unable to update the user profile." };

  await admin.from("user_business_units").delete().eq("user_id", input.userId);
  if (assignedUnits.length) {
    await admin.from("user_business_units").insert(
      assignedUnits.map((unit) => ({ user_id: input.userId, business_unit_id: unit.id })),
    );
  }

  await admin.from("user_module_roles").delete().eq("user_id", input.userId);
  if (assignedUnits.length) {
    const roleCodes = [
      ...new Set(assignedUnits.map((unit) => input.moduleRoles?.[unit.code] ?? input.roleCode)),
    ];
    const extraRoles = await admin.from("roles").select("id, code").in("code", roleCodes);
    const roleIdByCode = new Map((extraRoles.data ?? []).map((row) => [String(row.code), String(row.id)]));
    roleIdByCode.set(input.roleCode, String(role.id));
    await admin.from("user_module_roles").insert(
      assignedUnits.map((unit) => ({
        user_id: input.userId,
        business_unit_id: unit.id,
        role_id: roleIdByCode.get(input.moduleRoles?.[unit.code] ?? input.roleCode) ?? role.id,
      })),
    );
  }

  const claims = await syncUserAccessClaims(admin, input.userId);
  if ("error" in claims) {
    const modules = metadataModulesForRole(input.roleCode, input.moduleCodes);
    await admin.auth.admin.updateUserById(input.userId, {
      app_metadata: { role_code: input.roleCode, modules },
    });
    return { roleName: displayRoleName(input.roleCode, role.name as string), modules };
  }

  return { roleName: displayRoleName(input.roleCode, role.name as string), modules: claims.modules };
}

export async function createUserAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    roleCode: formData.get("roleCode"),
    modules: parseModules(formData),
  });
  if (!parsed.success) {
    return { error: "Enter a name, email or phone, module and role." };
  }

  const emailValue = parsed.data.email ? normalizeEmail(parsed.data.email) : "";
  const phoneValue = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (!emailValue && !phoneValue) {
    return { error: "Provide an email address or a phone number." };
  }
  if (emailValue && !z.string().email().safeParse(emailValue).success) {
    return { error: "Enter a valid email address." };
  }
  const moduleRoles = parseModuleRoles(formData, parsed.data.modules, parsed.data.roleCode);
  if (parsed.data.modules.includes(ALL_MODULES_VALUE)) {
    if (!isRoleAllowedForModules(parsed.data.roleCode, parsed.data.modules)) {
      return { error: "That role is not available for the selected module." };
    }
  } else {
    const roleCheck = await assertRolesForModules(ready.admin, moduleRoles);
    if ("error" in roleCheck && roleCheck.error) return { error: roleCheck.error };
  }

  const authEmail = emailValue || syntheticEmailForPhone(phoneValue!);
  const temporaryPassword = generateTemporaryPassword();
  const assignedCodes = assignedCodesForRole(parsed.data.roleCode, parsed.data.modules);
  const metadataModules = metadataModulesForRole(parsed.data.roleCode, parsed.data.modules);
  const { admin } = ready;

  const catalog = await getAccessCatalog();
  const role =
    catalog.roles.find((item) => item.code === parsed.data.roleCode) ??
    (
      await admin.from("roles").select("id, code, name").eq("code", parsed.data.roleCode).maybeSingle()
    ).data;
  if (!role) {
    return { error: "Selected role was not found." };
  }
  let assignedUnits = catalog.units.filter((unit) =>
    assignedCodes.includes(unit.code as (typeof assignedCodes)[number]),
  );
  if (assignedCodes.length && assignedUnits.length === 0) {
    const { data } = await admin.from("business_units").select("id, code, name").in("code", assignedCodes);
    assignedUnits = (data ?? []) as typeof catalog.units;
  }

  const created = await admin.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.name,
      phone: phoneValue,
    },
    app_metadata: {
      role_code: parsed.data.roleCode,
      modules: metadataModules,
      permissions: isOwnerRole(parsed.data.roleCode) ? ["*"] : [],
    },
  });

  if (created.error || !created.data.user) {
    return { error: created.error?.message || "Unable to create the user in Supabase Auth." };
  }

  const createdAt = new Date().toISOString();
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.data.user.id,
    full_name: parsed.data.name,
    email: authEmail,
    phone: phoneValue,
    role_id: role.id,
    is_active: true,
    must_change_password: true,
    failed_login_attempts: 0,
    locked_at: null,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return { error: "Unable to save the user profile." };
  }

  if (assignedUnits.length) {
    const { error: assignmentError } = await admin.from("user_business_units").insert(
      assignedUnits.map((unit) => ({ user_id: created.data.user.id, business_unit_id: unit.id })),
    );
    if (assignmentError) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      return { error: "Unable to assign modules." };
    }
    const roleCodes = [...new Set(assignedUnits.map((unit) => moduleRoles[unit.code] ?? parsed.data.roleCode))];
    const extraRoles = await admin.from("roles").select("id, code").in("code", roleCodes);
    const roleIdByCode = new Map((extraRoles.data ?? []).map((row) => [String(row.code), String(row.id)]));
    roleIdByCode.set(parsed.data.roleCode, String(role.id));
    await admin.from("user_module_roles").insert(
      assignedUnits.map((unit) => ({
        user_id: created.data.user.id,
        business_unit_id: unit.id,
        role_id: roleIdByCode.get(moduleRoles[unit.code] ?? parsed.data.roleCode) ?? role.id,
      })),
    );
  }

  await syncUserAccessClaims(admin, created.data.user.id);

  const roleName = displayRoleName(
    parsed.data.roleCode,
    role.name || roleDefinition(parsed.data.roleCode)?.name || parsed.data.roleCode,
  );
  const createdUser: ManagedUser = {
    id: created.data.user.id,
    name: parsed.data.name,
    email: emailValue || authEmail,
    phone: phoneValue,
    loginIdentifier: displayLoginIdentifier({ email: emailValue || authEmail, phone: phoneValue }),
    roleCode: parsed.data.roleCode,
    roleName,
    modules: metadataModules,
    moduleNames: metadataModules.includes("*")
      ? ["All modules"]
      : assignedUnits.map((unit) => unit.name),
    isActive: true,
    mustChangePassword: true,
    failedLoginAttempts: 0,
    lockedAt: null,
    lastLoginAt: null,
    createdAt,
    status: "pending_password",
    staff: null,
  };
  createdUser.status = statusOf(createdUser);

  const createAsStaff = String(formData.get("createAsStaff") ?? "") === "1";
  const linkStaffId = String(formData.get("linkStaffId") ?? "").trim();
  const schoolAccessRole = schoolRoleCodeForAssignment({
    assignedModules: metadataModules.map(String),
    roleCode: parsed.data.roleCode,
    moduleRoles,
  });
  let warning: string | undefined;
  if (linkStaffId) {
    const businessUnitId = await schoolBusinessUnitId(admin);
    if (!businessUnitId) {
      warning = "User created. School business unit was not found for the staff link.";
    } else {
      const linked = await setStaffProfileId(admin, {
        staffId: linkStaffId,
        profileId: createdUser.id,
        businessUnitId,
      });
      if ("error" in linked && linked.error) {
        warning = `User created. Staff was not linked: ${linked.error}`;
      } else if ("staff" in linked) {
        createdUser.staff = linked.staff;
        await writeAuditEvent({
          action: "school.staff_linked_user",
          module: "school",
          description: `Staff linked to user account · ${linked.staff.name}`,
          severity: "medium",
          entityType: "sch_staff",
          entityId: linked.staff.id,
          businessUnitId,
        });
      }
    }
  } else if (isSchoolTeacherRole(schoolAccessRole)) {
    const teacherStaff = await ensureTeacherStaffForProfile(admin, {
      profileId: createdUser.id,
      fullName: parsed.data.name,
      phone: phoneValue ?? "",
      email: emailValue,
      roleId: String(role.id),
    });
    if ("error" in teacherStaff && teacherStaff.error) {
      warning = `User created. School staff was not linked: ${teacherStaff.error}`;
    } else if ("staff" in teacherStaff && teacherStaff.staff) {
      createdUser.staff = teacherStaff.staff;
      await writeAuditEvent({
        action: "created" in teacherStaff && teacherStaff.created === false ? "school.staff_linked_user" : "school.staff_created",
        module: "school",
        description: `Staff linked to teacher account · ${teacherStaff.staff.name}`,
        severity: "medium",
        entityType: "sch_staff",
        entityId: teacherStaff.staff.id,
        businessUnitId: "businessUnitId" in teacherStaff ? teacherStaff.businessUnitId : undefined,
      });
    }
  } else if (createAsStaff) {
    const staffResult = await insertStaffForProfile(admin, {
      profileId: createdUser.id,
      fullName: parsed.data.name,
      phone: phoneValue ?? "",
      email: emailValue,
      staffTypeId: String(formData.get("staffTypeId") ?? "").trim(),
      staffPositionId: String(formData.get("staffPositionId") ?? "").trim(),
      jobTitle: String(formData.get("jobTitle") ?? "").trim(),
      roleId: String(role.id),
    });
    if ("error" in staffResult && staffResult.error) {
      warning = `User created. Staff profile was not created: ${staffResult.error}`;
    } else if ("staff" in staffResult) {
      createdUser.staff = staffResult.staff;
      await writeAuditEvent({
        action: "school.staff_created",
        module: "school",
        description: `Staff created · ${staffResult.staff.name}`,
        severity: "medium",
        entityType: "sch_staff",
        entityId: staffResult.staff.id,
        businessUnitId: staffResult.businessUnitId,
      });
    }
  }
  const salaryWarning = await applyOptionalUserSalary(admin, formData, createdUser.staff?.id);
  if (salaryWarning) warning = warning ? `${warning} ${salaryWarning}` : `User created. ${salaryWarning}`;

  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "user.created",
    module: "users",
    description: metadataModules.includes("school")
      ? `School role assigned · ${parsed.data.name} → ${roleName}`
      : `Created user ${parsed.data.name} with role ${roleName}`,
    severity: "medium",
    entityType: "user",
    entityId: createdUser.id,
    metadata: { role: parsed.data.roleCode, modules: metadataModules.map(String), moduleRoles },
  });

  return {
    warning,
    credentials: {
      name: parsed.data.name,
      loginIdentifier: emailValue || phoneValue || authEmail,
      temporaryPassword,
      modules: metadataModules,
      roleName,
    },
    createdUser,
  };
}

export async function resetPasswordAction(userId: string): Promise<UsersActionState> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) {
    return { error: "You cannot reset your own password from this screen." };
  }
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };

  const temporaryPassword = generateTemporaryPassword();
  const { error } = await ready.admin.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (error) return { error: "Unable to reset the password." };

  await ready.admin
    .from("profiles")
    .update({
      must_change_password: true,
      failed_login_attempts: 0,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "password.reset",
    module: "users",
    description: `Reset password for ${target.name}`,
    severity: "high",
    entityType: "user",
    entityId: target.id,
  });
  return {
    credentials: {
      name: target.name,
      loginIdentifier: target.loginIdentifier,
      temporaryPassword,
      modules: target.moduleNames,
      roleName: target.roleName,
    },
  };
}

export async function unlockUserAction(userId: string): Promise<{ error?: string }> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) return { error: "You cannot unlock your own account from this screen." };
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  await ready.admin
    .from("profiles")
    .update({
      locked_at: null,
      failed_login_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "user.unlocked",
    module: "users",
    description: "Unlocked a user account",
    severity: "high",
    entityType: "user",
    entityId: userId,
  });
  return {};
}

export async function disableUserAction(userId: string): Promise<{ error?: string }> {
  const actor = await requireVerifiedOwner();
  if (userId === actor.id) return { error: "You cannot disable your own account." };
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };
  if (isOwnerRole(target.roleCode) && (await ownerCount()) <= 1) {
    return { error: "The only Owner account cannot be disabled." };
  }

  await ready.admin
    .from("profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "user.disabled",
    module: "users",
    description: `Disabled user ${target.name}`,
    severity: "high",
    entityType: "user",
    entityId: target.id,
  });
  return {};
}

export async function enableUserAction(userId: string): Promise<{ error?: string }> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  await ready.admin
    .from("profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", userId);
  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "user.enabled",
    module: "users",
    description: "Enabled a user account",
    severity: "medium",
    entityType: "user",
    entityId: userId,
  });
  return {};
}

export async function updateUserAction(
  _prev: UsersActionState,
  formData: FormData,
): Promise<UsersActionState> {
  const actor = await requireVerifiedOwner();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "User was not found." };
  if (userId === actor.id) {
    return { error: "You cannot change your own role or module access." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    roleCode: formData.get("roleCode"),
    modules: parseModules(formData),
  });
  if (!parsed.success) return { error: "Enter valid user details." };
  const readyForRoles = adminOrError();
  if (!readyForRoles.ok) return { error: readyForRoles.error };
  const moduleRoles = parseModuleRoles(formData, parsed.data.modules, parsed.data.roleCode);
  if (parsed.data.modules.includes(ALL_MODULES_VALUE)) {
    if (!isRoleAllowedForModules(parsed.data.roleCode, parsed.data.modules)) {
      return { error: "That role is not available for the selected module." };
    }
  } else {
    const roleCheck = await assertRolesForModules(readyForRoles.admin, moduleRoles);
    if ("error" in roleCheck && roleCheck.error) return { error: roleCheck.error };
  }

  const users = await listManagedUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) return { error: "User was not found." };
  if (isOwnerRole(target.roleCode) && !isOwnerRole(parsed.data.roleCode)) {
    const ready = adminOrError();
    if (!ready.ok) return { error: ready.error };
    if ((await ownerCount()) <= 1) {
      return { error: "The only Owner account cannot be demoted." };
    }
  }

  const result = await setUserAccess({
    userId,
    name: parsed.data.name,
    phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
    roleCode: parsed.data.roleCode,
    moduleCodes: parsed.data.modules,
    moduleRoles,
  });
  if ("error" in result) return { error: result.error };

  const schoolAccessRole = schoolRoleCodeForAssignment({
    assignedModules: parsed.data.modules,
    roleCode: parsed.data.roleCode,
    moduleRoles,
  });
  let staffId = target.staff?.id;
  if (isSchoolTeacherRole(schoolAccessRole)) {
    const teacherStaff = await ensureTeacherStaffForProfile(readyForRoles.admin, {
      profileId: userId,
      fullName: parsed.data.name,
      phone: (parsed.data.phone ? normalizePhone(parsed.data.phone) : target.phone) || undefined,
      email: target.email ?? "",
    });
    if ("staff" in teacherStaff && teacherStaff.staff) {
      staffId = teacherStaff.staff.id;
      await writeAuditEvent({
        action: "created" in teacherStaff && teacherStaff.created === false ? "school.staff_linked_user" : "school.staff_created",
        module: "school",
        description: `Staff linked to teacher account · ${teacherStaff.staff.name}`,
        severity: "medium",
        entityType: "sch_staff",
        entityId: teacherStaff.staff.id,
        businessUnitId: "businessUnitId" in teacherStaff ? teacherStaff.businessUnitId || null : null,
      });
    }
  }
  const salaryWarning = await applyOptionalUserSalary(readyForRoles.admin, formData, staffId);
  if (salaryWarning) return { error: salaryWarning };

  const previousModules = [...target.modules].sort().join(",");
  const nextModules = [...parsed.data.modules].sort().join(",");
  const details = [
    target.roleCode !== parsed.data.roleCode
      ? `role ${target.roleName} → ${result.roleName}`
      : null,
    previousModules !== nextModules ? "business-unit access updated" : null,
    target.name !== parsed.data.name ? `name ${target.name} → ${parsed.data.name}` : null,
  ].filter(Boolean);

  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "user.updated",
    module: "users",
    description: `Updated user ${parsed.data.name}${details.length ? ` (${details.join("; ")})` : ""}`,
    severity: "medium",
    entityType: "user",
    entityId: userId,
    metadata: {
      previous_role: target.roleCode,
      next_role: parsed.data.roleCode,
    },
  });
  return {};
}

function personName(first: string, middle: string, last: string) {
  return [first, middle, last].filter(Boolean).join(" ");
}

export async function searchUnlinkedStaffAction(q: string): Promise<
  { ok: true; staff: StaffLinkStaffOption[] } | { ok: false; error: string }
> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { ok: false, error: ready.error };
  const businessUnitId = await schoolBusinessUnitId(ready.admin);
  if (!businessUnitId) return { ok: true, staff: [] };
  const needle = String(q ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 80);
  let query = ready.admin
    .from("sch_staff")
    .select("id, staff_number, first_name, middle_name, last_name, sch_staff_positions(name)")
    .eq("business_unit_id", businessUnitId)
    .is("profile_id", null)
    .eq("employment_status", "active")
    .order("last_name")
    .limit(12);
  if (needle) {
    query = query.or(`staff_number.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`);
  }
  const result = await query;
  if (result.error) return { ok: false, error: "Unable to search staff members." };
  return {
    ok: true,
    staff: (result.data ?? []).map((row) => {
      const position = row.sch_staff_positions as { name?: string } | { name?: string }[] | null;
      const positionName = Array.isArray(position) ? String(position[0]?.name ?? "") : String(position?.name ?? "");
      return {
        id: String(row.id),
        staffNumber: String(row.staff_number),
        name: personName(String(row.first_name ?? ""), String(row.middle_name ?? ""), String(row.last_name ?? "")),
        positionName,
      };
    }),
  };
}

export async function linkUserToStaffAction(input: {
  userId: string;
  staffId: string;
}): Promise<{ error?: string; staff?: LinkedStaffInfo }> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  const userId = String(input.userId ?? "").trim();
  const staffId = String(input.staffId ?? "").trim();
  if (!userId || !staffId) return { error: "Choose a user and a staff member." };
  const businessUnitId = await schoolBusinessUnitId(ready.admin);
  if (!businessUnitId) return { error: "School business unit was not found." };
  const existing = await ready.admin.from("sch_staff").select("id, staff_number").eq("profile_id", userId).maybeSingle();
  if (existing.data && String(existing.data.id) !== staffId) {
    return { error: `This account is already linked to ${formatCompactStaffNumber(String(existing.data.staff_number))}.` };
  }
  const linked = await setStaffProfileId(ready.admin, { staffId, profileId: userId, businessUnitId });
  if ("error" in linked) return { error: linked.error };
  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "school.staff_linked_user",
    module: "school",
    description: `Staff linked to user account · ${linked.staff.name}`,
    severity: "medium",
    entityType: "sch_staff",
    entityId: linked.staff.id,
    businessUnitId,
  });
  return { staff: linked.staff };
}

export async function createStaffProfileForUserAction(input: {
  userId: string;
  staffTypeId?: string;
  staffPositionId?: string;
  jobTitle?: string;
}): Promise<{ error?: string; staff?: LinkedStaffInfo }> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  const userId = String(input.userId ?? "").trim();
  if (!userId) return { error: "User was not found." };
  const profile = await ready.admin.from("profiles").select("id, full_name, email, phone, role_id").eq("id", userId).maybeSingle();
  if (!profile.data) return { error: "User was not found." };
  const schoolBuId = await schoolBusinessUnitId(ready.admin);
  const schoolRole = schoolBuId
    ? await ready.admin
        .from("user_module_roles")
        .select("role_id")
        .eq("user_id", userId)
        .eq("business_unit_id", schoolBuId)
        .maybeSingle()
    : { data: null };
  const result = await insertStaffForProfile(ready.admin, {
    profileId: userId,
    fullName: String(profile.data.full_name ?? ""),
    phone: String(profile.data.phone ?? ""),
    email: String(profile.data.email ?? ""),
    staffTypeId: String(input.staffTypeId ?? "").trim(),
    staffPositionId: String(input.staffPositionId ?? "").trim(),
    jobTitle: String(input.jobTitle ?? "").trim(),
    roleId: String(schoolRole.data?.role_id ?? ""),
  });
  if ("error" in result) return { error: result.error };
  revalidateUsersWorkspace();
  await writeAuditEvent({
    action: "school.staff_created",
    module: "school",
    description: `Staff created · ${result.staff.name}`,
    severity: "medium",
    entityType: "sch_staff",
    entityId: result.staff.id,
    businessUnitId: result.businessUnitId,
  });
  return { staff: result.staff };
}

export type { ManagedUser };
