import { DEFAULT_ORGANIZATION_SETTINGS } from "@/lib/config/regional";
import type { OrganizationSettings } from "@/lib/data/organization-settings";

let runtime: OrganizationSettings = DEFAULT_ORGANIZATION_SETTINGS;

export function hydrateRuntimeSettings(settings: OrganizationSettings) {
  runtime = settings;
}

export function getRuntimeSettings(): OrganizationSettings {
  return runtime;
}

export function getRuntimeTimezone() {
  return runtime.timezone;
}

export function getRuntimeCurrency() {
  return runtime.currency;
}

export function getRuntimeOrganisationName() {
  return runtime.organisationName;
}
