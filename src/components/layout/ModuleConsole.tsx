import { isAppDatabaseAvailable, prisma } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { requireAuth, requireModuleAccess } from "@/lib/auth/session";
import { consoleNavigation } from "@/lib/auth/nav";
import { isOwnerRole } from "@/lib/auth/rbac";
import type { AuthUser } from "@/lib/auth/types";
import { BUSINESS_UNITS, type ModuleCode } from "@/lib/config/app";

function shellModuleForUser(user: AuthUser, fallback: ModuleCode): ModuleCode {
  if (isOwnerRole(user.roleCode)) return "owner";
  const assigned = user.modules.find((code) =>
    BUSINESS_UNITS.some((unit) => unit.code === code),
  );
  return (assigned as ModuleCode | undefined) ?? fallback;
}

export async function ModuleConsole({
  module: moduleCode,
  children,
  requireModule = true,
}: {
  module: ModuleCode;
  children: React.ReactNode;
  requireModule?: boolean;
}) {
  const user = requireModule ? await requireModuleAccess(moduleCode) : await requireAuth();
  const navModule = requireModule ? moduleCode : shellModuleForUser(user, moduleCode);
  const { nav, workspace } = consoleNavigation(user, navModule);
  const notifications = isAppDatabaseAvailable()
    ? await prisma.notification
        .findMany({
          where: { userId: user.id, isRead: false },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
        .catch(() => [])
    : [];

  return (
    <AuthProvider user={user}>
      <AppShell
        user={user}
        nav={nav}
        workspace={workspace}
        moduleCode={navModule}
        showGroupCrumb={isOwnerRole(user.roleCode)}
        notifications={notifications.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          href: item.href,
          createdAt: item.createdAt.toISOString(),
        }))}
      >
        {children}
      </AppShell>
    </AuthProvider>
  );
}
