import { unstable_cache } from "next/cache";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { isAppDatabaseAvailable, prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";

const loadUnreadNotifications = unstable_cache(
  async (userId: string) => {
    if (!isAppDatabaseAvailable()) return [];
    return prisma.notification
      .findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
      .catch(() => []);
  },
  ["shell-unread-notifications"],
  { revalidate: 30 },
);

/**
 * Shared authenticated chrome. Soft-nav latency is reduced by:
 * - proxy-only module ACL (ModuleGate is a passthrough)
 * - requireAuth without headers()
 * - JWT skipProfile + cached notifications
 * - segment loading.tsx skeletons
 */
export async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const notifications = await loadUnreadNotifications(user.id);

  return (
    <AuthProvider user={user}>
      <AppShell
        user={user}
        notifications={notifications.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          href: item.href,
          createdAt:
            typeof item.createdAt === "string"
              ? item.createdAt
              : item.createdAt.toISOString(),
        }))}
      >
        {children}
      </AppShell>
    </AuthProvider>
  );
}
