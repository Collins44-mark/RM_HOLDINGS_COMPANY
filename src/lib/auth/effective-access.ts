import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnerRole } from "@/lib/auth/rbac";
import { displayRoleName, permissionsForRoleCode } from "@/lib/auth/role-options";
import {
  OPERABLE_PERMISSION_CATALOG,
  isOperablePermission,
} from "@/lib/config/permissions";

export type ModuleRoleAssignment = {
  businessUnitId: string;
  businessUnitCode: string;
  businessUnitName: string;
  roleId: string;
  roleCode: string;
  roleName: string;
};

export type PermissionOverrideRecord = {
  businessUnitId: string;
  businessUnitCode: string;
  permissionCode: string;
  effect: "allow" | "deny";
};

export type EffectiveAccess = {
  roleCode: string;
  roleName: string;
  modules: string[];
  permissions: string[];
  moduleRoles: ModuleRoleAssignment[];
  overrides: PermissionOverrideRecord[];
};

type RoleRow = { id: string; code: string; name: string };

function asRole(value: unknown): RoleRow | null {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object") return null;
  const row = item as { id?: string; code?: string; name?: string };
  if (!row.id || !row.code || !row.name) return null;
  return { id: row.id, code: row.code, name: row.name };
}

function permissionModule(code: string) {
  return code.split(".")[0] ?? "";
}

function fallbackRolePermissions(roleCode: string) {
  if (isOwnerRole(roleCode)) return ["*"];
  return permissionsForRoleCode(roleCode).filter((code) => code !== "*" && isOperablePermission(code));
}

async function loadRolePermissionMap(client: SupabaseClient, roleIds?: string[]) {
  const ids = [...new Set((roleIds ?? []).filter(Boolean))];
  if (roleIds && ids.length === 0) return new Map<string, string[]>();
  let query = client.from("role_permissions").select("role_id, permission_code");
  if (ids.length) query = query.in("role_id", ids);
  const { data, error } = await query;
  if (error) return null;
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const roleId = String(row.role_id);
    const code = String(row.permission_code);
    const list = map.get(roleId) ?? [];
    list.push(code);
    map.set(roleId, list);
  }
  return map;
}

export function applyOverrides(
  granted: Set<string>,
  overrides: PermissionOverrideRecord[],
  unitId?: string,
) {
  for (const override of overrides) {
    if (unitId && override.businessUnitId !== unitId) continue;
    if (override.effect === "allow") granted.add(override.permissionCode);
    if (override.effect === "deny") granted.delete(override.permissionCode);
  }
  return granted;
}

export async function resolveEffectiveAccess(
  client: SupabaseClient,
  userId: string,
): Promise<EffectiveAccess | null> {
  const { data, error } = await client
    .from("profiles")
    .select(
      `
      id,
      role:roles(id, code, name),
      business_units:user_business_units(
        business_unit:business_units(id, code, name)
      )
    `,
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const role = asRole(data.role) ?? { id: "", code: "STAFF", name: "Staff" };
  const units = ((data.business_units ?? []) as Array<{ business_unit?: unknown }>)
    .map((item) => {
      const unit = Array.isArray(item.business_unit) ? item.business_unit[0] : item.business_unit;
      if (!unit || typeof unit !== "object") return null;
      const row = unit as { id?: string; code?: string; name?: string };
      if (!row.id || !row.code || !row.name) return null;
      return { id: row.id, code: row.code, name: row.name };
    })
    .filter((item): item is { id: string; code: string; name: string } => Boolean(item));

  if (isOwnerRole(role.code)) {
    return {
      roleCode: role.code,
      roleName: displayRoleName(role.code, role.name),
      modules: ["*"],
      permissions: ["*"],
      moduleRoles: [],
      overrides: [],
    };
  }

  const [moduleRoleResult, overrideResult] = await Promise.all([
    client
      .from("user_module_roles")
      .select("business_unit_id, role:roles(id, code, name)")
      .eq("user_id", userId),
    client
      .from("user_permission_overrides")
      .select("business_unit_id, permission_code, effect")
      .eq("user_id", userId),
  ]);

  const moduleRoleByUnit = new Map<string, RoleRow>();
  for (const row of moduleRoleResult.data ?? []) {
    const assigned = asRole(row.role);
    if (assigned) moduleRoleByUnit.set(String(row.business_unit_id), assigned);
  }

  const roleIds = [
    role.id,
    ...[...moduleRoleByUnit.values()].map((item) => item.id),
  ].filter(Boolean);
  const rolePermMap = await loadRolePermissionMap(client, roleIds);

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const overrides: PermissionOverrideRecord[] = (overrideResult.data ?? [])
    .map((row) => {
      const unit = unitById.get(String(row.business_unit_id));
      if (!unit) return null;
      const effect = row.effect === "deny" ? "deny" : "allow";
      return {
        businessUnitId: unit.id,
        businessUnitCode: unit.code,
        permissionCode: String(row.permission_code),
        effect,
      } satisfies PermissionOverrideRecord;
    })
    .filter((item): item is PermissionOverrideRecord => Boolean(item));

  const granted = new Set<string>();
  const globalPerms = rolePermMap?.get(role.id) ?? fallbackRolePermissions(role.code);
  for (const code of globalPerms) {
    if (code === "*" || permissionModule(code) === "platform") granted.add(code);
  }

  const moduleRoles: ModuleRoleAssignment[] = units.map((unit) => {
    const assigned = moduleRoleByUnit.get(unit.id) ?? role;
    const unitPerms = rolePermMap?.get(assigned.id) ?? fallbackRolePermissions(assigned.code);
    for (const code of unitPerms) {
      if (code === "*" || permissionModule(code) === unit.code) granted.add(code);
    }
    applyOverrides(granted, overrides, unit.id);
    return {
      businessUnitId: unit.id,
      businessUnitCode: unit.code,
      businessUnitName: unit.name,
      roleId: assigned.id,
      roleCode: assigned.code,
      roleName: displayRoleName(assigned.code, assigned.name),
    };
  });

  const live = new Set(OPERABLE_PERMISSION_CATALOG.map((item) => item.code));
  const permissions = [...granted].filter((code) => code !== "*" && live.has(code));

  return {
    roleCode: role.code,
    roleName: displayRoleName(role.code, role.name),
    modules: units.map((unit) => unit.code),
    permissions,
    moduleRoles,
    overrides,
  };
}

export async function syncUserAccessClaims(
  admin: SupabaseClient,
  userId: string,
): Promise<{ roleCode: string; modules: string[]; permissions: string[] } | { error: string }> {
  const access = await resolveEffectiveAccess(admin, userId);
  if (!access) return { error: "Unable to resolve user access." };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      role_code: access.roleCode,
      modules: access.modules,
      permissions: access.permissions,
    },
  });
  if (error) return { error: "Unable to update access claims." };
  return { roleCode: access.roleCode, modules: access.modules, permissions: access.permissions };
}
