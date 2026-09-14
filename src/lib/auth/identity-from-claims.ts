import type { AccessIdentity } from "@/lib/auth/rbac";
import { isOwnerRole } from "@/lib/auth/rbac";
import { permissionsForRoleCode, roleDefinition } from "@/lib/auth/role-options";

const LEGACY_OWNER_IDENTITY: AccessIdentity = {
  role: "SUPER_ADMIN",
  modules: ["*"],
  permissions: ["*"],
};

export function identityFromAppMetadata(
  metadata: Record<string, unknown> | undefined | null,
): AccessIdentity | null {
  const role = typeof metadata?.role_code === "string" ? metadata.role_code : null;
  if (!role) return null;

  const rawModules = metadata?.modules;
  const modules = Array.isArray(rawModules)
    ? rawModules.filter((item): item is string => typeof item === "string")
    : roleDefinition(role)?.modules.length
      ? [...(roleDefinition(role)?.modules ?? [])]
      : [];

  if (isOwnerRole(role)) {
    return { role, modules: ["*"], permissions: ["*"] };
  }

  return {
    role,
    modules,
    permissions: permissionsForRoleCode(role),
  };
}

export function legacyOwnerIdentity() {
  return { ...LEGACY_OWNER_IDENTITY };
}
