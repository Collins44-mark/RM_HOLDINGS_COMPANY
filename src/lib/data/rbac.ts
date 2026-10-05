import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOwnerRole } from "@/lib/auth/rbac";
import { applyOverrides, resolveEffectiveAccess } from "@/lib/auth/effective-access";
import {
  OPERABLE_PERMISSION_CATALOG,
  ROLE_DEFINITIONS,
  groupPermissions,
  permissionsForRole,
} from "@/lib/config/permissions";
import { roleDefaultPermissions, roleDefinition } from "@/lib/auth/role-options";
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

  const liveCount = OPERABLE_PERMISSION_CATALOG.length;
  const liveModules = new Set(OPERABLE_PERMISSION_CATALOG.map((item) => item.module)).size;

  return (roles as Array<{ id: string; code: string; name: string; description: string | null }>).map(
    (role) => {
      if (isOwnerRole(role.code)) {
        return {
          id: role.id,
          code: role.code,
          name: role.name,
          description: descriptionFor(role.code, role.description),
          moduleCount: liveModules,
          permissionCount: liveCount,
        };
      }
      const stored = byRole.get(role.id);
      const codes =
        stored ??
        (ROLE_DEFINITIONS.find((item) => item.code === role.code)
          ? permissionsForRole(ROLE_DEFINITIONS.find((item) => item.code === role.code)!)
          : []);
      const modules = new Set(codes.map((code) => code.split(".")[0]).filter(Boolean));
      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: descriptionFor(role.code, role.description),
        moduleCount: modules.size,
        permissionCount: codes.length,
      };
    },
  );
}

export async function getRolePermissionState(roleId: string): Promise<RolePermissionState | null> {
  const summaries = await listRoleSummaries();
  const role = summaries.find((item) => item.id === roleId);
  if (!role) return null;
  const db = await client();
  if (!db) return null;

  if (isOwnerRole(role.code)) {
    return {
      role: { ...role, permissionCount: OPERABLE_PERMISSION_CATALOG.length },
      permissionCodes: OPERABLE_PERMISSION_CATALOG.map((item) => item.code),
    };
  }

  const { data, error } = await db
    .from("role_permissions")
    .select("permission_code")
    .eq("role_id", roleId);
  if (error) {
    const definition = roleDefinition(role.code);
    return {
      role,
      permissionCodes: definition ? permissionsForRole(definition) : [],
    };
  }
  return {
    role,
    permissionCodes: (data ?? []).map((row) => String(row.permission_code)),
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

  const access = await resolveEffectiveAccess(db, userId);
  const role = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  return {
    userId,
    name: profile.full_name as string,
    roleCode: access?.roleCode ?? (role as { code?: string } | null)?.code ?? "STAFF",
    roleName: access?.roleName ?? (role as { name?: string } | null)?.name ?? "Staff",
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
