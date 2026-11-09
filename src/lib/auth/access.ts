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
  school: [
    "/school",
    "/school/students",
    "/school/promotions",
    "/school/admissions",
    "/school/parents",
    "/school/classes",
    "/school/staff",
    "/school/subjects",
    "/school/exams-results",
    "/school/fees",
    "/school/expenses",
    "/school/store",
    "/school/transport",
    "/school/transport/buses",
    "/school/transport/drivers",
    "/school/transport/routes",
    "/school/transport/service",
    "/school/reports",
    "/school/settings",
  ],
  rice: [
    "/rice",
    "/rice/purchases",
    "/rice/milling",
    "/rice/warehouse",
    "/rice/customer-storage",
    "/rice/sales",
    "/rice/finance",
    "/rice/reports",
    "/rice/settings",
  ],
  farm: [
    "/farm",
    "/farm/tractors",
    "/farm/jobs",
    "/farm/operations",
    "/farm/fuel",
    "/farm/finance",
    "/farm/reports",
    "/farm/customers",
    "/farm/suppliers",
    "/farm/staff",
    "/farm/settings",
  ],
  supermarket: [
    "/supermarket",
    "/supermarket/pos",
    "/supermarket/sales",
    "/supermarket/returns",
    "/supermarket/products",
    "/supermarket/stock",
    "/supermarket/promotions",
    "/supermarket/purchasing",
    "/supermarket/finance",
    "/supermarket/reconciliation",
    "/supermarket/reports",
  ],
};

export function entryPathForModule(identity: AccessIdentity, moduleCode: string) {
  if (isOwnerRole(identity.role)) return `/${moduleCode}`;
  const root = `/${moduleCode}`;
  const pages = MODULE_ENTRY_PAGES[moduleCode] ?? [root];
  return pages.find((path) => canAccessPath(identity, path)) ?? (canAccessPath(identity, root) ? root : null);
}

export function landingPathFor(identity: AccessIdentity) {
  if (isOwnerRole(identity.role)) return "/dashboard";

  const assigned = identity.modules.filter((item) => item !== "*");
  if (assigned.length === 1) {
    return entryPathForModule(identity, assigned[0]) ?? "/forbidden";
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
