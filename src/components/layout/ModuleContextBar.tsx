"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getBusinessUnit, type ModuleCode } from "@/lib/config/app";
import { MODULE_NAV, type NavItem } from "@/lib/config/navigation";
import { PageBackButton } from "@/components/ui/PageBackButton";

function navLabelForHref(href: string, items: NavItem[]): string | null {
  for (const item of items) {
    if (item.href === href) return item.label;
    if (item.children) {
      const nested = navLabelForHref(href, item.children);
      if (nested) return nested;
    }
  }
  return null;
}

function humanize(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function trail(
  moduleCode: Exclude<ModuleCode, "owner">,
  pathname: string,
  includeDashboard: boolean,
) {
  const unit = getBusinessUnit(moduleCode);
  const items: { href: string; label: string }[] = [];
  if (includeDashboard) {
    items.push({ href: "/dashboard", label: "Dashboard" });
  }
  items.push({ href: `/${moduleCode}`, label: unit?.name ?? humanize(moduleCode) });

  const extra = pathname.split("/").filter(Boolean).slice(1);
  let href = `/${moduleCode}`;
  for (const segment of extra) {
    href += `/${segment}`;
    items.push({
      href,
      label: navLabelForHref(href, MODULE_NAV[moduleCode] ?? []) ?? humanize(segment),
    });
  }
  return items;
}

export function ModuleContextBar({
  moduleCode,
  showDashboardCrumb,
}: {
  moduleCode: Exclude<ModuleCode, "owner">;
  showDashboardCrumb: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const root = `/${moduleCode}`;
  const isRoot = pathname === root;
  const crumbs = trail(moduleCode, pathname, showDashboardCrumb);

  return (
    <div className="mb-4 min-w-0">
      {isRoot ? null : (
        <PageBackButton onClick={() => router.back()} className="mb-3" />
      )}
      <nav
        aria-label="Breadcrumb"
        className={isRoot ? "break-words text-[12.5px] leading-5 text-slate-400" : "break-words text-[12.5px] leading-5 text-slate-400"}
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={crumb.href}>
              {index > 0 ? <span className="mx-1.5 text-slate-300">/</span> : null}
              {last ? (
                <span className="text-slate-500">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="transition hover:text-navy">
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
