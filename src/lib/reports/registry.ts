import { BUSINESS_UNITS, type BusinessUnitCode } from "@/lib/config/app";
import type { BusinessUnitView } from "@/lib/data/business-units";
import { isKnownBusinessUnitCode } from "@/lib/data/business-units";
import { REPORT_MODULES, REPORT_TYPES } from "@/lib/property/report-types";

/** Group scope or a configured business-unit code. */
export type ReportModuleId = "group" | BusinessUnitCode | string;

export type ReportExportFormat = "pdf";

export type ReportDefinition = {
  id: string;
  module: ReportModuleId;
  label: string;
  description: string;
  /** Export formats that are actually implemented for this report. */
  exports: ReportExportFormat[];
};

/**
 * Registry of reports that are actually implemented with live data.
 * Do not add entries for unfinished modules/reports.
 */
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "group-overview",
    module: "group",
    label: "Group Overview",
    description: "Consolidated sales and expense summary across business units.",
    exports: [],
  },
  {
    id: "group-financial",
    module: "group",
    label: "Consolidated Financial Report",
    description: "Profit & loss and cash movement from live consolidated ledgers.",
    exports: [],
  },
  {
    id: "group-performance",
    module: "group",
    label: "Business Performance",
    description: "Revenue, expenses and operating position by business unit.",
    exports: [],
  },
  {
    id: "sm-sales",
    module: "supermarket",
    label: "Sales Report",
    description: "Sales transactions, revenue and payment summary for the selected period.",
    exports: ["pdf"],
  },
  {
    id: "sm-purchases",
    module: "supermarket",
    label: "Purchases Report",
    description: "Goods receipts and purchasing activity for the selected period.",
    exports: ["pdf"],
  },
  {
    id: "sm-inventory",
    module: "supermarket",
    label: "Inventory Report",
    description: "Stock valuation and inventory position for the selected period.",
    exports: ["pdf"],
  },
  {
    id: "sm-profit-loss",
    module: "supermarket",
    label: "Profit & Loss Report",
    description: "Revenue, COGS, expenses and net result for the selected period.",
    exports: ["pdf"],
  },
  {
    id: "school-finance",
    module: "school",
    label: "Finance Report",
    description: "Fees billed, posted collections, outstanding balances and operating expenses.",
    exports: ["pdf"],
  },
  {
    id: "school-admissions",
    module: "school",
    label: "Admissions Report",
    description: "Admission records by status, date and placement.",
    exports: ["pdf"],
  },
  {
    id: "school-students",
    module: "school",
    label: "Students Report",
    description: "Enrolled students from completed admissions.",
    exports: ["pdf"],
  },
  {
    id: "school-parents",
    module: "school",
    label: "Parents / Guardians Report",
    description: "Guardians and their linked students.",
    exports: ["pdf"],
  },
  {
    id: "bee-hives",
    module: "beekeeping",
    label: "All Beehives",
    description: "Registered beehives, locations, and harvested quantities.",
    exports: ["pdf"],
  },
  {
    id: "bee-hive-details",
    module: "beekeeping",
    label: "Beehive Details",
    description: "Hive notes, status, and production.",
    exports: ["pdf"],
  },
  {
    id: "bee-harvests",
    module: "beekeeping",
    label: "Honey Harvest Records",
    description: "Harvests linked to their source hives.",
    exports: ["pdf"],
  },
  {
    id: "bee-production",
    module: "beekeeping",
    label: "Honey Production Summary",
    description: "Valid harvested honey for the selected period.",
    exports: ["pdf"],
  },
  {
    id: "bee-sales",
    module: "beekeeping",
    label: "Honey Sales",
    description: "Sales, quantities, and collected payments.",
    exports: ["pdf"],
  },
  {
    id: "bee-stock",
    module: "beekeeping",
    label: "Honey Stock",
    description: "Harvested, sold, and available honey.",
    exports: ["pdf"],
  },
  {
    id: "bee-expenses",
    module: "beekeeping",
    label: "Beekeeping Expenses",
    description: "Recorded expenses and amounts actually paid.",
    exports: ["pdf"],
  },
  {
    id: "bee-financial",
    module: "beekeeping",
    label: "Beekeeping Financial Summary",
    description: "Collected income, paid expenses, and operating result.",
    exports: ["pdf"],
  },
  { id: "ls-inventory", module: "livestock", label: "Livestock Inventory Report", description: "Current group quantities by animal type.", exports: ["pdf"] },
  { id: "ls-purchases", module: "livestock", label: "Livestock Purchase Report", description: "Livestock purchases and their costs.", exports: ["pdf"] },
  { id: "ls-pregnancy", module: "livestock", label: "Pregnancy Report", description: "Active group pregnancy records.", exports: ["pdf"] },
  { id: "ls-births", module: "livestock", label: "Birth Report", description: "Mothers delivered and offspring born.", exports: ["pdf"] },
  { id: "ls-movements", module: "livestock", label: "Livestock Movement Report", description: "Opening stock, purchases, births, sales, deaths, and adjustments.", exports: ["pdf"] },
  { id: "ls-sales", module: "livestock", label: "Livestock Sales Report", description: "Sales, amounts received, and outstanding balances.", exports: ["pdf"] },
  { id: "ls-houses", module: "livestock", label: "Poultry Houses Report", description: "Poultry houses and their rental status.", exports: ["pdf"] },
  { id: "ls-rent", module: "livestock", label: "Rental Income Report", description: "Poultry house rent actually received.", exports: ["pdf"] },
  { id: "ls-expenses", module: "livestock", label: "Livestock Expenses Report", description: "Expense obligations, amounts paid, and balances.", exports: ["pdf"] },
  { id: "ls-financial", module: "livestock", label: "Livestock Financial Summary", description: "Collected livestock income, paid expenses, and cash result.", exports: ["pdf"] },
  {
    id: "school-transport",
    module: "school",
    label: "Transport Report",
    description: "Posted fuel and maintenance expenses by bus.",
    exports: ["pdf"],
  },
  ...REPORT_MODULES.flatMap((group) =>
    REPORT_TYPES[group.id]
      .filter((report) => report.id !== "individual" && report.id !== "statement")
      .map((report) => ({
        id: `property:${group.id}:${report.id}`,
        module: "property" as const,
        label: `${group.name} — ${report.label}`,
        description: group.description,
        exports: ["pdf"] as ReportExportFormat[],
      })),
  ),
  {
    id: "rice-summary",
    module: "rice",
    label: "Financial Summary",
    description: "Purchases, sales, milling income, expenses, and stock value.",
    exports: [],
  },
  {
    id: "rice-inventory",
    module: "rice",
    label: "Inventory",
    description: "Current rice stock quantities and values.",
    exports: [],
  },
  {
    id: "rice-purchases",
    module: "rice",
    label: "Purchases",
    description: "Paddy purchases for the selected period.",
    exports: [],
  },
  {
    id: "rice-production",
    module: "rice",
    label: "Milling & Production",
    description: "Mill batches, output, and wastage.",
    exports: [],
  },
  {
    id: "rice-sales",
    module: "rice",
    label: "Sales",
    description: "Rice sales and amounts received.",
    exports: [],
  },
  {
    id: "rice-services",
    module: "rice",
    label: "Service Income",
    description: "Storage and milling service income.",
    exports: [],
  },
  {
    id: "rice-expenses",
    module: "rice",
    label: "Expenses",
    description: "Rice operating expenses for the selected period.",
    exports: [],
  },
  {
    id: "rice-storage",
    module: "rice",
    label: "Customer Storage",
    description: "Customer storage balances.",
    exports: [],
  },
  {
    id: "farm-summary",
    module: "farm",
    label: "Financial Summary",
    description: "Farm service income, expenses, and operating result.",
    exports: [],
  },
  {
    id: "farm-jobs",
    module: "farm",
    label: "Farm Services",
    description: "Customer jobs, prices, and payments.",
    exports: [],
  },
  {
    id: "farm-tractors",
    module: "farm",
    label: "Tractors & Equipment",
    description: "Registered tractors and their status.",
    exports: [],
  },
  {
    id: "farm-fuel",
    module: "farm",
    label: "Fuel",
    description: "Fuel issued to tractors.",
    exports: [],
  },
  {
    id: "farm-maintenance",
    module: "farm",
    label: "Maintenance",
    description: "Tractor maintenance costs.",
    exports: [],
  },
  {
    id: "farm-operations",
    module: "farm",
    label: "Company Farm",
    description: "Company farm operations.",
    exports: [],
  },
  {
    id: "farm-expenses",
    module: "farm",
    label: "Expenses",
    description: "Farm expenses for the selected period.",
    exports: [],
  },
];

