import { cache } from "react";
import { getOrganizationSettings } from "@/lib/data/organization-settings";
import { hydrateRuntimeSettings } from "@/lib/config/runtime-settings";
import { createTranslator } from "@/lib/i18n";

export const getTranslator = cache(async () => {
  const settings = await getOrganizationSettings();
  hydrateRuntimeSettings(settings);
  return createTranslator(settings.language);
});
