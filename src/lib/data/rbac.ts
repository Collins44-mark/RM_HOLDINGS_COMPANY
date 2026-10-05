import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOwnerRole } from "@/lib/auth/rbac";
import { applyOverrides, resolveEffectiveAccess } from "@/lib/auth/effective-access";
import { displayRoleName, roleDefaultPermissions, roleDefinition } from "@/lib/auth/role-options";
import {
  OPERABLE_PERMISSION_CATALOG,
  ROLE_DEFINITIONS,
  catalogForModule,
  groupPermissions,
  isVisibleRbacRole,
  moduleScopeForRole,
  permissionModuleLabel,
  permissionsForRole,
  roleSlug,
} from "@/lib/config/permissions";
import type { RoleSummary, UserCustomization } from "@/lib/auth/rbac-types";

export type { RoleSummary, UserCustomization };

export type RolePermissionState = {
  role: RoleSummary;
  permissionCodes: string[];
};

async function client() {
  const admin = createSupabaseAdminClient();
  return admin ?? (await createSupabaseServerClient());
}

function descriptionFor(code: string, dbDescription: string | null) {
  if (dbDescription?.trim()) return dbDescription.trim();
  return roleDefinition(code)?.description ?? "";
}

export async function listRoleSummaries(): Promise<RoleSummary[]> {
  const db = await client();
  if (!db) return [];

  const { data: roles, error } = await db
    .from("roles")
    .select("id, code, name, description")
    .order("name", { ascending: true });
  if (error || !roles) return [];

  const { data: grants } = await db.from("role_permissions").select("role_id, permission_code");
  const byRole = new Map<string, string[]>();
  for (const row of grants ?? []) {
    const list = byRole.get(String(row.role_id)) ?? [];
    list.push(String(row.permission_code));
    byRole.set(String(row.role_id), list);
  }

  const ownerRows = (
    roles as Array<{ id: string; code: string; name: string; description: string | null }>
  ).filter((role) => isOwnerRole(role.code));
  const canonicalOwner =
    ownerRows.find((role) => role.code === "OWNER") ?? ownerRows[0] ?? null;

  const summaries: RoleSummary[] = [];
  for (const role of roles as Array<{ id: string; code: string; name: string; description: string | null }>) {
    const definition = ROLE_DEFINITIONS.find((item) => item.code === role.code);
    if (!definition || !isVisibleRbacRole(definition)) continue;
    if (isOwnerRole(role.code)) {
      if (!canonicalOwner || role.id !== canonicalOwner.id) continue;
      summaries.push({
        id: role.id,
        code: role.code,
        name: displayRoleName(role.code),
        description: "Full system access across RM Holdings.",
        moduleCount: 0,
        permissionCount: 0,
        moduleLabel: "All modules",
        locked: true,
        slug: "owner",
      });
      continue;
    }

    const scope = moduleScopeForRole(definition);
    const scopedCatalog = scope && scope !== "*" ? catalogForModule(scope) : OPERABLE_PERMISSION_CATALOG;
    const stored = byRole.get(role.id);
    const codes = (stored ?? permissionsForRole(definition)).filter((code) =>
      scopedCatalog.some((item) => item.code === code),
    );
    summaries.push({
      id: role.id,
      code: role.code,
      name: displayRoleName(role.code, role.name),
      description: descriptionFor(role.code, role.description),
      moduleCount: scope ? 1 : 0,
      permissionCount: codes.length,
      moduleLabel: scope ? permissionModuleLabel(scope) : "Platform",
      locked: false,
      slug: roleSlug(role.code),
    });
  }

  return summaries.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getRolePermissionState(roleId: string): Promise<RolePermissionState | null> {
  const summaries = await listRoleSummaries();
  const role = summaries.find((item) => item.id === roleId);
  if (!role) return null;
  const db = await client();
  if (!db) return null;

  if (isOwnerRole(role.code)) {
    return {
      role,
      permissionCodes: [],
    };
  }

  const definition = roleDefinition(role.code);
  const scope = definition ? moduleScopeForRole(definition) : null;
  const scoped = new Set((scope ? catalogForModule(scope) : []).map((item) => item.code));

  const { data, error } = await db
    .from("role_permissions")
    .select("permission_code")
    .eq("role_id", roleId);
  if (error) {
    return {
      role,
      permissionCodes: definition ? permissionsForRole(definition).filter((code) => scoped.has(code)) : [],
    };
  }
  return {
    role,
    permissionCodes: (data ?? [])
      .map((row) => String(row.permission_code))
      .filter((code) => scoped.has(code)),
  };
}

export async function getRolePermissionStateBySlug(slug: string) {
  const summaries = await listRoleSummaries();
  const role = summaries.find((item) => item.slug === slug);
  if (!role) return null;
  return getRolePermissionState(role.id);
}

export async function getUserCustomization(userId: string): Promise<UserCustomization | null> {
  const db = await client();
  if (!db) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, role:roles(code, name)")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const access = await resolveEffectiveAccess(db, userId);
  const role = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  return {
    userId,
    name: profile.full_name as string,
    roleCode: access?.roleCode ?? (role as { code?: string } | null)?.code ?? "STAFF",
    roleName: displayRoleName(
      access?.roleCode ?? (role as { code?: string } | null)?.code ?? "STAFF",
      access?.roleName ?? (role as { name?: string } | null)?.name ?? "Staff",
    ),
    assignedUnitCodes: access?.modules.filter((code) => code !== "*") ?? [],
    moduleRoles: Object.fromEntries(
      (access?.moduleRoles ?? []).map((item) => [item.businessUnitCode, item.roleCode]),
    ),
    overrides: (access?.overrides ?? []).map((item) => ({
      businessUnitCode: item.businessUnitCode,
      permissionCode: item.permissionCode,
      effect: item.effect,
    })),
    effectivePermissions: access?.permissions ?? [],
  };
}

export { roleDefaultPermissions } from "@/lib/auth/role-options";

export function effectiveCodesForModule(input: {
  roleCode: string;
  unitCode: string;
  overrides: Array<{ businessUnitCode: string; permissionCode: string; effect: "allow" | "deny" }>;
}) {
  const granted = new Set(
    roleDefaultPermissions(input.roleCode).filter(
      (code) => code.split(".")[0] === input.unitCode,
    ),
  );
  applyOverrides(
    granted,
    input.overrides
      .filter((item) => item.businessUnitCode === input.unitCode)
      .map((item) => ({
        businessUnitId: item.businessUnitCode,
        businessUnitCode: item.businessUnitCode,
        permissionCode: item.permissionCode,
        effect: item.effect,
      })),
  );
  return granted;
}

export { groupPermissions };
