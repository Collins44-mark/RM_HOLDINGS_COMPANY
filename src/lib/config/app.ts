import { BUSINESS_UNIT_THEME } from "@/lib/theme/business-units";

export const APP_NAME = "RM Holdings Ltd";
export const APP_TAGLINE = "One Vision • Multiple Opportunities";
export const APP_MOTTO = "One Vision • Multiple Opportunities • A Greater Tomorrow";
export const APP_QUOTE = "Sustainable Businesses Brighter Communities";
export const APP_MISSION =
  "Agriculture, Education, Trade and Investments for a Better Tanzania";
export const APP_TIMEZONE = "Africa/Dar_es_Salaam";
export const APP_CURRENCY = "TZS";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "rm_session";
export const LOGIN_PATH = "/login";
export const DASHBOARD_PATH = "/dashboard";
export const WORKSPACE_PATH = "/workspace";
export const CHANGE_PASSWORD_PATH = "/change-password";

export type ModuleCode =
  | "owner"
  | "rice"
  | "farm"
  | "supermarket"
  | "property"
  | "livestock"
  | "school"
  | "beekeeping";

export type BusinessUnitCode = Exclude<ModuleCode, "owner">;

export const SIDEBAR_WIDTH = {
  expanded: 220,
  collapsed: 72,
} as const;

export const SIDEBAR_STORAGE_KEY = "rm-holdings.sidebar-collapsed";

export type BusinessUnitDefinition = {
  code: BusinessUnitCode;
  slug: string;
  name: string;
  shortName: string;
  location: string;
  subtitle?: string;
  description: string;
  accent: string;
  iconBg: string;
  tint: string;
  surface: string;
  sortOrder: number;
};

/**
 * Presentation catalog (theme, location, short labels) keyed by stable unit code.
 * Production existence / active status / sort order come from Supabase
 * `business_units` via `src/lib/data/business-units.ts` — not this array.
 */
export const BUSINESS_UNITS: BusinessUnitDefinition[] = [
  {
    code: "rice",
    slug: "rice",
    name: "Rice Mill & Warehouse",
    shortName: "Rice Mill",
    location: "Katindiuka, Morogoro",
    description: "Paddy intake, milling, grading, warehousing and rice sales.",
    ...BUSINESS_UNIT_THEME.rice,
    sortOrder: 1,
  },
  {
    code: "farm",
    slug: "farm",
    name: "Farm & Tractor Services",
    shortName: "Farm",
    location: "Chita, Morogoro",
    description: "Crop production, farm operations and tractor hire services.",
    ...BUSINESS_UNIT_THEME.farm,
    sortOrder: 2,
  },
  {
    code: "supermarket",
    slug: "supermarket",
    name: "Supermarket",
    shortName: "Supermarket",
    location: "Dar es Salaam",
    description: "Retail sales, inventory, suppliers and daily trading.",
    ...BUSINESS_UNIT_THEME.supermarket,
    sortOrder: 3,
  },
  {
    code: "property",
    slug: "property",
    name: "Properties & Rentals",
    shortName: "Properties",
    location: "Offices & Hall - Dar es Salaam",
    description: "Office rentals, hall bookings and property operations.",
    ...BUSINESS_UNIT_THEME.property,
    sortOrder: 4,
  },
  {
    code: "livestock",
    slug: "livestock",
    name: "Livestock Farm",
    shortName: "Livestock",
    location: "Kigamboni, Dar es Salaam",
    description: "Herd records, health, feeding and livestock sales.",
    ...BUSINESS_UNIT_THEME.livestock,
    sortOrder: 5,
  },
  {
    code: "school",
    slug: "school",
    name: "School Management",
    shortName: "School",
    location: "Dodoma",
    subtitle: "Academics, Fees & School Buses",
    description:
      "Students, academics, fees and school transport including buses, drivers and routes.",
    ...BUSINESS_UNIT_THEME.school,
    sortOrder: 6,
  },
  {
    code: "beekeeping",
    slug: "beekeeping",
    name: "Beekeeping",
    shortName: "Beekeeping",
    location: "Musoma",
    description: "Apiaries, hive inspections, honey harvests and sales.",
    ...BUSINESS_UNIT_THEME.beekeeping,
    sortOrder: 7,
  },
];

export const MODULE_PREFIXES: Record<string, ModuleCode> = {
  owner: "owner",
  rice: "rice",
  farm: "farm",
  supermarket: "supermarket",
  property: "property",
  livestock: "livestock",
  school: "school",
  beekeeping: "beekeeping",
};

export function getBusinessUnit(code: string) {
  return BUSINESS_UNITS.find((unit) => unit.code === code);
}

export function getModuleFromPath(pathname: string): ModuleCode | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  return MODULE_PREFIXES[segment] ?? null;
}

export function loginPathForModule(_module?: ModuleCode | string) {
  return "/login";
}

export function homePathForModule(module: ModuleCode | string) {
  return `/${module}`;
}
