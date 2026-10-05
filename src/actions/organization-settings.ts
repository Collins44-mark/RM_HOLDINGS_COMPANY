"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { writeAuditEvent } from "@/lib/audit";
import {
  isSupportedCurrency,
  isValidIanaTimeZone,
} from "@/lib/config/regional";
import {
  ORGANIZATION_SETTINGS_CACHE_TAG,
  updateOrganizationSettings,
} from "@/lib/data/organization-settings";
import { parseLocale } from "@/lib/i18n";

export type OrganizationSettingsState = {
  error?: string;
  ok?: boolean;
} | null;

const schema = z.object({
  organisationName: z.string().trim().min(2).max(120),
  timezone: z.string().min(3).max(80),
  currency: z.string().length(3),
  language: z.enum(["en", "sw"]),
});

export async function saveOrganizationSettingsAction(
  _prev: OrganizationSettingsState,
  formData: FormData,
): Promise<OrganizationSettingsState> {
  await requireOwner();

  const parsed = schema.safeParse({
    organisationName: formData.get("organisationName"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    language: formData.get("language"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid organisation name, timezone, currency and language." };
  }

  if (!isValidIanaTimeZone(parsed.data.timezone)) {
    return { error: "Enter a valid timezone." };
  }
  if (!isSupportedCurrency(parsed.data.currency)) {
    return { error: "Enter a valid currency." };
  }

  const result = await updateOrganizationSettings({
    organisationName: parsed.data.organisationName,
    timezone: parsed.data.timezone,
    currency: parsed.data.currency,
    language: parseLocale(parsed.data.language),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  if (!result.unchanged) {
    const changed: string[] = [];
    if (result.previous.organisationName !== result.next.organisationName) {
      changed.push("organisation_name");
    }
    if (result.previous.timezone !== result.next.timezone) changed.push("timezone");
    if (result.previous.currency !== result.next.currency) changed.push("currency");
    if (result.previous.language !== result.next.language) changed.push("language");

    await writeAuditEvent({
      action:
        result.previous.language !== result.next.language
          ? "language.setting_updated"
          : "organisation.setting_updated",
      module: "settings",
      description: `Updated organisation settings (${changed.join(", ")})`,
      severity: "medium",
      entityType: "organization_settings",
      entityId: "1",
      metadata: {
        previous_organisation_name: result.previous.organisationName,
        next_organisation_name: result.next.organisationName,
        previous_timezone: result.previous.timezone,
        next_timezone: result.next.timezone,
        previous_currency: result.previous.currency,
        next_currency: result.next.currency,
        previous_language: result.previous.language,
        next_language: result.next.language,
      },
    });
  }

  updateTag(ORGANIZATION_SETTINGS_CACHE_TAG);
  revalidatePath("/owner/settings");
  revalidatePath("/", "layout");

  return { ok: true };
}
