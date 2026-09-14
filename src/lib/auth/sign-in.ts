import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isOwnerRole } from "@/lib/auth/rbac";
import { identityFromAppMetadata } from "@/lib/auth/identity-from-claims";
import {
  findProfileByIdentifier,
  type ProfileRecord,
} from "@/lib/data/app-users";
import {
  isPhoneIdentifier,
  normalizeEmail,
  normalizePhone,
  syntheticEmailForPhone,
} from "@/lib/auth/identifiers";

export type PasswordSignInResult =
  | {
      ok: true;
      authUid: string;
      email: string;
      mustChangePassword: boolean;
      roleCode: string;
      modules: string[];
    }
  | { ok: false; error: string };

const GENERIC_INVALID = "Invalid email or password.";
const LOCKED_MESSAGE = "Your account is locked. Please contact your administrator.";
const DISABLED_MESSAGE = "Your account is locked. Please contact your administrator.";
const MAX_FAILED_ATTEMPTS = 5;

function roleCodeOf(profile: ProfileRecord) {
  const role = Array.isArray(profile.role) ? profile.role[0] : profile.role;
  return role?.code ?? "";
}

async function resolveAuthEmail(identifier: string, profile: ProfileRecord | null) {
  if (profile?.email) return profile.email;
  if (identifier.includes("@")) return normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  return phone ? syntheticEmailForPhone(phone) : normalizeEmail(identifier);
}

async function registerFailedAttempt(profile: ProfileRecord | null) {
  if (!profile) return;
  if (isOwnerRole(roleCodeOf(profile))) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const nextCount = (profile.failed_login_attempts ?? 0) + 1;
  const locked = nextCount >= MAX_FAILED_ATTEMPTS;
  await admin
    .from("profiles")
    .update({
      failed_login_attempts: nextCount,
      locked_at: locked ? new Date().toISOString() : profile.locked_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
}

function recordLastLogin(userId: string) {
  after(async () => {
    const admin = createSupabaseAdminClient();
    if (!admin) return;
    await admin
      .from("profiles")
      .update({
        failed_login_attempts: 0,
        locked_at: null,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  });
}

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<PasswordSignInResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, error: "Authentication is not configured." };
  }

  const trimmed = identifier.trim();
  const profile = await findProfileByIdentifier(
    isPhoneIdentifier(trimmed) ? trimmed.replace(/\D/g, "") : normalizeEmail(trimmed),
  );

  if (profile && !profile.is_active) {
    return { ok: false, error: DISABLED_MESSAGE };
  }
  if (profile?.locked_at) {
    return { ok: false, error: LOCKED_MESSAGE };
  }

  const email = await resolveAuthEmail(trimmed, profile);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await registerFailedAttempt(profile);
    const refreshed = profile ? await findProfileByIdentifier(profile.email ?? profile.phone ?? "") : null;
    if (refreshed?.locked_at) {
      return { ok: false, error: LOCKED_MESSAGE };
    }
    return { ok: false, error: GENERIC_INVALID };
  }

  recordLastLogin(data.user.id);

  const claims = identityFromAppMetadata(data.user.app_metadata);
  const roleCode = claims?.role || roleCodeOf(profile as ProfileRecord) || "SUPER_ADMIN";
  const modules = claims?.modules?.length
    ? claims.modules
    : isOwnerRole(roleCode)
      ? ["*"]
      : [];

  return {
    ok: true,
    authUid: data.user.id,
    email: data.user.email?.toLowerCase() ?? email,
    mustChangePassword: Boolean(profile?.must_change_password),
    roleCode,
    modules,
  };
}

export async function signOutFromAuthProvider() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
}
