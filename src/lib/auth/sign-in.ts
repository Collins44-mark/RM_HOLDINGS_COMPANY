import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordSignInResult =
  | { ok: true; authUid: string; email: string }
  | { ok: false; error: string };

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const normalized = email.toLowerCase().trim();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { ok: false, error: "Authentication is not configured." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password,
  });

  if (error || !data.user?.email) {
    return { ok: false, error: "Invalid email or password." };
  }

  return {
    ok: true,
    authUid: data.user.id,
    email: data.user.email.toLowerCase(),
  };
}

export async function signOutFromAuthProvider() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}
