import { prisma } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { requireModuleAccess } from "@/lib/auth/session";
import { consoleNavigation } from "@/lib/auth/nav";
import { isOwnerRole } from "@/lib/auth/rbac";
import type { ModuleCode } from "@/lib/config/app";

export const dynamic = "force-dynamic";

export async function ModuleConsole({
  module: moduleCode,
  children,
}: {
  module: ModuleCode;
  children: React.ReactNode;
}) {
  const user = await requireModuleAccess(moduleCode);
  const { nav, workspace } = consoleNavigation(user, moduleCode);
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id, isRead: false },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return (
    <AuthProvider user={user}>
      <AppShell
        user={user}
        nav={nav}
        workspace={workspace}
        moduleCode={moduleCode}
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
