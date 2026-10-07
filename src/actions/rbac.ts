"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireOwner } from "@/lib/auth/session";
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
import { ACCESS_CATALOG_CACHE_TAG } from "@/lib/data/app-users";
import {
  OPERABLE_PERMISSION_CATALOG,
  catalogForModule,
  isImplementedBusinessModule,
  isOperablePermission,
  moduleScopeForRole,
  permissionModuleLabel,
  roleSlug,
} from "@/lib/config/permissions";
import { writeAuditEvents, type WriteAuditEventInput } from "@/lib/audit";
import {
  canAssignCatalogRoleToModule,
  canAssignStoredRoleToModule,
  displayRoleName,
  roleDefinition,
} from "@/lib/auth/role-options";

export type RbacActionState = { error?: string } | null;

function adminOrError() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  return { ok: true as const, admin };
}

function actorOf(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}

export async function loadRoleSummariesAction(): Promise<RoleSummary[]> {
  await requireOwner();
  return listRoleSummaries();
}

export async function loadRolePermissionStateAction(roleId: string) {
  await requireOwner();
  return getRolePermissionState(roleId);
}

export async function loadUserCustomizationAction(userId: string): Promise<UserCustomization | null> {
  await requireOwner();
  return getUserCustomization(userId);
}

export async function saveRolePermissionsAction(
  roleId: string,
  permissionCodes: string[],
): Promise<{ error?: string }> {
  const actor = await requireOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const state = await getRolePermissionState(roleId);
  if (!state) return { error: "Role was not found." };
  if (isOwnerRole(state.role.code)) {
    return { error: "Owner access cannot be edited." };
  }

  const definition = roleDefinition(state.role.code);
  const scope = state.role.moduleCode || (definition ? moduleScopeForRole(definition) : null);
  if (!scope || scope === "*") {
    return { error: "This role cannot be edited." };
  }
  const allowed = new Set(catalogForModule(scope).map((item) => item.code));
  const next = [...new Set(permissionCodes.filter((code) => allowed.has(code) && isOperablePermission(code)))];
  const previous = new Set(state.permissionCodes);
  const added = next.filter((code) => !previous.has(code));
  const removed = state.permissionCodes.filter((code) => !next.includes(code));
  if (!added.length && !removed.length) {
    return {};
  }

  if (removed.length) {
    const { error } = await ready.admin
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .in("permission_code", removed);
    if (error) return { error: "Unable to save role permissions. Apply the latest database migration." };
  }
  if (added.length) {
    const { error } = await ready.admin.from("role_permissions").insert(
      added.map((permission_code) => ({ role_id: roleId, permission_code })),
    );
    if (error) return { error: "Unable to save role permissions. Apply the latest database migration." };
  }

  const [holders, moduleHolders] = await Promise.all([
    ready.admin.from("profiles").select("id").eq("role_id", roleId),
    ready.admin.from("user_module_roles").select("user_id").eq("role_id", roleId),
  ]);
  const userIds = [
    ...new Set([
      ...(holders.data ?? []).map((row) => String(row.id)),
      ...(moduleHolders.data ?? []).map((row) => String(row.user_id)),
    ]),
  ];
  if (userIds.length) {
    await Promise.all(userIds.map((userId) => syncUserAccessClaims(ready.admin, userId)));
  }

  const events: WriteAuditEventInput[] = [];
  if (added.length) {
    events.push({
      action: "role.permission.added",
      module: "users",
      description: `Added ${added.length} permission${added.length === 1 ? "" : "s"} to ${state.role.name}`,
      severity: "high",
      entityType: "role",
      entityId: roleId,
      metadata: { permissions: added },
      actor: actorOf(actor),
    });
  }
  if (removed.length) {
    events.push({
      action: "role.permission.removed",
      module: "users",
      description: `Removed ${removed.length} permission${removed.length === 1 ? "" : "s"} from ${state.role.name}`,
      severity: "high",
      entityType: "role",
      entityId: roleId,
      metadata: { permissions: removed },
      actor: actorOf(actor),
    });
  }
  events.push({
    action: "role.updated",
    module: "users",
    description:
      scope === "school"
        ? `School role updated · ${state.role.name}`
        : `Updated permissions for ${state.role.name}`,
    severity: "high",
    entityType: "role",
    entityId: roleId,
    actor: actorOf(actor),
  });
  await writeAuditEvents(events);
  return {};
}

