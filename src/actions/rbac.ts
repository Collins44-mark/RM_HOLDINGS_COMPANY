"use server";

import { revalidatePath, updateTag } from "next/cache";
import { BUSINESS_UNITS_CACHE_TAG } from "@/lib/data/business-units";
import { requireVerifiedOwner } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncUserAccessClaims } from "@/lib/auth/effective-access";
import {
  getRolePermissionState,
  getUserCustomization,
  listRoleSummaries,
  type RoleSummary,
  type UserCustomization,
} from "@/lib/data/rbac";
import {
  OPERABLE_PERMISSION_CATALOG,
  catalogForModule,
  isOperablePermission,
  moduleScopeForRole,
} from "@/lib/config/permissions";
import { writeAuditEvent } from "@/lib/audit";
import { isRoleAllowedForModules, displayRoleName, roleDefinition } from "@/lib/auth/role-options";

export type RbacActionState = { error?: string } | null;

function adminOrError() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  return { ok: true as const, admin };
}

function revalidateAccessSurfaces() {
  updateTag(BUSINESS_UNITS_CACHE_TAG);
  revalidatePath("/owner/users");
  revalidatePath("/", "layout");
}

export async function loadRoleSummariesAction(): Promise<RoleSummary[]> {
  await requireVerifiedOwner();
  return listRoleSummaries();
}

export async function loadRolePermissionStateAction(roleId: string) {
  await requireVerifiedOwner();
  return getRolePermissionState(roleId);
}

export async function loadUserCustomizationAction(userId: string): Promise<UserCustomization | null> {
  await requireVerifiedOwner();
  return getUserCustomization(userId);
}

export async function saveRolePermissionsAction(
  roleId: string,
  permissionCodes: string[],
): Promise<{ error?: string }> {
  await requireVerifiedOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const state = await getRolePermissionState(roleId);
  if (!state) return { error: "Role was not found." };
  if (isOwnerRole(state.role.code)) {
    return { error: "Owner access cannot be edited." };
  }

  const definition = roleDefinition(state.role.code);
  const scope = definition ? moduleScopeForRole(definition) : null;
  if (!scope || scope === "*") {
    return { error: "This role cannot be edited." };
  }
  const allowed = new Set(catalogForModule(scope).map((item) => item.code));
  const next = [...new Set(permissionCodes.filter((code) => allowed.has(code) && isOperablePermission(code)))];
  const previous = new Set(state.permissionCodes);
  const added = next.filter((code) => !previous.has(code));
  const removed = state.permissionCodes.filter((code) => !next.includes(code));

  await ready.admin.from("role_permissions").delete().eq("role_id", roleId);
  if (next.length) {
    const { error } = await ready.admin.from("role_permissions").insert(
      next.map((permission_code) => ({ role_id: roleId, permission_code })),
    );
    if (error) return { error: "Unable to save role permissions. Apply the latest database migration." };
  }

  const { data: holders } = await ready.admin.from("profiles").select("id").eq("role_id", roleId);
  const { data: moduleHolders } = await ready.admin
    .from("user_module_roles")
    .select("user_id")
    .eq("role_id", roleId);
  const userIds = new Set<string>([
    ...(holders ?? []).map((row) => String(row.id)),
    ...(moduleHolders ?? []).map((row) => String(row.user_id)),
  ]);
  for (const userId of userIds) {
    await syncUserAccessClaims(ready.admin, userId);
  }

  revalidateAccessSurfaces();
  if (added.length) {
    await writeAuditEvent({
      action: "role.permission.added",
      module: "users",
      description: `Added ${added.length} permission${added.length === 1 ? "" : "s"} to ${state.role.name}`,
      severity: "high",
      entityType: "role",
      entityId: roleId,
      metadata: { permissions: added },
    });
  }
  if (removed.length) {
    await writeAuditEvent({
      action: "role.permission.removed",
      module: "users",
      description: `Removed ${removed.length} permission${removed.length === 1 ? "" : "s"} from ${state.role.name}`,
      severity: "high",
      entityType: "role",
      entityId: roleId,
      metadata: { permissions: removed },
    });
  }
  await writeAuditEvent({
    action: "role.updated",
    module: "users",
    description: `Updated permissions for ${state.role.name}`,
    severity: "high",
    entityType: "role",
    entityId: roleId,
  });
  return {};
}

