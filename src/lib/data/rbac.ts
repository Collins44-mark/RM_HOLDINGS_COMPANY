import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOwnerRole } from "@/lib/auth/rbac";
import { applyOverrides } from "@/lib/auth/effective-access";
import { displayRoleName, roleDefaultPermissions, roleDefinition } from "@/lib/auth/role-options";
import {
  OPERABLE_PERMISSION_CATALOG,
  ROLE_CODES,
  ROLE_DEFINITIONS,
  catalogForModule,
  groupPermissions,
  isImplementedBusinessModule,
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

  const withModule = await db
    .from("roles")
    .select("id, code, name, description, module")
    .order("name", { ascending: true });
  const roleRows =
    withModule.error || !withModule.data
      ? await db.from("roles").select("id, code, name, description").order("name", { ascending: true })
      : withModule;
  const roles = roleRows.data;
  if (roleRows.error || !roles) return [];

  const { data: grants } = await db.from("role_permissions").select("role_id, permission_code");
  const byRole = new Map<string, string[]>();
  for (const row of grants ?? []) {
    const list = byRole.get(String(row.role_id)) ?? [];
    list.push(String(row.permission_code));
    byRole.set(String(row.role_id), list);
  }

  const ownerRows = (
    roles as Array<{ id: string; code: string; name: string; description: string | null; module: string | null }>
  ).filter((role) => isOwnerRole(role.code));
  const canonicalOwner =
    ownerRows.find((role) => role.code === "OWNER") ?? ownerRows[0] ?? null;

  const summaries: RoleSummary[] = [];
  for (const role of roles as Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    module: string | null;
  }>) {
    const summary = summaryFromRoleRow(role, byRole.get(role.id) ?? []);
    if (!summary) continue;
    if (isOwnerRole(role.code)) {
      if (!canonicalOwner || role.id !== canonicalOwner.id) continue;
    }
    summaries.push(summary);
  }

  return summaries.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function relatedRecord<T extends object>(value: unknown): T | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as T) : null;
}

function summaryFromRoleRow(
  role: { id: string; code: string; name: string; description: string | null; module?: string | null },
  storedCodes: string[] = [],
): RoleSummary | null {
  const definition = ROLE_DEFINITIONS.find((item) => item.code === role.code);
  if (role.code === ROLE_CODES.SCHOOL_ADMIN) return null;
  if (definition && !isVisibleRbacRole(definition)) return null;

  const inferred = definition ? moduleScopeForRole(definition) : null;
  const scope = role.module || (inferred && inferred !== "*" ? inferred : null);
  if (!definition) {
    if (!scope || !isImplementedBusinessModule(scope)) return null;
  }

  if (isOwnerRole(role.code)) {
    return {
      id: role.id,
      code: role.code,
      name: displayRoleName(role.code),
      description: "Full system access across RM Holdings.",
      moduleCount: 0,
      permissionCount: 0,
      moduleLabel: "All modules",
      moduleCode: null,
      permissionCodes: [],
      locked: true,
      slug: "owner",
    };
  }

  const editorScope = scope ?? (inferred === "*" ? null : inferred);
  const scopedCatalog = editorScope ? catalogForModule(editorScope) : OPERABLE_PERMISSION_CATALOG;
  const codes = (storedCodes.length ? storedCodes : definition ? permissionsForRole(definition) : []).filter((code) =>
    scopedCatalog.some((item) => item.code === code),
  );
  const moduleCode = editorScope ?? "platform";
  return {
    id: role.id,
    code: role.code,
    name: displayRoleName(role.code, role.name),
    description: descriptionFor(role.code, role.description),
    moduleCount: editorScope ? 1 : 0,
    permissionCount: codes.length,
    moduleLabel: editorScope ? permissionModuleLabel(editorScope) : "Platform",
    moduleCode,
    permissionCodes: codes,
    locked: false,
    slug: roleSlug(role.code),
  };
}

export async function getRolePermissionState(roleId: string): Promise<RolePermissionState | null> {
  const db = await client();
  if (!db) return null;
  const withModule = await db
    .from("roles")
    .select("id, code, name, description, module")
    .eq("id", roleId)
    .maybeSingle();
  const row =
    withModule.data ??
    (
      await db.from("roles").select("id, code, name, description").eq("id", roleId).maybeSingle()
    ).data;
  if (!row) return null;
  const role = summaryFromRoleRow(
    row as { id: string; code: string; name: string; description: string | null; module: string | null },
  );
  if (!role) return null;

  if (isOwnerRole(role.code) || role.locked) {
    return { role, permissionCodes: [] };
  }

  const definition = roleDefinition(role.code);
  const scope = role.moduleCode || (definition ? moduleScopeForRole(definition) : null);
  const scoped = new Set((scope && scope !== "*" ? catalogForModule(scope) : []).map((item) => item.code));

  const { data, error } = await db
    .from("role_permissions")
    .select("permission_code")
    .eq("role_id", roleId);
  if (error) {
    return {
      role: {
        ...role,
        permissionCount: definition ? permissionsForRole(definition).filter((code) => scoped.has(code)).length : 0,
      },
      permissionCodes: definition ? permissionsForRole(definition).filter((code) => scoped.has(code)) : [],
    };
  }
  const permissionCodes = (data ?? [])
    .map((item) => String(item.permission_code))
    .filter((code) => scoped.has(code));
  return {
    role: { ...role, permissionCount: permissionCodes.length },
    permissionCodes,
  };
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

  const [unitsResult, moduleRolesResult, overridesResult] = await Promise.all([
    db
      .from("user_business_units")
      .select("business_unit:business_units(code)")
      .eq("user_id", userId),
    db
      .from("user_module_roles")
      .select("business_unit:business_units(code), role:roles(code)")
      .eq("user_id", userId),
    db
      .from("user_permission_overrides")
      .select("permission_code, effect, business_unit:business_units(code)")
      .eq("user_id", userId),
  ]);

  const assignedUnitCodes = (unitsResult.data ?? [])
    .map((row) => relatedRecord<{ code?: string }>(row.business_unit)?.code)
    .filter((code): code is string => Boolean(code));

  const moduleRoles: Record<string, string> = {};
  for (const row of moduleRolesResult.data ?? []) {
    const unitCode = relatedRecord<{ code?: string }>(row.business_unit)?.code;
    const roleCode = relatedRecord<{ code?: string }>(row.role)?.code;
    if (unitCode && roleCode) moduleRoles[unitCode] = roleCode;
  }

  const role = relatedRecord<{ code?: string; name?: string }>(profile.role);
  const roleCode = role?.code ?? "STAFF";

  return {
    userId,
    name: String(profile.full_name),
    roleCode,
    roleName: displayRoleName(roleCode, role?.name ?? "Staff"),
    assignedUnitCodes,
    moduleRoles,
    overrides: (overridesResult.data ?? [])
      .map((row) => {
        const unitCode = relatedRecord<{ code?: string }>(row.business_unit)?.code;
        if (!unitCode) return null;
        return {
          businessUnitCode: unitCode,
          permissionCode: String(row.permission_code),
          effect: row.effect === "deny" ? ("deny" as const) : ("allow" as const),
        };
      })
      .filter((item): item is UserCustomization["overrides"][number] => Boolean(item)),
    effectivePermissions: [],
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
