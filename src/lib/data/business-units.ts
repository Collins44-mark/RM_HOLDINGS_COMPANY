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

/** Raw row from Supabase `business_units` (canonical source of truth). */
export type BusinessUnitRecord = {
  id: string;
  code: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

/**
 * DB record enriched with presentation metadata (theme/location).
 * Presentation overlays are keyed by code and are NOT the existence source.
 */
export type BusinessUnitView = BusinessUnitRecord & {
  shortName: string;
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
    location: presentation?.location ?? "—",
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

  const { data, error } = await admin
    .from("business_units")
    .select("id, code, slug, name, is_active, sort_order")
    .order("sort_order", { ascending: true });

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

  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code),
    slug: String(row.slug),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
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
  { revalidate: 300 },
);

const listAssignmentCountsCached = unstable_cache(
  loadAssignmentCounts,
  ["business-units-assignment-counts"],
  { revalidate: 120 },
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
  if (isOwnerRole(identity.role) || identity.modules.includes("*")) {
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
