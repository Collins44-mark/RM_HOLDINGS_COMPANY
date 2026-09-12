"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PageFooter } from "@/components/layout/PageFooter";
import { Sidebar } from "@/components/layout/Sidebar";
import { ModuleContextBar } from "@/components/layout/ModuleContextBar";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { SIDEBAR_WIDTH, type ModuleCode } from "@/lib/config/app";
import type { AuthUser } from "@/lib/auth/types";
import type { NavItem } from "@/lib/config/navigation";

export function AppShell({
  user,
  nav,
  workspace,
  moduleCode,
  showGroupCrumb = false,
  notifications,
  children,
}: {
  user: AuthUser;
  nav: NavItem[];
  workspace?: { label: string; items: NavItem[] };
  moduleCode?: ModuleCode;
  showGroupCrumb?: boolean;
  notifications: { id: string; title: string; body: string; href: string | null; createdAt: string }[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const pathname = usePathname();
  const sidebarWidth = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const showFooter = pathname !== "/owner" && pathname !== "/dashboard";

  return (
    <div className="relative min-h-screen">
      <div
        className="hidden overflow-visible lg:fixed lg:inset-y-0 lg:z-20 lg:flex transition-[width] duration-300 ease-out"
        style={{ width: sidebarWidth }}
      >
        <Sidebar items={nav} workspace={workspace} collapsed={collapsed} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full shadow-2xl" style={{ width: SIDEBAR_WIDTH.expanded }}>
            <Sidebar
              items={nav}
              workspace={workspace}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div
        className="relative flex min-h-screen flex-col overflow-x-hidden transition-[padding-left] duration-300 ease-out lg:pl-[var(--sidebar-width)]"
        style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.9),transparent_64%)]" />
        </div>
        <Header
          user={user}
          notifications={notifications}
          sidebarCollapsed={collapsed}
          onMenuClick={() => setMobileOpen(true)}
          onToggleSidebar={toggle}
        />
        <main className="relative z-10 flex-1 px-4 py-5 lg:px-7 lg:py-6">
          {moduleCode && moduleCode !== "owner" ? (
            <ModuleContextBar
              moduleCode={moduleCode}
              showDashboardCrumb={showGroupCrumb}
            />
          ) : null}
          {children}
        </main>
        {showFooter ? <PageFooter /> : null}
      </div>
    </div>
  );
}
