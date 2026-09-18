import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  BUSINESS_UNITS,
  CHANGE_PASSWORD_PATH,
  LOGIN_PATH,
  type ModuleCode,
} from "@/lib/config/app";
import { canAccessPath, defaultHomeFor } from "@/lib/auth/access";
import { isOwnerRole } from "@/lib/auth/rbac";
import { identityFromAppMetadata } from "@/lib/auth/identity-from-claims";
import { roleDefinition } from "@/lib/auth/role-options";
import { identityFromUser, type AuthUser } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  accessFromProfile,
  countProfiles,
  findLightProfileByAuthId,
  findProfileByAuthId,
  type LightProfileRecord,
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

function unitsFromModules(modules: string[]) {
  if (modules.includes("*")) return [];
  return BUSINESS_UNITS
    .filter((unit) => modules.includes(unit.code))
    .map((unit) => ({ code: unit.code, name: unit.name }));
}

function authUserFromClaims(user: User, profile?: LightProfileRecord | null): AuthUser | null {
  const claims = identityFromAppMetadata(user.app_metadata);
  if (!claims) return null;
  if (profile && (!profile.is_active || profile.locked_at)) return null;
  const role = roleDefinition(claims.role);
  return {
    id: profile?.id ?? user.id,
    authUid: user.id,
    email: profile?.email ?? user.email?.toLowerCase() ?? "",
    name: displayNameFromAuth(user, profile?.full_name || user.email?.split("@")[0] || "User"),
    title: role?.name ?? claims.role,
    phone: profile?.phone ?? (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null),
    avatarUrl: profile?.avatar_url ?? null,
    roleCode: claims.role,
    roleName: role?.name ?? claims.role,
    modules: claims.modules,
    businessUnits: unitsFromModules(claims.modules),
    permissions: claims.permissions,
    isActive: profile?.is_active ?? true,
    sessionId: user.id,
    mustChangePassword: profile?.must_change_password ?? false,
    isLocked: Boolean(profile?.locked_at),
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

  return findLightProfileByAuthId(user.id);
}

async function hydrateAuthUser(user: User, options?: { skipProfile?: boolean }) {
  if (options?.skipProfile) {
    const claimed = authUserFromClaims(user);
    if (claimed) return claimed;
  }

  let profile = await findLightProfileByAuthId(user.id);
  if (!profile) {
    profile = await bootstrapOwnerProfile(user);
  }

  const fromClaims = authUserFromClaims(user, profile);
  if (fromClaims) return fromClaims;

  if (!profile) {
    return user.email ? legacyOwnerFromAuth(user) : null;
  }

  if (!profile.is_active || profile.locked_at) return null;

  const full = await findProfileByAuthId(user.id);
  if (!full) {
    return user.email ? legacyOwnerFromAuth(user) : null;
  }

  const access = accessFromProfile(full);
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
  } satisfies AuthUser;
}

async function readCookieUser(verified: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  if (verified) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
  const user = await readCookieUser(false);
  if (!user) return null;
  // Prefer JWT/app_metadata claims on soft navigations and prefetches so report
  // transitions do not wait on a profiles round-trip. Mutations still use
  // getVerifiedAuthUser() → full hydrate.
  return hydrateAuthUser(user, { skipProfile: true });
});

export const getVerifiedAuthUser = cache(async function getVerifiedAuthUser(): Promise<AuthUser | null> {
  const user = await readCookieUser(true);
  if (!user) return null;
  return hydrateAuthUser(user);
});

async function enforcePasswordChangeGate(user: AuthUser) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    redirect(CHANGE_PASSWORD_PATH);
  }
  if (!user.mustChangePassword && pathname === CHANGE_PASSWORD_PATH) {
    redirect(defaultHomeFor(identityFromUser(user)));
  }
}

export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) redirect(LOGIN_PATH);
  await enforcePasswordChangeGate(user);
  return user;
}

export async function requireVerifiedAuth() {
  const user = await getVerifiedAuthUser();
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

export async function requireVerifiedOwner() {
  const user = await requireVerifiedAuth();
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
