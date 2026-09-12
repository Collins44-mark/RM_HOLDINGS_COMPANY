import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { LOGIN_PATH } from "@/lib/config/app";
import { canAccessPath, defaultHomeFor } from "@/lib/auth/access";
import { isOwnerRole } from "@/lib/auth/rbac";
import { toAuthUser } from "@/lib/auth/profile";
import { identityFromUser, type AuthUser } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModuleCode } from "@/lib/config/app";

export type { AuthUser } from "@/lib/auth/types";
export { identityFromUser } from "@/lib/auth/types";

const SUPER_ADMIN_IDENTITY = {
  roleCode: "SUPER_ADMIN",
  roleName: "Super Admin",
  modules: ["*"],
  permissions: ["*"],
} as const;

const profileInclude = {
  role: {
    include: {
      permissions: { include: { permission: true } },
    },
  },
  businessUnits: { include: { businessUnit: true } },
  permissions: { include: { permission: true } },
} as const;

async function findProfile(input: { authUid?: string | null; email?: string | null }) {
  const authUid = input.authUid?.trim() || null;
  const email = input.email?.toLowerCase().trim() || null;
  if (!authUid && !email) return null;

  try {
    return await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          ...(authUid ? [{ authUid }, { id: authUid }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      include: profileInclude,
    });
  } catch {
    return null;
  }
}

function authUserFromSupabase(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    user.email?.split("@")[0] ||
    "Super Admin";

  return {
    id: user.id,
    authUid: user.id,
    email: user.email?.toLowerCase() ?? "",
    name: fullName,
    title: typeof metadata.title === "string" ? metadata.title : "Super Admin",
    phone: typeof metadata.phone === "string" ? metadata.phone : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    roleCode: SUPER_ADMIN_IDENTITY.roleCode,
    roleName: SUPER_ADMIN_IDENTITY.roleName,
    modules: [...SUPER_ADMIN_IDENTITY.modules],
    businessUnits: [],
    permissions: [...SUPER_ADMIN_IDENTITY.permissions],
    isActive: true,
    sessionId: user.id,
  };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const profile = await findProfile({
    authUid: user.id,
    email: user.email,
  });

  if (!profile) {
    return authUserFromSupabase(user);
  }

  const hydrated = toAuthUser(profile, user.id);
  return {
    ...hydrated,
    authUid: user.id,
    sessionId: user.id,
    roleCode: SUPER_ADMIN_IDENTITY.roleCode,
    roleName: isOwnerRole(hydrated.roleCode)
      ? hydrated.roleName
      : SUPER_ADMIN_IDENTITY.roleName,
    modules: [...SUPER_ADMIN_IDENTITY.modules],
    permissions: [...SUPER_ADMIN_IDENTITY.permissions],
  };
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export async function requireModuleAccess(moduleCode: ModuleCode | string) {
  const user = await getAuthUser();
  if (!user) redirect(LOGIN_PATH);

  const identity = identityFromUser(user);
  const path = moduleCode === "owner" ? "/owner" : `/${moduleCode}`;
  if (!canAccessPath(identity, path)) {
    redirect("/forbidden");
  }

  return user;
}

export async function requireOwner() {
  return requireModuleAccess("owner");
}

export async function requirePermission(permission: string) {
  const user = await requireAuth();
  if (isOwnerRole(user.roleCode) || user.permissions.includes(permission) || user.permissions.includes("*")) {
    return user;
  }
  redirect("/forbidden");
  return user;
}

export function userCan(user: AuthUser, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}

export { defaultHomeFor };
