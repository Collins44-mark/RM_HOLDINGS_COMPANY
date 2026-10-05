import { unstable_cache } from "next/cache";
import {
  BUSINESS_UNITS,
  homePathForModule,
  type BusinessUnitCode,
  type BusinessUnitDefinition,
} from "@/lib/config/app";
import { BUSINESS_UNIT_THEME } from "@/lib/theme/business-units";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AccessIdentity } from "@/lib/auth/rbac";
import { canAccessModule, isOwnerRole } from "@/lib/auth/rbac";

export const BUSINESS_UNITS_CACHE_TAG = "business-units";
export const UNSET_BUSINESS_UNIT_LOCATION = "Location not set";

/** Raw row from Supabase `business_units` (canonical source of truth). */
export type BusinessUnitRecord = {
  id: string;
  code: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** Stored location; empty when unset. */
  storedLocation: string;
};

/**
 * DB record enriched with presentation metadata (theme/labels).
 * Location always comes from `business_units.location`, never from app.ts.
 */
export type BusinessUnitView = BusinessUnitRecord & {
  shortName: string;
  /** Display location (`Location not set` when empty). */
  location: string;
  subtitle?: string;
  description: string;
  accent: string;
  iconBg: string;
  tint: string;
  surface: string;
  moduleHref: string;
  /** Only supermarket currently has a live operational module. */
  hasOperationalModule: boolean;
  assignedUserCount: number;
};

const UNIT_ICONS: Record<string, string> = {
  rice: "wheat",
  farm: "tractor",
  supermarket: "cart",
  property: "building",
  livestock: "paw",
  school: "school",
  beekeeping: "hexagon",
};

function presentationForCode(code: string): BusinessUnitDefinition | undefined {
  return BUSINESS_UNITS.find((unit) => unit.code === code);
}

function themeForCode(code: string) {
  return (
    BUSINESS_UNIT_THEME[code as keyof typeof BUSINESS_UNIT_THEME] ?? {
      accent: "#5B7FA6",
      iconBg: "rgba(91, 127, 166, 0.14)",
      tint: "rgba(91, 127, 166, 0.12)",
      surface: "transparent",
    }
  );
}

export function displayBusinessUnitLocation(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || UNSET_BUSINESS_UNIT_LOCATION;
}

/** Stable module route for a business-unit code (`supermarket` → `/supermarket`). */
export function moduleHrefForCode(code: string) {
  return homePathForModule(code);
}

export function navIconForCode(code: string) {
  return UNIT_ICONS[code] ?? "building";
}

/** Application knowledge: which modules currently have live operational ledgers. */
export function hasOperationalModule(code: string) {
  return code === "supermarket";
}

function toView(record: BusinessUnitRecord, assignedUserCount = 0): BusinessUnitView {
  const presentation = presentationForCode(record.code);
  const theme = themeForCode(record.code);
  return {
    ...record,
    shortName: presentation?.shortName ?? record.name,
    location: displayBusinessUnitLocation(record.storedLocation),
    subtitle: presentation?.subtitle,
    description: presentation?.description ?? "",
    accent: presentation?.accent ?? theme.accent,
    iconBg: presentation?.iconBg ?? theme.iconBg,
    tint: presentation?.tint ?? theme.tint,
    surface: presentation?.surface ?? theme.surface,
    moduleHref: moduleHrefForCode(record.slug || record.code),
    hasOperationalModule: hasOperationalModule(record.code),
    assignedUserCount,
  };
}

async function loadBusinessUnitRecords(): Promise<BusinessUnitRecord[]> {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];

  const query = await admin
    .from("business_units")
    .select("id, code, slug, name, is_active, sort_order, location")
    .order("sort_order", { ascending: true });

  let rows: Array<{
    id: unknown;
    code: unknown;
    slug: unknown;
    name: unknown;
    is_active: unknown;
    sort_order: unknown;
    location?: unknown;
  }> | null = query.data;
  let error = query.error;

  if (error && /location/i.test(error.message)) {
    const fallback = await admin
      .from("business_units")
      .select("id, code, slug, name, is_active, sort_order")
      .order("sort_order", { ascending: true });
    rows = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error(
      JSON.stringify({
        scope: "business-units",
        operation: "listBusinessUnitRecords",
        message: error.message,
      }),
    );
    return [];
  }

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code),
    slug: String(row.slug),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    storedLocation: typeof row.location === "string" ? row.location.trim() : "",
  }));
}

async function loadAssignmentCounts(): Promise<Record<string, number>> {
  const admin = createSupabaseAdminClient();
  if (!admin) return {};

  const { data, error } = await admin.from("user_business_units").select("business_unit_id");
  if (error) {
    console.error(
      JSON.stringify({
        scope: "business-units",
        operation: "loadAssignmentCounts",
        message: error.message,
      }),
    );
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.business_unit_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

const listBusinessUnitRecordsCached = unstable_cache(
  loadBusinessUnitRecords,
  ["business-units-records"],
  { revalidate: 300, tags: [BUSINESS_UNITS_CACHE_TAG] },
);

const listAssignmentCountsCached = unstable_cache(
  loadAssignmentCounts,
  ["business-units-assignment-counts"],
  { revalidate: 120, tags: [BUSINESS_UNITS_CACHE_TAG] },
);

/** All configured business units from Supabase, with presentation overlay. */
export async function listBusinessUnits(): Promise<BusinessUnitView[]> {
  const [records, counts] = await Promise.all([
    listBusinessUnitRecordsCached(),
    listAssignmentCountsCached(),
  ]);
  return records.map((record) => toView(record, counts[record.id] ?? 0));
}

export async function getBusinessUnitByCode(
  code: string,
): Promise<BusinessUnitView | null> {
  const units = await listBusinessUnits();
  return units.find((unit) => unit.code === code) ?? null;
}

/** Filter to units the identity may access (Owner → all; others → assigned modules). */
export function filterBusinessUnitsForAccess(
  units: BusinessUnitView[],
  identity: AccessIdentity,
): BusinessUnitView[] {
  if (isOwnerRole(identity.role)) {
    return units;
  }
  return units.filter((unit) => canAccessModule(identity, unit.code));
}

export async function listAccessibleBusinessUnits(
  identity: AccessIdentity,
): Promise<BusinessUnitView[]> {
  const units = await listBusinessUnits();
  return filterBusinessUnitsForAccess(units, identity);
}

export function isKnownBusinessUnitCode(code: string): code is BusinessUnitCode {
  return BUSINESS_UNITS.some((unit) => unit.code === code);
}

export async function updateBusinessUnitLocation(input: {
  id: string;
  location: string;
}): Promise<
  | { ok: true; unchanged: true }
  | {
      ok: true;
      unchanged: false;
      name: string;
      previousLocation: string | null;
      nextLocation: string | null;
    }
  | { ok: false; error: string }
> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const location = input.location.trim() || null;
  const { data: existing, error: readError } = await admin
    .from("business_units")
    .select("id, name, location")
    .eq("id", input.id)
    .maybeSingle();

  if (readError || !existing) {
    return { ok: false, error: "Could not save the location." };
  }

  const previous = typeof existing.location === "string" ? existing.location.trim() || null : null;
  if (previous === location) {
    return { ok: true, unchanged: true };
  }

  const { error } = await admin
    .from("business_units")
    .update({ location })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        scope: "business-units",
        operation: "updateBusinessUnitLocation",
        message: error.message,
      }),
    );
    return { ok: false, error: "Could not save the location." };
  }

  return {
    ok: true,
    unchanged: false,
    name: String(existing.name),
    previousLocation: previous,
    nextLocation: location,
  };
}
