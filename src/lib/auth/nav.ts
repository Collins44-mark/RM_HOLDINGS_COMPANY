import type { AuthUser } from "@/lib/auth/types";
import type { NavItem } from "@/lib/config/navigation";
import { MODULE_NAV, buildOwnerNav } from "@/lib/config/navigation";
import { canAccessPath } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { isOwnerRole } from "@/lib/auth/rbac";
import { getBusinessUnit, getModuleFromPath, type ModuleCode } from "@/lib/config/app";
import { navIconForCode } from "@/lib/data/business-units";

export type SearchIndexItem = { label: string; href: string; group: string };

function flattenSearchItems(items: NavItem[], group: string): SearchIndexItem[] {
  return items.flatMap((item) => [
    { label: item.label, href: item.href, group },
    ...(item.children?.length ? flattenSearchItems(item.children, group) : []),
  ]);
}

export function searchIndexForUser(user: AuthUser): SearchIndexItem[] {
  const identity = identityFromUser(user);
  const seen = new Set<string>();
  const entries: SearchIndexItem[] = [
    ...flattenSearchItems(buildOwnerNav(), "Platform"),
    ...Object.entries(MODULE_NAV)
      .filter(([code]) => code !== "owner")
      .flatMap(([code, items]) => flattenSearchItems(items, code)),
  ];
  return entries.filter((item) => {
    if (seen.has(item.href) || !canAccessPath(identity, item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export type NavBusinessUnit = {
  code: string;
  name: string;
  slug?: string;
};

export function filterNavForUser(items: NavItem[], user: AuthUser): NavItem[] {
  const identity = identityFromUser(user);

  return items.flatMap((item) => {
    const children = item.children?.length
      ? filterNavForUser(item.children, user)
      : undefined;
    const selfVisible = canAccessPath(identity, item.href);
    if (children && children.length > 0) {
      return [
        {
          ...item,
          href: selfVisible ? item.href : children[0].href,
          children,
        },
      ];
    }
    if (selfVisible) {
      return [{ ...item, ...(item.children ? { children: [] } : {}) }];
    }
    return [];
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
    const identity = identityFromUser(user);
    const nav: NavItem[] = [
      { href: "/workspace", label: "Workspaces", icon: "dashboard", exact: true },
      ...user.businessUnits
        .filter((unit) => canAccessPath(identity, `/${unit.code}`))
        .map((unit) => ({
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
