import { BUSINESS_UNITS, type BusinessUnitCode } from "@/lib/config/app";

/** Group scope or a configured business-unit code. */
export type ReportModuleId = "group" | BusinessUnitCode;

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
];

export type ReportModuleOption = {
  id: ReportModuleId;
  label: string;
};

export const REPORT_MODULE_OPTIONS: ReportModuleOption[] = [
  { id: "group", label: "All Business Units / Group" },
  ...BUSINESS_UNITS.map((unit) => ({
    id: unit.code as ReportModuleId,
    label: unit.name,
  })),
];

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

export function parseReportModuleId(value: string | string[] | undefined): ReportModuleId {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "group") return "group";
  if (BUSINESS_UNITS.some((unit) => unit.code === raw)) return raw as ReportModuleId;
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

export function moduleLabel(moduleId: ReportModuleId): string {
  if (moduleId === "group") return "All Business Units / Group";
  return BUSINESS_UNITS.find((unit) => unit.code === moduleId)?.name ?? moduleId;
}
