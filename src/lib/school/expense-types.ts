import type { ReportPeriod } from "@/lib/data/report-period";
import type { SchoolPageMeta } from "@/lib/school/pagination";

export type SchoolExpenseMethod = "CASH" | "MOBILE_MONEY" | "BANK";

export type SchoolExpenseSource =
  | "MANUAL"
  | "TRANSPORT_FUEL"
  | "TRANSPORT_MAINTENANCE"
  | "SALARY"
  | "STORE_ISSUE"
  | "STORE_COGS"
  | "EMERGENCY";

export type SchoolExpenseFundingSource = "OPERATING" | "EMERGENCY";

export type SchoolExpenseCaps = {
  canView: boolean;
  canRecord: boolean;
  canManageTypes: boolean;
  canReverse: boolean;
  canManageFund: boolean;
};

export const SCHOOL_OTHER_EXPENSE_CODE = "OTHER";

export type SchoolExpenseTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  postedAmount: number;
  postedCount: number;
};

export function isSchoolSystemExpenseType(code: string) {
  return code.trim().toUpperCase() === SCHOOL_OTHER_EXPENSE_CODE;
}

export function sortSchoolExpenseTypes<T extends { isSystem: boolean; name: string }>(types: T[]) {
  return [...types].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export type SchoolExpenseBusOption = {
  id: string;
  registrationNumber: string;
  name: string;
  isActive: boolean;
};

export type SchoolExpenseRow = {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  amount: number;
  description: string;
  reference: string;
  method: string;
  payee: string;
  sourceType: SchoolExpenseSource;
  sourceId: string | null;
  categoryId: string;
  categoryName: string;
  busId: string | null;
  busLabel: string;
  isActive: boolean;
};

export type SchoolExpenseSummary = {
  totalPosted: number;
  postedCount: number;
  typesUsed: number;
};

export type SchoolExpenseWorkspace = {
  expenses: SchoolExpenseRow[];
  types: SchoolExpenseTypeRow[];
  buses: SchoolExpenseBusOption[];
  summary: SchoolExpenseSummary;
  page: SchoolPageMeta;
  period: ReportPeriod;
  from: string;
  to: string;
  categoryId: string;
  q: string;
  capabilities: SchoolExpenseCaps;
  emergencyFund: import("@/lib/school/store-types").SchoolEmergencyFund;
};

export const SCHOOL_EXPENSE_METHODS: Array<{ value: SchoolExpenseMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK", label: "Bank" },
];

export function schoolExpenseMethodLabel(method: string) {
  if (method === "MOBILE_MONEY") return "Mobile Money";
  if (method === "BANK") return "Bank";
  if (method === "CASH") return "Cash";
  return "—";
}

export function schoolExpenseSourceLabel(source: string) {
  if (source === "TRANSPORT_FUEL") return "Transport / Fuel";
  if (source === "TRANSPORT_MAINTENANCE") return "Transport / Maintenance";
  if (source === "SALARY") return "Salary";
  if (source === "STORE_ISSUE") return "Store / school use";
  if (source === "STORE_COGS") return "Store / cost of sales";
  if (source === "EMERGENCY") return "Emergency fund";
  return "School expense";
}

export function schoolExpenseSourceHref(source: string) {
  if (source === "TRANSPORT_FUEL") return "/school/transport/fuel";
  if (source === "TRANSPORT_MAINTENANCE") return "/school/transport/maintenance";
  if (source === "SALARY") return "/school/expenses/salaries";
  if (source === "STORE_ISSUE" || source === "STORE_COGS") return "/school/store";
  return null;
}

export function expenseCategoryCode(name: string) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return slug.length >= 2 ? slug : `TYPE_${slug || "CAT"}`;
}
