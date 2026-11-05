export const REPORT_MODULES = [
  { id: "properties", name: "Properties", description: "Property register and property summaries." },
  { id: "units", name: "Units", description: "Units by property and occupancy." },
  { id: "tenants", name: "Tenants", description: "Tenant lists and an individual statement." },
  { id: "contracts", name: "Contracts", description: "Active, expiring, and expired contracts." },
  { id: "invoices", name: "Rent Invoices", description: "Invoices, collections, and outstanding balances." },
  { id: "halls", name: "Hall Bookings", description: "Bookings, collections, and outstanding balances." },
  { id: "expenses", name: "Expenses", description: "Recorded expenses, payments, and balances." },
] as const;

export const REPORT_TYPES: Record<string, { id: string; label: string }[]> = {
  properties: [
    { id: "all", label: "All Properties" },
    { id: "individual", label: "Individual Property Details" },
    { id: "summary", label: "Property Summary" },
  ],
  units: [
    { id: "all", label: "All Units" },
    { id: "by-property", label: "Units by Property" },
    { id: "occupied", label: "Occupied Units" },
    { id: "vacant", label: "Vacant Units" },
  ],
  tenants: [
    { id: "all", label: "All Tenants" },
    { id: "by-property", label: "Tenants by Property" },
    { id: "statement", label: "Individual Tenant Statement" },
  ],
  contracts: [
    { id: "all", label: "All Contracts" },
    { id: "active", label: "Active Contracts" },
    { id: "expiring", label: "Expiring Contracts" },
    { id: "expired", label: "Expired Contracts" },
  ],
  invoices: [
    { id: "all", label: "All Rent Invoices" },
    { id: "paid", label: "Paid Invoices" },
    { id: "unpaid", label: "Unpaid Invoices" },
    { id: "partial", label: "Partially Paid Invoices" },
    { id: "overdue", label: "Overdue Invoices" },
  ],
  halls: [
    { id: "all", label: "All Bookings" },
    { id: "upcoming", label: "Upcoming Bookings" },
    { id: "confirmed", label: "Confirmed Bookings" },
    { id: "completed", label: "Completed Bookings" },
    { id: "cancelled", label: "Cancelled Bookings" },
  ],
  expenses: [
    { id: "all", label: "All Expenses" },
    { id: "by-property", label: "Expenses by Property" },
    { id: "by-category", label: "Expenses by Category" },
  ],
};

export type ReportFilters = {
  module: string;
  report: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  hallId: string;
  category: string;
  status: string;
  from: string;
  to: string;
};

export type ReportColumn = { key: string; label: string; align?: "left" | "right" };

export type ReportPayload = {
  title: string;
  module: string;
  period: string;
  filters: string;
  generatedAt: string;
  preparedBy: string;
  summary: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals?: Record<string, string>;
};

export type ReportOption = { id: string; name: string; property_id?: string };

export function reportFilters(moduleId: string, reportId: string) {
  const dates = moduleId === "contracts" || moduleId === "invoices" || moduleId === "halls" || moduleId === "expenses" || reportId === "statement";
  const property = moduleId !== "halls" && reportId !== "statement";
  const unit = moduleId === "units" && reportId === "all";
  const tenant = moduleId === "invoices" || reportId === "statement";
  const hall = moduleId === "halls";
  const category = moduleId === "expenses" && reportId !== "by-category";
  const status = (moduleId === "units" && reportId === "all") || (moduleId === "contracts" && reportId === "all") || (moduleId === "invoices" && reportId === "all") || (moduleId === "halls" && reportId === "all");
  const propertyRequired = reportId === "individual";
  const tenantRequired = reportId === "statement";
  return { dates, property, unit, tenant, hall, category, status, propertyRequired, tenantRequired };
}