function codeFromRoleName(name: string) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || "CUSTOM_ROLE";
}

export async function createCustomRoleAction(input: {
  name: string;
  description?: string;
  module: string;
}): Promise<{ error?: string; role?: RoleSummary }> {
  const actor = await requireOwner();
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };
  const name = input.name.trim();
  const moduleCode = input.module.trim();
  if (name.length < 2 || name.length > 80) {
    return { error: "Enter a role name." };
  }
  if (!isImplementedBusinessModule(moduleCode)) {
    return { error: "Select a module for this role." };
  }

  let code = codeFromRoleName(name);
  const existing = await ready.admin.from("roles").select("id, code, name");
  const usedCodes = new Set((existing.data ?? []).map((row) => String(row.code)));
  const usedNames = new Set((existing.data ?? []).map((row) => String(row.name).toLowerCase()));
  if (usedNames.has(name.toLowerCase())) {
    return { error: "A role with that name already exists." };
  }
  if (usedCodes.has(code)) {
    let suffix = 2;
    while (usedCodes.has(`${code}_${suffix}`)) suffix += 1;
    code = `${code}_${suffix}`;
  }

  const inserted = await ready.admin
    .from("roles")
    .insert({
      code,
      name,
      description: input.description?.trim() || null,
      is_system: false,
      module: moduleCode,
    })
    .select("id, code, name, description, module")
    .maybeSingle();
  if (inserted.error || !inserted.data) {
    return { error: "Unable to create the role. Apply the latest database migration." };
  }

  updateTag(ACCESS_CATALOG_CACHE_TAG);
  revalidatePath("/owner/users");
  await writeAuditEvents([
    {
      action: "role.created",
      module: "users",
      description:
        moduleCode === "school" ? `School role created · ${name}` : `Role created · ${name}`,
      severity: "medium",
      entityType: "role",
      entityId: String(inserted.data.id),
      metadata: { module: moduleCode, code },
      actor: actorOf(actor),
    },
  ]);

  return {
    role: {
      id: String(inserted.data.id),
      code: String(inserted.data.code),
      name: String(inserted.data.name),
      description: String(inserted.data.description ?? ""),
      moduleCount: 1,
      permissionCount: 0,
      moduleLabel: permissionModuleLabel(moduleCode),
      moduleCode,
      permissionCodes: [],
      locked: false,
      slug: roleSlug(String(inserted.data.code)),
    },
  };
}

