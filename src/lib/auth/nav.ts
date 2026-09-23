import type { AuthUser } from "@/lib/auth/types";
import type { NavItem } from "@/lib/config/navigation";
import { MODULE_NAV, buildOwnerNav } from "@/lib/config/navigation";
import { canAccessPath } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { isOwnerRole } from "@/lib/auth/rbac";
import { getBusinessUnit, getModuleFromPath, type ModuleCode } from "@/lib/config/app";
import { navIconForCode } from "@/lib/data/business-units";

export type NavBusinessUnit = {
  code: string;
  name: string;
  slug?: string;
};

export function filterNavForUser(items: NavItem[], user: AuthUser): NavItem[] {
  const identity = identityFromUser(user);

  return items.flatMap((item) => {
    if (!canAccessPath(identity, item.href)) return [];
    const children = item.children?.filter((child) => canAccessPath(identity, child.href));
    return [{ ...item, ...(item.children ? { children } : {}) }];
  });
}

export function consoleNavigation(
  user: AuthUser,
  moduleCode: ModuleCode,
  businessUnits?: NavBusinessUnit[],
) {
  if (isOwnerRole(user.roleCode)) {
    const unit = moduleCode === "owner" ? undefined : getBusinessUnit(moduleCode);
    return {
      nav: filterNavForUser(buildOwnerNav(businessUnits), user),
      workspace:
        unit && moduleCode !== "owner"
          ? {
              label: unit.name,
              items: filterNavForUser(MODULE_NAV[moduleCode] ?? [], user),
            }
          : undefined,
    };
  }

  return {
    nav: filterNavForUser(MODULE_NAV[moduleCode] ?? [], user),
    workspace: undefined,
  };
}

export function navigationForPath(
  user: AuthUser,
  pathname: string,
  businessUnits?: NavBusinessUnit[],
) {
  if (pathname === "/workspace" || pathname.startsWith("/workspace/")) {
    const nav: NavItem[] = [
      { href: "/workspace", label: "Workspaces", icon: "dashboard", exact: true },
      ...user.businessUnits.map((unit) => ({
        href: `/${unit.code}`,
        label: unit.name,
        icon: navIconForCode(unit.code),
      })),
    ];
    return { nav, workspace: undefined, moduleCode: undefined as ModuleCode | undefined };
  }

  const fromPath = getModuleFromPath(pathname);
  const assigned = user.modules.find((code) => code !== "*") as ModuleCode | undefined;
  const moduleCode: ModuleCode =
    fromPath ?? (isOwnerRole(user.roleCode) ? "owner" : assigned ?? "owner");
  const { nav, workspace } = consoleNavigation(user, moduleCode, businessUnits);
  return { nav, workspace, moduleCode };
}
