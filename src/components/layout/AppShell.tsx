"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PageFooter } from "@/components/layout/PageFooter";
import { Sidebar } from "@/components/layout/Sidebar";
import { ModuleContextBar } from "@/components/layout/ModuleContextBar";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { navigationForPath } from "@/lib/auth/nav";
import { isOwnerRole } from "@/lib/auth/rbac";
import { SIDEBAR_WIDTH } from "@/lib/config/app";
import type { AuthUser } from "@/lib/auth/types";

export function AppShell({
  user,
  notifications,
  children,
}: {
  user: AuthUser;
  notifications: { id: string; title: string; body: string; href: string | null; createdAt: string }[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed();
  const pathname = usePathname();
  const sidebarWidth = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const isAddProductPage = pathname === "/supermarket/products/new";
  const showFooter = pathname !== "/owner" && pathname !== "/dashboard" && !isAddProductPage;
  const { nav, workspace, moduleCode } = navigationForPath(user, pathname);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#eef3f8]">
      <div
        className="hidden overflow-visible lg:fixed lg:bottom-3 lg:left-3 lg:top-3 lg:z-20 lg:flex transition-[width] duration-300 ease-out"
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
          <div className="relative h-full max-w-[85vw] overflow-hidden rounded-r-[28px] shadow-2xl" style={{ width: SIDEBAR_WIDTH.expanded }}>
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
        style={{ ["--sidebar-width" as string]: `${sidebarWidth + 12}px` }}
      >
        <Header
          user={user}
          notifications={notifications}
          sidebarCollapsed={collapsed}
          hideUtilities={isAddProductPage}
          onMenuClick={() => setMobileOpen(true)}
          onToggleSidebar={toggle}
        />
        <main className="relative z-10 min-w-0 flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-7 lg:py-6">
          {moduleCode && moduleCode !== "owner" && moduleCode !== "supermarket" ? (
            <ModuleContextBar
              moduleCode={moduleCode}
              showDashboardCrumb={isOwnerRole(user.roleCode)}
            />
          ) : null}
          {children}
        </main>
        {showFooter ? <PageFooter /> : null}
      </div>
    </div>
  );
}
