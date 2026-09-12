import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { isAppDatabaseAvailable, prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import type { NavItem } from "@/lib/config/navigation";

export const dynamic = "force-dynamic";

const UNIT_ICONS: Record<string, string> = {
  rice: "wheat",
  farm: "tractor",
  supermarket: "cart",
  property: "building",
  livestock: "paw",
  school: "school",
  beekeeping: "hexagon",
};

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAuth();
  const assigned = user.businessUnits;
  if (assigned.length <= 1) {
    redirect(landingPathFor(identityFromUser(user)));
  }

  const nav: NavItem[] = [
    { href: "/workspace", label: "Workspaces", icon: "dashboard", exact: true },
    ...assigned.map((unit) => ({
      href: `/${unit.code}`,
      label: unit.name,
      icon: UNIT_ICONS[unit.code] ?? "building",
    })),
  ];

  const notifications = isAppDatabaseAvailable()
    ? await prisma.notification.findMany({
        where: { userId: user.id, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  return (
    <AuthProvider user={user}>
      <AppShell
        user={user}
        nav={nav}
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