export type ReportModuleOption = {
  id: ReportModuleId;
  label: string;
};

/** Build report module options from the shared business-unit foundation. */
export function reportModuleOptionsFromUnits(
  units: Pick<BusinessUnitView, "code" | "name">[],
): ReportModuleOption[] {
  return [
    { id: "group", label: "All Business Units / Group" },
    ...units.map((unit) => ({
      id: unit.code as ReportModuleId,
      label: unit.name,
    })),
  ];
}

/** @deprecated Prefer reportModuleOptionsFromUnits(listBusinessUnits()). */
export const REPORT_MODULE_OPTIONS: ReportModuleOption[] = reportModuleOptionsFromUnits(
  BUSINESS_UNITS.map((unit) => ({ code: unit.code, name: unit.name })),
);

export function reportsForModule(moduleId: ReportModuleId): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((report) => report.module === moduleId);
}

export function getReportDefinition(reportId: string | null | undefined): ReportDefinition | null {
  if (!reportId) return null;
  return REPORT_DEFINITIONS.find((report) => report.id === reportId) ?? null;
}

export function defaultReportId(moduleId: ReportModuleId): string | null {
  return reportsForModule(moduleId)[0]?.id ?? null;
}

export function parseReportModuleId(
  value: string | string[] | undefined,
  knownCodes?: string[],
): ReportModuleId {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "group") return "group";
  if (raw && knownCodes?.includes(raw)) return raw;
  if (raw && isKnownBusinessUnitCode(raw)) return raw;
  return "group";
}

export function parseReportId(
  value: string | string[] | undefined,
  moduleId: ReportModuleId,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const available = reportsForModule(moduleId);
  if (raw && available.some((report) => report.id === raw)) return raw;
  return defaultReportId(moduleId);
}

export function moduleLabel(
  moduleId: ReportModuleId,
  units?: Pick<BusinessUnitView, "code" | "name">[],
): string {
  if (moduleId === "group") return "All Business Units / Group";
  const fromUnits = units?.find((unit) => unit.code === moduleId)?.name;
  if (fromUnits) return fromUnits;
  return BUSINESS_UNITS.find((unit) => unit.code === moduleId)?.name ?? String(moduleId);
}
