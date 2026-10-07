import {
  FINANCE_ROLES,
  OWNER_DISPLAY_NAME,
  OWNER_ROLES,
  ROLE_CODES,
  ROLE_DEFINITIONS,
  isImplementedBusinessModule,
  isVisibleRbacRole,
  permissionsForRole,
  roleSlug,
  type RoleCode,
  type RoleDefinition,
} from "@/lib/config/permissions";
import { BUSINESS_UNITS, type BusinessUnitCode } from "@/lib/config/app";
import { isOwnerRole } from "@/lib/auth/rbac";
import { OPERABLE_PERMISSION_CATALOG } from "@/lib/config/permissions";

export const ALL_MODULES_VALUE = "*";

export function displayRoleName(code: string, fallback?: string) {
  if (isOwnerRole(code)) return OWNER_DISPLAY_NAME;
  return roleDefinition(code)?.name ?? fallback ?? code;
}

export function rolesForSelectedModules(moduleCodes: string[]): RoleDefinition[] {
  const allModules = moduleCodes.includes(ALL_MODULES_VALUE);
  const selected = allModules
    ? ROLE_DEFINITIONS.filter(
        (role) =>
          (OWNER_ROLES as readonly string[]).includes(role.code) ||
          (FINANCE_ROLES as readonly string[]).includes(role.code) ||
          role.code === "BUSINESS_MANAGER" ||
          role.code === "STAFF",
      )
    : ROLE_DEFINITIONS.filter((role) => {
        if ((OWNER_ROLES as readonly string[]).includes(role.code)) return false;
        if ((FINANCE_ROLES as readonly string[]).includes(role.code)) return false;
        if (role.code === ROLE_CODES.SCHOOL_ADMIN) return false;
        if (!isVisibleRbacRole(role) && role.code !== "STAFF") return false;
        if (role.modules.includes("*")) return true;
        const implemented = moduleCodes.filter((code) => isImplementedBusinessModule(code));
        if (!implemented.length) return role.code === "BUSINESS_MANAGER" || role.code === "STAFF";
        if (implemented.length === 1) {
          if (!role.modules.includes(implemented[0])) return false;
          return !role.modules.some(
            (module) => isImplementedBusinessModule(module) && module !== implemented[0],
          );
        }
        return implemented.every((code) => role.modules.includes(code));
      });

  const hasCanonicalOwner = selected.some((role) => role.code === ROLE_CODES.OWNER);
  return selected.filter((role) => !isOwnerRole(role.code) || role.code === ROLE_CODES.OWNER || !hasCanonicalOwner);
}

export function isRoleAllowedForModules(roleCode: string, moduleCodes: string[]) {
  return rolesForSelectedModules(moduleCodes).some((role) => role.code === roleCode);
}

export function canAssignCatalogRoleToModule(roleCode: string, moduleCode: string) {
  if (isOwnerRole(roleCode)) return false;
  if (roleCode === ROLE_CODES.SCHOOL_ADMIN) return false;
  return isRoleAllowedForModules(roleCode, [moduleCode]);
}

export function canAssignStoredRoleToModule(
  role: { code: string; module?: string | null },
  moduleCode: string,
  options?: { allowLegacy?: boolean },
) {
  if (canAssignCatalogRoleToModule(role.code, moduleCode)) return true;
  if (options?.allowLegacy && role.code === ROLE_CODES.SCHOOL_ADMIN && moduleCode === "school") return true;
  return role.module === moduleCode && !isOwnerRole(role.code) && role.code !== ROLE_CODES.SCHOOL_ADMIN;
}

export function assignableRoleOptions(
  moduleCode: string,
  catalog: Array<{ code: string; name: string; moduleCode?: string | null; locked?: boolean }>,
) {
  const fromCatalog = catalog.filter((role) => !role.locked && role.moduleCode === moduleCode);
  if (fromCatalog.length) {
    return fromCatalog.map((role) => ({ code: role.code, name: displayRoleName(role.code, role.name) }));
  }
  return rolesForSelectedModules([moduleCode]).map((role) => ({
    code: role.code,
    name: displayRoleName(role.code, role.name),
  }));
}

export function rolePermissionDefaults(
  roleCode: string,
  moduleCode: string,
  catalog?: Array<{ code: string; permissionCodes?: string[] }>,
) {
  const stored = catalog?.find((role) => role.code === roleCode)?.permissionCodes;
  if (stored?.length) {
    return stored.filter((code) => code.split(".")[0] === moduleCode);
  }
  return roleDefaultPermissions(roleCode).filter((code) => code.split(".")[0] === moduleCode);
}

export function roleDefinition(code: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((role) => role.code === code);
}

export function permissionsForRoleCode(code: string) {
  const role = roleDefinition(code);
  if (!role) return [];
  if (role.permissionMatchers.includes("*")) return ["*"];
  return permissionsForRole(role);
}

export function roleDefaultPermissions(roleCode: string) {
  if (isOwnerRole(roleCode)) return OPERABLE_PERMISSION_CATALOG.map((item) => item.code);
  const definition = roleDefinition(roleCode);
  return definition ? permissionsForRole(definition) : [];
}

export function modulesForAssignment(moduleCodes: string[]): BusinessUnitCode[] {
  if (moduleCodes.includes(ALL_MODULES_VALUE)) return [];
  return BUSINESS_UNITS.map((unit) => unit.code).filter((code) =>
    moduleCodes.includes(code),
  );
}

export function assignedCodesForRole(roleCode: string, moduleCodes: string[]): BusinessUnitCode[] {
  if (isOwnerRole(roleCode) && moduleCodes.includes(ALL_MODULES_VALUE)) return [];
  if (moduleCodes.includes(ALL_MODULES_VALUE)) {
    return BUSINESS_UNITS.map((unit) => unit.code);
  }
  return modulesForAssignment(moduleCodes);
}

export function metadataModulesForRole(roleCode: string, moduleCodes: string[]) {
  if (isOwnerRole(roleCode)) return [ALL_MODULES_VALUE];
  return assignedCodesForRole(roleCode, moduleCodes);
}

export { roleSlug };
export type { RoleCode };
