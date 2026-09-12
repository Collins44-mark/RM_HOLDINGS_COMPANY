import { FINANCE_ROLES, OWNER_ROLES, ROLE_CODES } from "@/lib/config/permissions";

export type AssignedBusinessUnit = {
  code: string;
  name: string;
};

export type AccessIdentity = {
  role: string;
  modules: string[];
  permissions: string[];
};

export function isOwnerRole(role: string) {
  return (OWNER_ROLES as readonly string[]).includes(role);
}

export function isFinanceRole(role: string) {
  return (FINANCE_ROLES as readonly string[]).includes(role);
}

export function isSuperAdmin(role: string) {
  return isOwnerRole(role);
}

export function hasPermission(identity: AccessIdentity, permission: string) {
  if (isOwnerRole(identity.role)) return true;
  if (identity.permissions.includes("*")) return true;
  if (identity.permissions.includes(permission)) return true;
  const [module] = permission.split(".");
  return identity.permissions.includes(`${module}.*`);
}

export function hasRole(identity: Pick<AccessIdentity, "role">, role: string) {
  return identity.role === role;
}

export function hasBusinessUnit(modules: string[], unit: string) {
  if (modules.includes("*")) return true;
  return modules.includes(unit);
}

export function canAccessModule(identity: AccessIdentity, moduleCode: string) {
  if (isOwnerRole(identity.role)) return true;
  if (moduleCode === "owner") {
    return (
      isFinanceRole(identity.role) || hasPermission(identity, "platform.dashboard.view")
    );
  }
  return hasBusinessUnit(identity.modules, moduleCode);
}

export function ownerRoutePermission(pathname: string): string | null {
  if (pathname.startsWith("/owner/users")) return "platform.users.view";
  if (pathname.startsWith("/owner/settings")) return "platform.settings.manage";
  if (pathname.startsWith("/owner/audit-logs")) return "platform.audit.view";
  if (pathname.startsWith("/owner/finance")) return "platform.finance.view";
  if (pathname.startsWith("/owner/reports")) return "platform.reports.view";
  if (pathname.startsWith("/owner/business-units")) return "platform.business_units.view";
  if (pathname === "/owner" || pathname === "/dashboard") return "platform.dashboard.view";
  return "platform.dashboard.view";
}

export function canAccessOwnerPath(identity: AccessIdentity, pathname: string) {
  if (isOwnerRole(identity.role)) return true;
  const permission = ownerRoutePermission(pathname);
  if (!permission) {
    return isFinanceRole(identity.role) || hasPermission(identity, "platform.dashboard.view");
  }
  return hasPermission(identity, permission);
}

export { ROLE_CODES };