export async function saveUserCustomizationAction(input: {
  userId: string;
  unitCodes: string[];
  moduleRoles: Record<string, string>;
  overrides: Array<{ businessUnitCode: string; permissionCode: string; effect: "allow" | "deny" }>;
}): Promise<{ error?: string; modules?: string[]; roleName?: string }> {
  const actor = await requireOwner();
  if (input.userId === actor.id) {
    return { error: "You cannot change your own role or module access." };
  }
  const ready = adminOrError();
  if (!ready.ok) return { error: ready.error };

  const uniqueUnits = [...new Set(input.unitCodes.filter(Boolean))];

  const [profileResult, unitsResult, rolesResult, previousUnitsResult, previousRolesResult, previousOverridesResult] =
    await Promise.all([
      ready.admin
        .from("profiles")
        .select("id, full_name, role:roles(id, code, name)")
        .eq("id", input.userId)
        .maybeSingle(),
      ready.admin.from("business_units").select("id, code, name"),
      ready.admin.from("roles").select("id, code, name, module"),
      ready.admin.from("user_business_units").select("business_unit_id").eq("user_id", input.userId),
      ready.admin
        .from("user_module_roles")
        .select("business_unit_id, role_id")
        .eq("user_id", input.userId),
      ready.admin
        .from("user_permission_overrides")
        .select("business_unit_id, permission_code, effect")
        .eq("user_id", input.userId),
    ]);

  const profile = profileResult.data;
  if (!profile) return { error: "User was not found." };

  const currentRole = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  const currentRoleCode = (currentRole as { code?: string } | null)?.code ?? "STAFF";
  if (isOwnerRole(currentRoleCode)) {
    return { error: "Owner access cannot be customized from this screen." };
  }

  const unitRows = (unitsResult.data ?? []) as Array<{ id: string; code: string; name: string }>;
  const unitByCode = new Map(unitRows.map((unit) => [unit.code, unit]));
  const assigned = uniqueUnits
    .map((code) => unitByCode.get(code))
    .filter((unit): unit is { id: string; code: string; name: string } => Boolean(unit));

  const roleByCode = new Map(
    ((rolesResult.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      module?: string | null;
    }>).map((role) => [role.code, role]),
  );
  const previousRoleByUnit = new Map(
    (previousRolesResult.data ?? []).map((row) => [String(row.business_unit_id), String(row.role_id)]),
  );
  const roleById = new Map([...roleByCode.values()].map((role) => [role.id, role]));

  for (const code of uniqueUnits) {
    const roleCode = input.moduleRoles[code];
    const stored = roleCode ? roleByCode.get(roleCode) : null;
    const unit = assigned.find((item) => item.code === code);
    const previousRole = unit ? roleById.get(previousRoleByUnit.get(unit.id) ?? "") : null;
    const allowLegacy = previousRole?.code === roleCode;
    if (
      !roleCode ||
      !stored ||
      isOwnerRole(roleCode) ||
      !(
        canAssignCatalogRoleToModule(roleCode, code) ||
        canAssignStoredRoleToModule(stored, code, { allowLegacy })
      )
    ) {
      return { error: "Select a valid role for each assigned module." };
    }
  }

  const primaryRoleCode = assigned[0] ? input.moduleRoles[assigned[0].code] : currentRoleCode;
  const primaryRole = roleByCode.get(primaryRoleCode);
  if (!primaryRole) return { error: "Selected role was not found." };

  const previousIds = new Set((previousUnitsResult.data ?? []).map((row) => String(row.business_unit_id)));
  const nextIds = new Set(assigned.map((unit) => unit.id));
  const nextRoleByUnit = new Map(
    assigned
      .map((unit) => {
        const role = roleByCode.get(input.moduleRoles[unit.code] ?? "");
        return role ? ([unit.id, role.id] as const) : null;
      })
      .filter((row): row is readonly [string, string] => Boolean(row)),
  );

  const allowed = new Set(OPERABLE_PERMISSION_CATALOG.map((item) => item.code));
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

  const previousOverrideKeys = new Set(
    (previousOverridesResult.data ?? []).map(
      (row) => `${row.business_unit_id}:${row.permission_code}:${row.effect}`,
    ),
  );
  const nextOverrideKeys = new Set(
    overrideRows.map((row) => `${row.business_unit_id}:${row.permission_code}:${row.effect}`),
  );
  const assignmentsChanged =
    previousIds.size !== nextIds.size || [...nextIds].some((id) => !previousIds.has(id));
  const moduleRolesChanged =
    previousRoleByUnit.size !== nextRoleByUnit.size ||
    [...nextRoleByUnit.entries()].some(([unitId, roleId]) => previousRoleByUnit.get(unitId) !== roleId);
  const overridesChanged =
    previousOverrideKeys.size !== nextOverrideKeys.size ||
    [...nextOverrideKeys].some((key) => !previousOverrideKeys.has(key));
  const roleChanged = currentRoleCode !== primaryRole.code;

  if (!assignmentsChanged && !moduleRolesChanged && !overridesChanged && !roleChanged) {
    return {
      modules: assigned.map((unit) => unit.code),
      roleName: displayRoleName(primaryRole.code, primaryRole.name),
    };
  }

  if (roleChanged) {
    const { error: profileError } = await ready.admin
      .from("profiles")
      .update({ role_id: primaryRole.id, updated_at: new Date().toISOString() })
      .eq("id", input.userId);
    if (profileError) return { error: "Unable to update the user profile." };
  }

  if (assignmentsChanged) {
    const { error: deleteError } = await ready.admin.from("user_business_units").delete().eq("user_id", input.userId);
    if (deleteError) return { error: "Unable to update module access." };
    if (assigned.length) {
      const { error } = await ready.admin.from("user_business_units").insert(
        assigned.map((unit) => ({ user_id: input.userId, business_unit_id: unit.id })),
      );
      if (error) return { error: "Unable to update module access." };
    }
  }

  if (assignmentsChanged || moduleRolesChanged) {
    const { error: deleteError } = await ready.admin.from("user_module_roles").delete().eq("user_id", input.userId);
    if (deleteError) return { error: "Unable to save module roles. Apply the latest database migration." };
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
  }

  if (overridesChanged || assignmentsChanged) {
    const { error: deleteError } = await ready.admin
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", input.userId);
    if (deleteError) return { error: "Unable to save permission overrides. Apply the latest database migration." };
    if (overrideRows.length) {
      const { error } = await ready.admin.from("user_permission_overrides").insert(overrideRows);
      if (error) return { error: "Unable to save permission overrides. Apply the latest database migration." };
    }
  }

  const claims = await syncUserAccessClaims(ready.admin, input.userId);
  if ("error" in claims) return { error: claims.error };

  const addedUnits = assigned.filter((unit) => !previousIds.has(unit.id));
  const removedUnits = unitRows.filter((unit) => previousIds.has(unit.id) && !nextIds.has(unit.id));
  const name = String(profile.full_name);
  const events: WriteAuditEventInput[] = [];
  for (const unit of addedUnits) {
    events.push({
      action: "user.business_unit.assigned",
      module: "users",
      description: `Assigned ${name} to ${unit.name}`,
      severity: "medium",
      entityType: "user",
      entityId: input.userId,
      businessUnitId: unit.id,
      actor: actorOf(actor),
    });
  }
  for (const unit of removedUnits) {
    events.push({
      action: "user.business_unit.removed",
      module: "users",
      description: `Removed ${name} from ${unit.name}`,
      severity: "medium",
      entityType: "user",
      entityId: input.userId,
      businessUnitId: unit.id,
      actor: actorOf(actor),
    });
  }
  if (roleChanged) {
    events.push({
      action: "user.role.changed",
      module: "users",
      description: `Changed ${name} role to ${primaryRole.name}`,
      severity: "high",
      entityType: "user",
      entityId: input.userId,
      metadata: { previous_role: currentRoleCode, next_role: primaryRole.code },
      actor: actorOf(actor),
    });
  }
  if (overridesChanged) {
    events.push({
      action: "user.permission_override.updated",
      module: "users",
      description: `Updated permission overrides for ${name}`,
      severity: "high",
      entityType: "user",
      entityId: input.userId,
      metadata: { count: String(overrideRows.length) },
      actor: actorOf(actor),
    });
  }
  events.push({
    action: "user.access.customized",
    module: "users",
    description: assigned.some((unit) => unit.code === "school")
      ? `School access updated · ${name}`
      : `Customized access for ${name}`,
    severity: "high",
    entityType: "user",
    entityId: input.userId,
    metadata: { modules: assigned.map((unit) => unit.code) },
    actor: actorOf(actor),
  });
  if (moduleRolesChanged) {
    const schoolUnit = assigned.find((unit) => unit.code === "school");
    const schoolRole = schoolUnit ? roleByCode.get(input.moduleRoles.school ?? "") : null;
    if (schoolRole) {
      events.push({
        action: "user.role.changed",
        module: "users",
        description: `School role assigned · ${name} → ${schoolRole.name}`,
        severity: "high",
        entityType: "user",
        entityId: input.userId,
        metadata: { module: "school", role: schoolRole.code },
        actor: actorOf(actor),
      });
    }
  }
  await writeAuditEvents(events);

  return { modules: claims.modules, roleName: displayRoleName(primaryRole.code, primaryRole.name) };
}
