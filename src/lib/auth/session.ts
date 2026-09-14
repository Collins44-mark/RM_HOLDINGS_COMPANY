import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  CHANGE_PASSWORD_PATH,
  LOGIN_PATH,
  type ModuleCode,
} from "@/lib/config/app";
import { canAccessPath, defaultHomeFor } from "@/lib/auth/access";
import { isOwnerRole } from "@/lib/auth/rbac";
import { identityFromUser, type AuthUser } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  accessFromProfile,
  countProfiles,
  findProfileByAuthId,
  type ProfileRecord,
} from "@/lib/data/app-users";

export type { AuthUser } from "@/lib/auth/types";
export { identityFromUser } from "@/lib/auth/types";

function displayNameFromAuth(user: User, fallback: string) {
  const metadata = user.user_metadata ?? {};
  if (typeof metadata.full_name === "string" && metadata.full_name.trim()) {
    return metadata.full_name.trim();
  }
  if (typeof metadata.name === "string" && metadata.name.trim()) {
    return metadata.name.trim();
  }
  return fallback;
}

function authUserFromProfile(user: User, profile: ProfileRecord): AuthUser {
  const access = accessFromProfile(profile);
  return {
    id: profile.id,
    authUid: user.id,
    email: profile.email ?? user.email?.toLowerCase() ?? "",
    name: displayNameFromAuth(user, profile.full_name),
    title: access.roleName,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    roleCode: access.roleCode,
    roleName: access.roleName,
    modules: access.modules,
    businessUnits: access.businessUnits,
    permissions: access.permissions,
    isActive: profile.is_active,
    sessionId: user.id,
    mustChangePassword: profile.must_change_password,
    isLocked: Boolean(profile.locked_at),
  };
}

function legacyOwnerFromAuth(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName = displayNameFromAuth(
    user,
    user.email?.split("@")[0] || "Super Admin",
  );

  return {
    id: user.id,
    authUid: user.id,
    email: user.email?.toLowerCase() ?? "",
    name: fullName,
    title: typeof metadata.title === "string" ? metadata.title : "Super Admin",
    phone: typeof metadata.phone === "string" ? metadata.phone : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    roleCode: "SUPER_ADMIN",
    roleName: "Super Admin",
    modules: ["*"],
    businessUnits: [],
    permissions: ["*"],
    isActive: true,
    sessionId: user.id,
    mustChangePassword: false,
    isLocked: false,
  };
}

async function bootstrapOwnerProfile(user: User) {
  const admin = createSupabaseAdminClient();
  if (!admin || !user.email) return null;
  const existing = await countProfiles();
  if (existing > 0) return null;

  const { data: ownerRole } = await admin
    .from("roles")
    .select("id")
    .eq("code", "SUPER_ADMIN")
    .maybeSingle();
  if (!ownerRole?.id) return null;

  const fullName = displayNameFromAuth(user, user.email.split("@")[0] || "Owner");
  await admin.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    email: user.email.toLowerCase(),
    phone: typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null,
    role_id: ownerRole.id,
    is_active: true,
    must_change_password: false,
    failed_login_attempts: 0,
    locked_at: null,
    updated_at: new Date().toISOString(),
  });

  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { role_code: "SUPER_ADMIN", modules: ["*"] },
  });

  return findProfileByAuthId(user.id);
}

async function enforcePasswordChangeGate(user: AuthUser) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    redirect(CHANGE_PASSWORD_PATH);
  }
  if (!user.mustChangePassword && pathname === CHANGE_PASSWORD_PATH) {
    redirect(defaultHomeFor(identityFromUser(user)));
  }
}

export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let profile = await findProfileByAuthId(user.id);
  if (!profile) {
    profile = await bootstrapOwnerProfile(user);
  }

  if (!profile) {
    return user.email ? legacyOwnerFromAuth(user) : null;
  }

  if (!profile.is_active || profile.locked_at) {
    return null;
  }

  return authUserFromProfile(user, profile);
});

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) redirect(LOGIN_PATH);
  await enforcePasswordChangeGate(user);
  return user;
}

export async function requireModuleAccess(moduleCode: ModuleCode | string) {
  const user = await requireAuth();
  const identity = identityFromUser(user);
  const path = moduleCode === "owner" ? "/owner" : `/${moduleCode}`;
  if (!canAccessPath(identity, path)) {
    redirect("/forbidden");
  }
  return user;
}

export async function requireOwner() {
  const user = await requireAuth();
  if (!isOwnerRole(user.roleCode)) redirect("/forbidden");
  return user;
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
