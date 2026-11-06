import {
  getModuleFromPath,
  LOGIN_PATH,
  WORKSPACE_PATH,
} from "@/lib/config/app";
import {
  canAccessModule,
  canAccessOwnerPath,
  isFinanceRole,
  isOwnerRole,
  type AccessIdentity,
} from "@/lib/auth/rbac";
import { canAccessRoutePermissions } from "@/lib/auth/route-permissions";

export type { AccessIdentity };

export function hasModuleAccess(identity: AccessIdentity, moduleCode: string) {
  return canAccessModule(identity, moduleCode);
}

export function canAccessPath(identity: AccessIdentity, pathname: string) {
  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    return true;
  }
  if (pathname === "/change-password") {
    return true;
  }
  if (pathname === "/dashboard") {
    return canAccessOwnerPath(identity, "/owner");
  }
  if (pathname === WORKSPACE_PATH || pathname.startsWith(`${WORKSPACE_PATH}/`)) {
    return identity.modules.filter((item) => item !== "*").length > 1 || isOwnerRole(identity.role);
  }

  const moduleCode = getModuleFromPath(pathname);
  if (!moduleCode) return false;
  if (moduleCode === "owner") {
    return canAccessOwnerPath(identity, pathname);
  }
  if (!hasModuleAccess(identity, moduleCode)) return false;
  return canAccessRoutePermissions(identity, pathname);
}

const MODULE_ENTRY_PAGES: Record<string, string[]> = {
  livestock: ["/livestock", "/livestock/animals", "/livestock/houses", "/livestock/expenses", "/livestock/reports"],
  beekeeping: ["/beekeeping", "/beekeeping/hives", "/beekeeping/harvests", "/beekeeping/sales", "/beekeeping/reports"],
  property: [
    "/property",
    "/property/properties",
    "/property/units",
    "/property/tenants",
    "/property/contracts",
    "/property/invoices",
    "/property/hall-bookings",
    "/property/expenses",
    "/property/reports",
  ],
};

export function landingPathFor(identity: AccessIdentity) {
  if (isOwnerRole(identity.role)) return "/dashboard";

  const assigned = identity.modules.filter((item) => item !== "*");
  if (assigned.length === 1) {
    const pages = MODULE_ENTRY_PAGES[assigned[0]] ?? [`/${assigned[0]}`];
    return pages.find((path) => canAccessPath(identity, path)) ?? `/${assigned[0]}`;
  }
  if (assigned.length > 1) return WORKSPACE_PATH;

  if (isFinanceRole(identity.role) || identity.permissions.includes("platform.finance.view")) {
    return "/owner/finance";
  }

  if (canAccessOwnerPath(identity, "/owner")) return "/owner";
  return LOGIN_PATH;
}

export function defaultHomeFor(identity: AccessIdentity) {
  return landingPathFor(identity);
}

export function loginPathForRequest(_pathname?: string) {
  return LOGIN_PATH;
}

export function isPublicPath(pathname: string) {
  if (pathname === "/forbidden") return true;
  if (pathname === LOGIN_PATH) return true;
  if (pathname === "/offline" || pathname === "/offline-probe") return true;
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") return true;
  return pathname.endsWith("/login");
}

export {
  canAccessOwnerPath,
  canAccessModule,
  isOwnerRole,
  isSuperAdmin,
  isFinanceRole,
} from "@/lib/auth/rbac";
