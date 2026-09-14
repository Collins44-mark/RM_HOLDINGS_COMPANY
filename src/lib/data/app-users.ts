import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOwnerRole } from "@/lib/auth/rbac";
import { permissionsForRoleCode } from "@/lib/auth/role-options";
import { displayLoginIdentifier } from "@/lib/auth/identifiers";
import { BUSINESS_UNITS } from "@/lib/config/app";

export type ManagedUserStatus = "active" | "pending_password" | "locked" | "disabled";

export type ManagedUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  loginIdentifier: string;
  roleCode: string;
  roleName: string;
  modules: string[];
  moduleNames: string[];
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  status: ManagedUserStatus;
};

export type LightProfileRecord = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  locked_at: string | null;
};

const LIGHT_PROFILE_SELECT = `
  id,
  full_name,
  email,
  phone,
  avatar_url,
  is_active,
  must_change_password,
  locked_at
`;

const LOGIN_PROFILE_SELECT = `
  ${LIGHT_PROFILE_SELECT},
  failed_login_attempts,
  role:roles(code, name)
`;

export type ProfileRecord = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  failed_login_attempts: number;
  locked_at: string | null;
  last_login_at: string | null;
  created_at: string;
  role: { code: string; name: string } | { code: string; name: string }[] | null;
  business_units:
    | { business_unit: { code: string; name: string; slug: string } | null }[]
    | null;
};

const PROFILE_SELECT = `
  id,
  full_name,
  email,
  phone,
  avatar_url,
  is_active,
  must_change_password,
  failed_login_attempts,
  locked_at,
  last_login_at,
  created_at,
  role:roles(code, name),
  business_units:user_business_units(business_unit:business_units(code, name, slug))
`;

function roleOf(profile: ProfileRecord) {
  const role = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  return role ?? { code: "STAFF", name: "Staff" };
}

function asUnit(value: unknown): { code: string; name: string; slug: string } | null {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object") return null;
  const record = item as { code?: string; name?: string; slug?: string };
  if (!record.code || !record.name) return null;
  return { code: record.code, name: record.name, slug: record.slug ?? record.code };
}

function unitsOf(profile: ProfileRecord) {
  return (profile.business_units ?? [])
    .map((item) => asUnit(item.business_unit))
    .filter((item): item is { code: string; name: string; slug: string } => Boolean(item));
}

export function statusOf(profile: Pick<ManagedUser, "isActive" | "mustChangePassword" | "lockedAt">): ManagedUserStatus {
  if (!profile.isActive) return "disabled";
  if (profile.lockedAt) return "locked";
  if (profile.mustChangePassword) return "pending_password";
  return "active";
}

export function toManagedUser(profile: ProfileRecord): ManagedUser {
  const role = roleOf(profile);
  const units = unitsOf(profile);
  const owner = isOwnerRole(role.code);
  const modules = owner ? ["*"] : units.map((unit) => unit.code);
  const moduleNames = owner
    ? ["All modules"]
    : units.map((unit) => unit.name);
  const user: ManagedUser = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    loginIdentifier: displayLoginIdentifier({ email: profile.email, phone: profile.phone }),
    roleCode: role.code,
    roleName: role.name,
    modules,
    moduleNames,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
    failedLoginAttempts: profile.failed_login_attempts,
    lockedAt: profile.locked_at,
    lastLoginAt: profile.last_login_at,
    createdAt: profile.created_at,
    status: "active",
  };
  user.status = statusOf(user);
  return user;
}

export function accessFromProfile(profile: ProfileRecord) {
  const role = roleOf(profile);
  const units = unitsOf(profile);
  const owner = isOwnerRole(role.code);
  return {
    roleCode: role.code,
    roleName: role.name,
    modules: owner ? ["*"] : units.map((unit) => unit.code),
    businessUnits: units.map((unit) => ({ code: unit.code, name: unit.name })),
    permissions: owner ? ["*"] : permissionsForRoleCode(role.code),
  };
}

export async function listManagedUsers() {
  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());
  if (!client) return [];

  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as ProfileRecord[]).map(toManagedUser);
}

export const findProfileById = cache(async function findProfileById(id: string) {
  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ProfileRecord;
});

export async function findProfileByAuthId(id: string) {
  return findProfileById(id);
}

export const findLightProfileByAuthId = cache(async function findLightProfileByAuthId(id: string) {
  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select(LIGHT_PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as LightProfileRecord;
});

export async function findProfileByIdentifier(identifier: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const value = identifier.trim();
  const email = value.toLowerCase();
  const digits = value.replace(/\D/g, "");

  if (email.includes("@")) {
    const { data } = await admin.from("profiles").select(LOGIN_PROFILE_SELECT).eq("email", email).maybeSingle();
    return (data as unknown as ProfileRecord | null) ?? null;
  }

  if (digits.length >= 9) {
    const { data } = await admin.from("profiles").select(LOGIN_PROFILE_SELECT).eq("phone", digits).maybeSingle();
    return (data as unknown as ProfileRecord | null) ?? null;
  }

  return null;
}

export async function countProfiles() {
  const admin = createSupabaseAdminClient();
  const client = admin ?? (await createSupabaseServerClient());
  if (!client) return 0;
  const { count } = await client.from("profiles").select("id", { count: "exact", head: true });
  return count ?? 0;
}

export type AccessCatalogRole = { id: string; code: string; name: string };
export type AccessCatalogUnit = { id: string; code: string; name: string };

async function loadAccessCatalog(): Promise<{
  roles: AccessCatalogRole[];
  units: AccessCatalogUnit[];
}> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { roles: [], units: [] };
  const [roles, units] = await Promise.all([
    admin.from("roles").select("id, code, name"),
    admin.from("business_units").select("id, code, name"),
  ]);
  return {
    roles: (roles.data ?? []) as AccessCatalogRole[],
    units: (units.data ?? []) as AccessCatalogUnit[],
  };
}

export const getAccessCatalog = unstable_cache(loadAccessCatalog, ["access-catalog"], {
  revalidate: 300,
});

export function emptyModuleCounts() {
  return Object.fromEntries(BUSINESS_UNITS.map((unit) => [unit.code, 0])) as Record<string, number>;
}

export function moduleCountsFromUsers(users: ManagedUser[]) {
  const counts = emptyModuleCounts();
  for (const user of users) {
    if (user.modules.includes("*")) {
      for (const code of Object.keys(counts)) counts[code] += 1;
      continue;
    }
    for (const code of user.modules) {
      if (code in counts) counts[code] += 1;
    }
  }
  return counts;
}
