import {
  FINANCE_ROLES,
  OWNER_ROLES,
  ROLE_DEFINITIONS,
  type RoleCode,
  type RoleDefinition,
} from "@/lib/config/permissions";
import { BUSINESS_UNITS, type BusinessUnitCode } from "@/lib/config/app";

export const ALL_MODULES_VALUE = "*";

export function rolesForSelectedModules(moduleCodes: string[]): RoleDefinition[] {
  const allModules = moduleCodes.includes(ALL_MODULES_VALUE);
  if (allModules) {
    return ROLE_DEFINITIONS.filter(
      (role) =>
        (OWNER_ROLES as readonly string[]).includes(role.code) ||
        (FINANCE_ROLES as readonly string[]).includes(role.code) ||
        role.code === "BUSINESS_MANAGER" ||
        role.code === "STAFF",
    );
  }

  return ROLE_DEFINITIONS.filter((role) => {
    if ((OWNER_ROLES as readonly string[]).includes(role.code)) return false;
    if ((FINANCE_ROLES as readonly string[]).includes(role.code)) return false;
    if (role.modules.includes("*")) return true;
    if (role.modules.length === 0) return true;
    return moduleCodes.every((code) => role.modules.includes(code));
  });
}

export function isRoleAllowedForModules(roleCode: string, moduleCodes: string[]) {
  return rolesForSelectedModules(moduleCodes).some((role) => role.code === roleCode);
}

export function roleDefinition(code: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((role) => role.code === code);
}

export function permissionsForRoleCode(code: string) {
  const role = roleDefinition(code);
  if (!role) return [];
  if (role.permissionMatchers.includes("*")) return ["*"];
  return role.permissionMatchers;
}

export function modulesForAssignment(moduleCodes: string[]): BusinessUnitCode[] {
  if (moduleCodes.includes(ALL_MODULES_VALUE)) return [];
  return BUSINESS_UNITS.map((unit) => unit.code).filter((code) =>
    moduleCodes.includes(code),
  );
}

export type { RoleCode };
