import { cache } from "react";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { isAppDatabaseAvailable, prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";

const loadUnreadNotifications = cache(async (userId: string) => {
  if (!isAppDatabaseAvailable()) return [];
  return prisma.notification
    .findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 8,
    })
    .catch(() => []);
});

export async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const hideHeaderUtilities = pathname === "/supermarket/products/new";
  const notifications = hideHeaderUtilities ? [] : await loadUnreadNotifications(user.id);

  return (
    <AuthProvider user={user}>
      <AppShell
        user={user}
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
