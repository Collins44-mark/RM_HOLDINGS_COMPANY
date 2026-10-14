import { cache } from "react";
import { cookies } from "next/headers";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { hydrateRuntimeSettings } from "@/lib/config/runtime-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTranslator, isLocale, type Locale } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";

export const resolveRequestLocale = cache(async (fallback: Locale): Promise<Locale> => {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const meta = user?.user_metadata?.preferred_locale;
      if (isLocale(typeof meta === "string" ? meta : null)) return meta;
      if (user) {
        const { data } = await supabase.from("profiles").select("preferred_locale").eq("id", user.id).maybeSingle();
        const stored = data?.preferred_locale;
        if (isLocale(typeof stored === "string" ? stored : null)) return stored;
      }
    }
  } catch {
    // Cookie / organisation fallback when the profile column is not available yet.
  }
  if (isLocale(cookieValue)) return cookieValue;
  return fallback;
});

export const getTranslator = cache(async () => {
  const settings = await getOrganizationSettings();
  hydrateRuntimeSettings(settings);
  const locale = await resolveRequestLocale(settings.language);
  return createTranslator(locale);
});
