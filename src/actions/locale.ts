"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getVerifiedAuthUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocale, parseLocale, type Locale } from "@/lib/i18n";
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from "@/lib/i18n/locale-cookie";

export async function savePreferredLocaleAction(input: string): Promise<{ ok: true; locale: Locale } | { ok: false; error: string }> {
  const locale = parseLocale(input);
  if (!isLocale(input)) {
    return { ok: false, error: "Choose English or Kiswahili." };
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: LOCALE_MAX_AGE, sameSite: "lax" });

  const actor = await getVerifiedAuthUser();
  const supabase = await createSupabaseServerClient();
  if (actor && supabase) {
    await supabase.auth.updateUser({ data: { preferred_locale: locale } });
    const admin = createSupabaseAdminClient();
    if (admin) {
      await admin.from("profiles").update({ preferred_locale: locale }).eq("id", actor.id);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, locale };
}
