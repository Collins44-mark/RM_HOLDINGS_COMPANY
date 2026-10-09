import type { SchoolPageMeta } from "@/lib/school/pagination";
import type { ReportPeriod } from "@/lib/data/report-period";

export const SCHOOL_REPORT_KINDS = ["finance", "admissions", "students", "parents", "transport"] as const;
export type SchoolReportKind = (typeof SCHOOL_REPORT_KINDS)[number];

export const SCHOOL_FINANCE_SLICES = ["all", "fees", "expenses"] as const;
export type SchoolFinanceSlice = (typeof SCHOOL_FINANCE_SLICES)[number];

export type SchoolReportOption = { id: string; name: string };

export type SchoolReportCard = { label: string; value: string; hint?: string };

export type SchoolReportColumn = { key: string; label: string; align?: "left" | "right" };

export type SchoolReportKindDef = {
  id: SchoolReportKind;
  label: string;
  description: string;
  registryId: string;
  permissions: string[];
};

export const SCHOOL_REPORT_DEFS: SchoolReportKindDef[] = [
  {
    id: "finance",
    label: "Finance Report",
    description: "Fees billed, posted collections, outstanding balances and operating expenses.",
    registryId: "school-finance",
    permissions: [
      "school.fees.view",
      "school.fees.manage",
      "school.fees.record",
      "school.fees.verify",
      "school.fees.receipt",
      "school.expenses.view",
    ],
  },
  {
    id: "admissions",
    label: "Admissions Report",
    description: "Admission records by status, date and placement.",
    registryId: "school-admissions",
    permissions: ["school.admissions.view", "school.admissions.manage"],
  },
  {
    id: "students",
    label: "Students Report",
    description: "Enrolled students from completed admissions.",
    registryId: "school-students",
    permissions: ["school.students.view", "school.students.manage"],
  },
  {
    id: "parents",
    label: "Parents / Guardians Report",
    description: "Guardians and their linked students.",
    registryId: "school-parents",
    permissions: ["school.parents.view", "school.parents.manage"],
  },
  {
    id: "transport",
    label: "Transport Report",
    description: "Posted fuel and maintenance expenses by bus.",
    registryId: "school-transport",
    permissions: ["school.transport.view", "school.expenses.view", "school.buses.view", "school.fuel.view", "school.maintenance.view"],
  },
];

export type SchoolReportFilterState = {
  kind: SchoolReportKind;
  period: ReportPeriod;
  from: string;
  to: string;
  slice: SchoolFinanceSlice;
  q: string;
  levelId: string;
  classId: string;
  streamId: string;
  status: string;
  academicYearId: string;
  categoryId: string;
  busId: string;
  page: number;
  pageSize: number;
};

export type SchoolReportWorkspace = {
  kind: SchoolReportKind;
  available: SchoolReportKind[];
  schoolName: string;
  periodLabel: string;
  from: string;
  to: string;
  cards: SchoolReportCard[];
  columns: SchoolReportColumn[];
  rows: Array<Record<string, string>>;
  page: SchoolPageMeta;
  years: SchoolReportOption[];
  levels: SchoolReportOption[];
  classes: SchoolReportOption[];
  streams: SchoolReportOption[];
  buses: SchoolReportOption[];
  expenseTypes: SchoolReportOption[];
  filtersNote: string;
  preparedBy: string;
  preparedRole: string;
};

export function parseSchoolReportKind(value: string | null | undefined): SchoolReportKind | null {
  return SCHOOL_REPORT_KINDS.includes(value as SchoolReportKind) ? (value as SchoolReportKind) : null;
}

export function parseSchoolFinanceSlice(value: string | null | undefined): SchoolFinanceSlice {
  return SCHOOL_FINANCE_SLICES.includes(value as SchoolFinanceSlice) ? (value as SchoolFinanceSlice) : "all";
}

export function schoolReportKindFromRegistryId(reportId: string | null | undefined): SchoolReportKind | null {
  return SCHOOL_REPORT_DEFS.find((item) => item.registryId === reportId)?.id ?? parseSchoolReportKind(reportId);
}
