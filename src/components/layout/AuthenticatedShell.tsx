import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { isAppDatabaseAvailable, prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";

export async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
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
