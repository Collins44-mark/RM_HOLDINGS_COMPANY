import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  ORGANIZATION_SETTINGS_ID,
  isSupportedCurrency,
  isValidIanaTimeZone,
} from "@/lib/config/regional";
import { parseLocale, type Locale } from "@/lib/i18n";

export const ORGANIZATION_SETTINGS_CACHE_TAG = "organization-settings";

export type OrganizationSettings = {
  organisationName: string;
  timezone: string;
  currency: string;
  language: Locale;
};

function normalize(row: {
  organisation_name?: unknown;
  timezone?: unknown;
  currency?: unknown;
  language?: unknown;
} | null): OrganizationSettings {
  const organisationName =
    typeof row?.organisation_name === "string" && row.organisation_name.trim()
      ? row.organisation_name.trim()
      : DEFAULT_ORGANIZATION_SETTINGS.organisationName;
  const timezone =
    typeof row?.timezone === "string" && isValidIanaTimeZone(row.timezone)
      ? row.timezone
      : DEFAULT_ORGANIZATION_SETTINGS.timezone;
  const currency =
    typeof row?.currency === "string" && isSupportedCurrency(row.currency)
      ? row.currency
      : DEFAULT_ORGANIZATION_SETTINGS.currency;
  const language = parseLocale(typeof row?.language === "string" ? row.language : null);
  return { organisationName, timezone, currency, language };
}

async function loadOrganizationSettings(): Promise<OrganizationSettings> {
  const admin = createSupabaseAdminClient();
  if (!admin) return DEFAULT_ORGANIZATION_SETTINGS;

  const { data, error } = await admin
    .from("organization_settings")
    .select("organisation_name, timezone, currency, language")
    .eq("id", ORGANIZATION_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        scope: "organization-settings",
        operation: "load",
        message: error.message,
      }),
    );
    return DEFAULT_ORGANIZATION_SETTINGS;
  }

  return normalize(data);
}

const loadOrganizationSettingsCached = unstable_cache(
  loadOrganizationSettings,
  ["organization-settings"],
  { revalidate: 60, tags: [ORGANIZATION_SETTINGS_CACHE_TAG] },
);

export const getOrganizationSettings = cache(async () => loadOrganizationSettingsCached());

export async function updateOrganizationSettings(input: OrganizationSettings): Promise<
  | { ok: true; previous: OrganizationSettings; next: OrganizationSettings; unchanged: boolean }
  | { ok: false; error: string }
> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const previous = await loadOrganizationSettings();
  const next: OrganizationSettings = {
    organisationName: input.organisationName.trim(),
    timezone: input.timezone,
    currency: input.currency,
    language: input.language,
  };

  if (
    previous.organisationName === next.organisationName &&
    previous.timezone === next.timezone &&
    previous.currency === next.currency &&
    previous.language === next.language
  ) {
    return { ok: true, previous, next, unchanged: true };
  }

  const { error } = await admin
    .from("organization_settings")
    .update({
      organisation_name: next.organisationName,
      timezone: next.timezone,
      currency: next.currency,
      language: next.language,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ORGANIZATION_SETTINGS_ID)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        scope: "organization-settings",
        operation: "update",
        message: error.message,
      }),
    );
    return { ok: false, error: "Could not save settings." };
  }

  return { ok: true, previous, next, unchanged: false };
}
