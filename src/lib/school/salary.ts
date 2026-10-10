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

export type SalaryStaffRow = {
  id: string;
  staffNumber: string;
  name: string;
  jobTitle: string;
  typeName: string;
  status: "active" | "inactive";
  businessUnitId: string;
  businessUnitCode: string;
  businessUnitName: string;
  monthlySalary: number | null;
  salaryEffectiveOn: string;
  paidInPeriod: number;
  outstandingInPeriod: number | null;
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

export function salaryPeriodFromRange(from: string, to = from) {
  void to;
  const start = from.slice(0, 7);
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

export function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const SALARY_METHODS: Array<{ value: SchoolExpenseMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK", label: "Bank" },
];
