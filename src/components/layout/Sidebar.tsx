"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/branding/Logo";
import { NavGlyph } from "@/components/icons/nav-icons";
import { SIDEBAR_WIDTH } from "@/lib/config/app";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/config/navigation";

function isDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname === "/owner";
}

function isActive(pathname: string, href: string, exact?: boolean) {
  if (href === "/dashboard" || href === "/owner") return isDashboardPath(pathname);
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  nested = false,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href, item.exact);
  const childActive = item.children?.some((child) =>
    isActive(pathname, child.href, child.exact),
  );
  const [open, setOpen] = useState(Boolean(childActive));

  if (item.children?.length && !collapsed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] transition-colors duration-200",
            childActive || active
              ? "bg-nav-active text-white"
              : "text-white/78 hover:bg-white/[0.06] hover:text-white",
          )}
          aria-expanded={open}
        >
          <NavGlyph name={item.icon} className="h-[18px] w-[18px] shrink-0 text-current" />
          <span className="flex-1 font-medium">{item.label}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-white/70 transition-transform duration-200",
              open && "rotate-180",
            )}
            strokeWidth={1.8}
          />
        </button>
        {open ? (
          <div className="mt-1 space-y-0.5 pl-3">
            {item.children.map((child) => (
              <NavLink
                key={child.href}
                item={child}
                pathname={pathname}
                nested
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center rounded-[14px] text-[14px] font-medium transition-colors duration-200",
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
        nested && !collapsed && "py-2 text-[13px]",
        nested
          ? active
            ? "bg-white/[0.12] text-white"
            : "text-white/70 hover:bg-white/[0.06] hover:text-white"
          : active
            ? "bg-nav-active text-white"
            : "text-white/78 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <NavGlyph name={item.icon} className="h-[18px] w-[18px] shrink-0 text-current" />
      {collapsed ? (
        <>
          <span className="sr-only">{item.label}</span>
          <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-lg bg-[#0b2244] px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition duration-150 group-hover:opacity-100">
            {item.label}
          </span>
        </>
      ) : (
        <span>{item.label}</span>
      )}
    </Link>
  );
}

export function Sidebar({
  items,
  workspace,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  workspace?: { label: string; items: NavItem[] };
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <aside
      className="relative z-20 flex h-full flex-col bg-[#0b2244] text-white transition-[width] duration-300 ease-out"
      style={{ width }}
    >
      <div className={cn("relative px-5 pt-8 pb-6", collapsed && "px-3")}>
        <Logo stacked markOnly={collapsed} />
      </div>

      <nav
        className={cn(
          "relative flex-1 pb-6 pt-1",
          collapsed ? "overflow-visible px-2" : "overflow-y-auto overflow-x-visible px-3",
        )}
      >
        <div className="space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {workspace?.items.length ? (
          <div className="mt-4">
            <div className="mb-3 h-px bg-white/10" />
            {collapsed ? null : (
              <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
                {workspace.label}
              </p>
            )}
            <div className="space-y-1">
              {workspace.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
