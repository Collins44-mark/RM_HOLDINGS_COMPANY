import type { ReportPeriod } from "@/lib/data/report-period";
import type { SchoolPageMeta } from "@/lib/school/pagination";
import type { SchoolExpenseMethod } from "@/lib/school/expense-types";

export const SCHOOL_SALARY_EXPENSE_CODE = "SALARY";

export type SalaryAllocationInput = {
  costBusinessUnitId: string;
  amount: number;
};

export type SalaryAllocationRow = SalaryAllocationInput & {
  id: string;
  costBusinessUnitCode: string;
  costBusinessUnitName: string;
  payday: number;
  effectiveOn: string;
  isActive: boolean;
};

export type SalaryPaymentRow = {
  id: string;
  staffId: string;
  staffName: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string;
  notes: string;
  expenseId: string | null;
  isActive: boolean;
};

export type SalaryPayStatus = "unpaid" | "partial" | "paid";

export type SalaryStaffRow = {
  id: string;
  arrangementId: string;
  staffNumber: string;
  name: string;
  jobTitle: string;
  typeName: string;
  status: "active" | "inactive";
  salaryActive: boolean;
  payday: number;
  businessUnitId: string;
  businessUnitCode: string;
  businessUnitName: string;
  costBusinessUnitId: string;
  costBusinessUnitCode: string;
  costBusinessUnitName: string;
  monthlySalary: number | null;
  salaryEffectiveOn: string;
  paidInPeriod: number;
  outstandingInPeriod: number | null;
  payStatus: SalaryPayStatus | null;
  allocations: SalaryAllocationRow[];
};

export type SalaryCaps = {
  canView: boolean;
  canManage: boolean;
  canPay: boolean;
};

export type SalarySummary = {
  employeeCount: number;
  withSalary: number;
  commitment: number;
  paid: number;
  outstanding: number;
};

export type SalaryWorkspace = {
  employees: SalaryStaffRow[];
  payees: SalaryStaffRow[];
  payments: SalaryPaymentRow[];
  history: Array<{
    id: string;
    staffId: string;
    staffName: string;
    monthlySalary: number;
    effectiveOn: string;
    createdAt: string;
  }>;
  units: Array<{ id: string; code: string; name: string }>;
  summary: SalarySummary;
  page: SchoolPageMeta;
  period: ReportPeriod;
  from: string;
  to: string;
  periodYear: number;
  periodMonth: number;
  unitCode: string;
  lockedUnitCode: string;
  q: string;
  status: string;
  capabilities: SalaryCaps;
};

export function parseMoney(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function allocationsTotal(allocations: Array<{ amount: number }>) {
  return Math.round(allocations.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0) * 100) / 100;
}

export function allocationsReconcile(salary: number, allocations: Array<{ amount: number }>) {
  if (!(salary >= 0)) return false;
  if (!allocations.length) return true;
  return Math.abs(allocationsTotal(allocations) - salary) < 0.005;
}

export function remainingSalary(monthlySalary: number | null, paidInPeriod: number) {
  if (monthlySalary == null) return null;
  return Math.max(0, Math.round((monthlySalary - paidInPeriod) * 100) / 100);
}

export function parsePayday(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

export function salaryPayStatus(monthlySalary: number | null, paidInPeriod: number): SalaryPayStatus | null {
  if (monthlySalary == null) return null;
  if (paidInPeriod <= 0) return "unpaid";
  if (paidInPeriod + 0.005 >= monthlySalary) return "paid";
  return "partial";
}

function parseYearMonth(value: string) {
  const stamp = value.slice(0, 7);
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Map a finance date range onto a payroll month.
 * Salary payments are stored by period_year / period_month, not payment_date.
 * Multi-month ranges (this year, custom spans) use today's month when it falls
 * inside the range so Owner Consolidated Finance matches School Salaries.
 */
export function salaryPeriodFromRange(from: string, to = from, now = new Date()) {
  const start = parseYearMonth(from);
  const end = parseYearMonth(to);
  if (!start) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  if (!end || (start.year === end.year && start.month === end.month)) {
    return start;
  }
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const key = (period: { year: number; month: number }) => period.year * 12 + period.month;
  if (key(current) >= key(start) && key(current) <= key(end)) {
    return current;
  }
  return start;
}

export function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const SALARY_METHODS: Array<{ value: SchoolExpenseMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK", label: "Bank" },
];