export async function saveUserCustomizationAction(input: {
  userId: string;
  unitCodes: string[];
  moduleRoles: Record<string, string>;
  overrides: Array<{ businessUnitCode: string; permissionCode: string; effect: "allow" | "deny" }>;
}): Promise<{ error?: string; modules?: string[]; roleName?: string }> {
  const actor = await requireVerifiedOwner();
  if (input.userId === actor.id) {
    return { error: "You cannot change your own role or module access." };
  }
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const { data: profile } = await ready.admin
    .from("profiles")
    .select("id, full_name, role:roles(id, code, name)")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile) return { error: "User was not found." };

  const currentRole = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  const currentRoleCode = (currentRole as { code?: string } | null)?.code ?? "STAFF";
  if (isOwnerRole(currentRoleCode)) {
    return { error: "Owner access cannot be customized from this screen." };
  }

  const uniqueUnits = [...new Set(input.unitCodes.filter(Boolean))];
  for (const code of uniqueUnits) {
    const roleCode = input.moduleRoles[code];
    if (!roleCode || !isRoleAllowedForModules(roleCode, [code])) {
      return { error: "Select a valid role for each assigned module." };
    }
    if (isOwnerRole(roleCode)) {
      return { error: "Owner cannot be assigned as a module role." };
    }
  }

  const { data: units } = await ready.admin.from("business_units").select("id, code, name");
  const unitRows = (units ?? []) as Array<{ id: string; code: string; name: string }>;
  const unitByCode = new Map(unitRows.map((unit) => [unit.code, unit]));
  const assigned = uniqueUnits
    .map((code) => unitByCode.get(code))
    .filter((unit): unit is { id: string; code: string; name: string } => Boolean(unit));

  const { data: roles } = await ready.admin.from("roles").select("id, code, name");
  const roleByCode = new Map(
    ((roles ?? []) as Array<{ id: string; code: string; name: string }>).map((role) => [role.code, role]),
  );

  const primaryRoleCode = assigned[0] ? input.moduleRoles[assigned[0].code] : currentRoleCode;
  const primaryRole = roleByCode.get(primaryRoleCode);
  if (!primaryRole) return { error: "Selected role was not found." };

  const { data: previousUnits } = await ready.admin
    .from("user_business_units")
    .select("business_unit_id")
    .eq("user_id", input.userId);
  const previousIds = new Set((previousUnits ?? []).map((row) => String(row.business_unit_id)));
  const nextIds = new Set(assigned.map((unit) => unit.id));

  const { error: profileError } = await ready.admin
    .from("profiles")
    .update({ role_id: primaryRole.id, updated_at: new Date().toISOString() })
    .eq("id", input.userId);
  if (profileError) return { error: "Unable to update the user profile." };

  await ready.admin.from("user_business_units").delete().eq("user_id", input.userId);
  if (assigned.length) {
    const { error } = await ready.admin.from("user_business_units").insert(
      assigned.map((unit) => ({ user_id: input.userId, business_unit_id: unit.id })),
    );
    if (error) return { error: "Unable to update module access." };
  }

  await ready.admin.from("user_module_roles").delete().eq("user_id", input.userId);
  if (assigned.length) {
    const rows = assigned
      .map((unit) => {
        const role = roleByCode.get(input.moduleRoles[unit.code] ?? "");
        if (!role) return null;
        return { user_id: input.userId, business_unit_id: unit.id, role_id: role.id };
      })
      .filter((row): row is { user_id: string; business_unit_id: string; role_id: string } => Boolean(row));
    if (rows.length) {
      const { error } = await ready.admin.from("user_module_roles").insert(rows);
      if (error) return { error: "Unable to save module roles. Apply the latest database migration." };
    }
  }

  const allowed = new Set(OPERABLE_PERMISSION_CATALOG.map((item) => item.code));
  await ready.admin.from("user_permission_overrides").delete().eq("user_id", input.userId);
  const overrideRows = input.overrides
    .map((item) => {
      const unit = unitByCode.get(item.businessUnitCode);
      if (!unit || !nextIds.has(unit.id)) return null;
      if (!allowed.has(item.permissionCode)) return null;
      if (item.permissionCode.split(".")[0] !== item.businessUnitCode) return null;
      return {
        user_id: input.userId,
        business_unit_id: unit.id,
        permission_code: item.permissionCode,
        effect: item.effect,
      };
    })
    .filter((row): row is {
      user_id: string;
      business_unit_id: string;
      permission_code: string;
      effect: "allow" | "deny";
    } => Boolean(row));

  if (overrideRows.length) {
    const { error } = await ready.admin.from("user_permission_overrides").insert(overrideRows);
    if (error) return { error: "Unable to save permission overrides. Apply the latest database migration." };
  }

  const claims = await syncUserAccessClaims(ready.admin, input.userId);
  if ("error" in claims) return { error: claims.error };

  const addedUnits = assigned.filter((unit) => !previousIds.has(unit.id));
  const removedUnits = unitRows.filter((unit) => previousIds.has(unit.id) && !nextIds.has(unit.id));

  revalidateAccessSurfaces();

  const name = String(profile.full_name);
  for (const unit of addedUnits) {
    await writeAuditEvent({
      action: "user.business_unit.assigned",
      module: "users",
      description: `Assigned ${name} to ${unit.name}`,
      severity: "medium",
      entityType: "user",
      entityId: input.userId,
      businessUnitId: unit.id,
    });
  }
  for (const unit of removedUnits) {
    await writeAuditEvent({
      action: "user.business_unit.removed",
      module: "users",
      description: `Removed ${name} from ${unit.name}`,
      severity: "medium",
      entityType: "user",
      entityId: input.userId,
      businessUnitId: unit.id,
    });
  }
  if (currentRoleCode !== primaryRole.code) {
    await writeAuditEvent({
      action: "user.role.changed",
      module: "users",
      description: `Changed ${name} role to ${primaryRole.name}`,
      severity: "high",
      entityType: "user",
      entityId: input.userId,
      metadata: { previous_role: currentRoleCode, next_role: primaryRole.code },
    });
  }
  if (overrideRows.length) {
    await writeAuditEvent({
      action: "user.permission_override.updated",
      module: "users",
      description: `Updated permission overrides for ${name}`,
      severity: "high",
      entityType: "user",
      entityId: input.userId,
      metadata: { count: String(overrideRows.length) },
    });
  }
  await writeAuditEvent({
    action: "user.access.customized",
    module: "users",
    description: `Customized access for ${name}`,
    severity: "high",
    entityType: "user",
    entityId: input.userId,
    metadata: { modules: assigned.map((unit) => unit.code) },
  });

  return { modules: claims.modules, roleName: displayRoleName(primaryRole.code, primaryRole.name) };
}
