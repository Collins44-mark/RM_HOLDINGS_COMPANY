"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { formatTzs } from "@/lib/format/currency";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
  type SchoolContext,
} from "@/lib/school/access";
import { asFeeStatus, feeStatusLabel } from "@/lib/school/fee-types";
import { parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import {
  enrollmentPlacementOr,
  loadPlacementByClassIds,
  loadPlacementByStreamIds,
  resolveEnrollmentPlacementFilterFromCatalog,
} from "@/lib/school/placement-query";
import {
  parseSchoolFinanceSlice,
  parseSchoolReportKind,
  SCHOOL_REPORT_DEFS,
  type SchoolReportKind,
  type SchoolReportWorkspace,
} from "@/lib/school/report-types";
import { schoolExpenseMethodLabel, schoolExpenseSourceLabel } from "@/lib/school/expense-types";
import { parseMoney, remainingSalary, salaryPeriodFromRange } from "@/lib/school/salary";
import { catalogLookup, loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { loadSchoolStructureScope } from "@/lib/school/structure-scope";

const ALL_REPORT_PERMS = [...new Set(SCHOOL_REPORT_DEFS.flatMap((item) => item.permissions))];

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

function localDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function availableKinds(user: Awaited<ReturnType<typeof requireAuth>>): SchoolReportKind[] {
  return SCHOOL_REPORT_DEFS.filter((item) => item.permissions.some((code) => hasPerm(user, code))).map((item) => item.id);
}

function kindPermissions(kind: SchoolReportKind) {
  return SCHOOL_REPORT_DEFS.find((item) => item.id === kind)?.permissions ?? ALL_REPORT_PERMS;
}

function periodBounds(input: { period?: string; from?: string; to?: string }) {
  const period = parseReportPeriod(input.period ?? "this-month");
  const custom = period === "custom" ? { from: str(input.from), to: str(input.to) } : undefined;
  const range = reportPeriodRange(period === "custom" && (!custom?.from || !custom?.to) ? "this-month" : period, new Date(), custom);
  const resolved = period === "custom" && (!custom?.from || !custom?.to) ? ("this-month" as ReportPeriod) : period;
  return { period: resolved, from: localDate(range.from), to: localDate(range.to), label: range.label };
}

async function schoolName(ctx: SchoolContext) {
  const { supabase, businessUnitId } = ctx;
  const [profile, bu] = await Promise.all([
    supabase.from("sch_school_profiles").select("name").eq("business_unit_id", businessUnitId).maybeSingle(),
    supabase.from("business_units").select("name").eq("id", businessUnitId).maybeSingle(),
  ]);
  return str(profile.data?.name) || str(bu.data?.name) || "School Management";
}

function emptyWorkspace(
  kind: SchoolReportKind,
  available: SchoolReportKind[],
  school: string,
  bounds: { label: string; from: string; to: string },
  user: Awaited<ReturnType<typeof requireAuth>>,
): SchoolReportWorkspace {
  return {
    kind,
    available,
    schoolName: school,
    periodLabel: bounds.label,
    from: bounds.from,
    to: bounds.to,
    cards: [],
    columns: [],
    rows: [],
    page: schoolPageMeta(1, 0),
    years: [],
    levels: [],
    classes: [],
    streams: [],
    buses: [],
    expenseTypes: [],
    filtersNote: bounds.label,
    preparedBy: user.name || "System User",
    preparedRole: user.roleName || "School",
  };
}

export type SchoolReportLoadInput = {
  kind?: string;
  period?: string;
  from?: string;
  to?: string;
  slice?: string;
  q?: string;
  levelId?: string;
  classId?: string;
  streamId?: string;
  status?: string;
  academicYearId?: string;
  categoryId?: string;
  busId?: string;
  page?: number;
  pageSize?: number;
  exportAll?: boolean;
};

async function catalogOptions(ctx: SchoolContext, input: SchoolReportLoadInput) {
  const catalog = await loadSchoolStructureCatalog(ctx);
  const levelId = str(input.levelId);
  const classId = str(input.classId);
  return {
    catalog,
    years: catalog.years.map((row) => ({ id: row.id, name: row.name })),
    levels: catalog.levels.map((row) => ({ id: row.id, name: row.name })),
    classes: levelId ? catalog.classes.filter((row) => row.levelId === levelId).map((row) => ({ id: row.id, name: row.name })) : [],
    streams: classId ? catalog.streams.filter((row) => row.classId === classId).map((row) => ({ id: row.id, name: row.name })) : [],
  };
}

async function loadFinance(ctx: SchoolContext, input: SchoolReportLoadInput, base: SchoolReportWorkspace) {
  const { supabase, businessUnitId } = ctx;
  const slice = parseSchoolFinanceSlice(input.slice);
  const options = await catalogOptions(ctx, input);
  const pageSize = input.exportAll ? 500 : parseSchoolPageSize(input.pageSize);
  const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
  const q = searchNeedle(input.q);
  const yearId = str(input.academicYearId);
  const levelId = str(input.levelId);
  const classId = str(input.classId);
  const status = str(input.status);
  const categoryId = str(input.categoryId);
  const busId = str(input.busId);
  const showFees = slice !== "expenses" && slice !== "salaries";
  const showExpenses = slice !== "fees" && slice !== "salaries";
  const showSalaries = slice === "salaries";

  const [typesRes, busesRes, postedExpRes] = await Promise.all([
    supabase.from("sch_expense_categories").select("id, name, is_active").eq("business_unit_id", businessUnitId).order("name"),
    supabase.from("sch_buses").select("id, registration_number, name").eq("business_unit_id", businessUnitId).order("registration_number"),
    showExpenses
      ? supabase
          .from("sch_expenses")
          .select("amount, category_id, bus_id")
          .eq("business_unit_id", businessUnitId)
          .eq("is_active", true)
          .gte("expense_date", base.from)
          .lte("expense_date", base.to)
      : Promise.resolve({ data: [] as Array<{ amount: number; category_id: string; bus_id: string | null }>, error: null }),
  ]);

  let billed = 0;
  let outstanding = 0;
  let withBalance = 0;
  let collected = 0;
  let feeRows: Array<Record<string, string>> = [];
  let feeTotal = 0;

  if (showFees) {
    let accounts = supabase
      .from("sch_v_fee_accounts")
      .select(
        "enrollment_id, student_name, student_number, level_name, class_name, academic_year_name, due_amount, paid_amount, outstanding_amount, fee_status, charge_id, academic_year_id, level_id, class_id",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .order("student_name");
    if (yearId) accounts = accounts.eq("academic_year_id", yearId);
    if (levelId) accounts = accounts.eq("level_id", levelId);
    if (classId) accounts = accounts.eq("class_id", classId);
    if (status === "outstanding" || status === "partial" || status === "paid" || status === "no_structure") {
      accounts = accounts.eq("fee_status", status);
    }
    if (q) accounts = accounts.or(`student_name.ilike.%${q}%,student_number.ilike.%${q}%,admission_number.ilike.%${q}%`);
    const list = await accounts.range(from, to);
    if (list.error && !isSchoolUnconfiguredRead(list.error)) mapSchoolDbError(list.error, "load");
    const rows = list.data ?? [];
    feeTotal = list.count ?? rows.length;
    feeRows = rows.map((row) => {
      const billedAmt = row.due_amount == null ? null : num(row.due_amount);
      const paid = num(row.paid_amount);
      const remaining = row.outstanding_amount == null ? (billedAmt == null ? null : Math.max(0, billedAmt - paid)) : num(row.outstanding_amount);
      if (billedAmt != null) billed += billedAmt;
      if (remaining != null) {
        outstanding += remaining;
        if (remaining > 0) withBalance += 1;
      }
      return {
        student: str(row.student_name),
        studentNumber: str(row.student_number),
        level: str(row.level_name),
        className: str(row.class_name),
        year: str(row.academic_year_name),
        billed: billedAmt == null ? "—" : formatTzs(billedAmt),
        paid: formatTzs(paid),
        outstanding: remaining == null ? "—" : formatTzs(remaining),
        status: feeStatusLabel(asFeeStatus(row.fee_status)),
      };
    });
    if (slice === "fees" || slice === "all") {
      let summaryQuery = supabase.from("sch_v_fee_accounts").select("enrollment_id, due_amount, paid_amount, outstanding_amount");
      summaryQuery = summaryQuery.eq("business_unit_id", businessUnitId);
      if (yearId) summaryQuery = summaryQuery.eq("academic_year_id", yearId);
      if (levelId) summaryQuery = summaryQuery.eq("level_id", levelId);
      if (classId) summaryQuery = summaryQuery.eq("class_id", classId);
      if (status === "outstanding" || status === "partial" || status === "paid" || status === "no_structure") {
        summaryQuery = summaryQuery.eq("fee_status", status);
      }
      if (q) summaryQuery = summaryQuery.or(`student_name.ilike.%${q}%,student_number.ilike.%${q}%,admission_number.ilike.%${q}%`);
      const allAccounts = await summaryQuery;
      billed = 0;
      outstanding = 0;
      withBalance = 0;
      const allRows = allAccounts.data ?? [];
      const enrollmentIds = [...new Set(allRows.map((row) => str(row.enrollment_id)).filter(Boolean))];
      for (let i = 0; i < enrollmentIds.length; i += 100) {
        const chunk = enrollmentIds.slice(i, i + 100);
        const periodPay = await supabase
          .from("sch_fee_payments")
          .select("amount")
          .eq("business_unit_id", businessUnitId)
          .eq("status", "posted")
          .gte("payment_date", base.from)
          .lte("payment_date", base.to)
          .in("enrollment_id", chunk);
        collected += (periodPay.data ?? []).reduce((sum, row) => sum + num(row.amount), 0);
      }
      for (const row of allRows) {
        const billedAmt = row.due_amount == null ? null : num(row.due_amount);
        const remaining = row.outstanding_amount == null ? null : num(row.outstanding_amount);
        if (billedAmt != null) billed += billedAmt;
        if (remaining != null) {
          outstanding += remaining;
          if (remaining > 0) withBalance += 1;
        }
      }
    }
  }

  let expRows: Array<Record<string, string>> = [];
  let expTotal = 0;
  let expPosted = 0;
  let expCount = 0;
  const typeUsed = new Set<string>();
  if (showExpenses) {
    let query = supabase
      .from("sch_expenses")
      .select("id, expense_date, amount, description, reference, method, source_type, category_id, bus_id, is_active", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .gte("expense_date", base.from)
      .lte("expense_date", base.to)
      .order("expense_date", { ascending: false });
    if (categoryId) query = query.eq("category_id", categoryId);
    if (busId) query = query.eq("bus_id", busId);
    if (status === "posted") query = query.eq("is_active", true);
    if (status === "reversed") query = query.eq("is_active", false);
    if (q) query = query.or(`description.ilike.%${q}%,reference.ilike.%${q}%`);
    const list = await query.range(from, to);
    if (list.error && !isSchoolUnconfiguredRead(list.error)) mapSchoolDbError(list.error, "load");
    const typeName = new Map((typesRes.data ?? []).map((row) => [String(row.id), str(row.name)]));
    const busName = new Map((busesRes.data ?? []).map((row) => [String(row.id), [str(row.registration_number), str(row.name)].filter(Boolean).join(" · ")]));
    expTotal = list.count ?? 0;
    expRows = (list.data ?? []).map((row) => ({
      date: str(row.expense_date),
      type: typeName.get(str(row.category_id)) || schoolExpenseSourceLabel(str(row.source_type)),
      description: str(row.description),
      method: schoolExpenseMethodLabel(str(row.method)),
      amount: formatTzs(num(row.amount)),
      reference: str(row.reference),
      bus: busName.get(str(row.bus_id)) || "—",
      status: row.is_active ? "Posted" : "Reversed",
    }));
    for (const row of postedExpRes.data ?? []) {
      if (categoryId && str(row.category_id) !== categoryId) continue;
      if (busId && str(row.bus_id) !== busId) continue;
      expPosted += num(row.amount);
      expCount += 1;
      if (row.category_id) typeUsed.add(str(row.category_id));
    }
  }

  let salaryRows: Array<Record<string, string>> = [];
  let salaryTotal = 0;
  let salaryCommitment = 0;
  let salaryPaid = 0;
  let salaryOutstanding = 0;
  if (showSalaries) {
    const { year, month } = salaryPeriodFromRange(base.from, base.to);
    const [staffRes, allStaffRes, payRes] = await Promise.all([
      supabase
        .from("sch_staff")
        .select("id, staff_number, first_name, middle_name, last_name, employment_status, job_title, monthly_salary", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .eq("employment_status", "active")
        .order("last_name")
        .range(from, to),
      supabase
        .from("sch_staff")
        .select("id, monthly_salary")
        .eq("business_unit_id", businessUnitId)
        .eq("employment_status", "active"),
      supabase
        .from("sch_staff_salary_payments")
        .select("staff_id, amount, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("period_year", year)
        .eq("period_month", month)
        .eq("is_active", true),
    ]);
    if (staffRes.error && !isSchoolUnconfiguredRead(staffRes.error)) mapSchoolDbError(staffRes.error, "load");
    const paidByStaff = new Map<string, number>();
    for (const row of payRes.data ?? []) {
      const id = str(row.staff_id);
      paidByStaff.set(id, (paidByStaff.get(id) ?? 0) + num(row.amount));
    }
    salaryTotal = staffRes.count ?? (staffRes.data ?? []).length;
    for (const row of allStaffRes.data ?? []) {
      const salary = parseMoney(row.monthly_salary);
      const paid = paidByStaff.get(String(row.id)) ?? 0;
      if (salary != null) salaryCommitment += salary;
      salaryPaid += paid;
      salaryOutstanding += remainingSalary(salary, paid) ?? 0;
    }
    salaryRows = (staffRes.data ?? []).map((row) => {
      const salary = parseMoney(row.monthly_salary);
      const paid = paidByStaff.get(String(row.id)) ?? 0;
      const outstanding = remainingSalary(salary, paid);
      return {
        employee: [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
        staffNumber: str(row.staff_number),
        jobTitle: str(row.job_title) || "—",
        commitment: salary == null ? "—" : formatTzs(salary),
        paid: formatTzs(paid),
        outstanding: outstanding == null ? "—" : formatTzs(outstanding),
      };
    });
  }
  const cards =
    slice === "expenses"
      ? [
          { label: "Total Posted Expenses", value: formatTzs(expPosted), hint: "Active expenses in this period" },
          { label: "Posted Transactions", value: String(expCount) },
          { label: "Expense Types Used", value: String(typeUsed.size) },
        ]
      : slice === "fees"
        ? [
            { label: "Fees Billed", value: formatTzs(billed), hint: "Selected fee accounts" },
            { label: "Payments Collected", value: formatTzs(collected), hint: "Posted in this period" },
            { label: "Outstanding Balance", value: formatTzs(outstanding) },
            { label: "Students with Outstanding Balances", value: String(withBalance) },
          ]
        : slice === "salaries"
          ? [
              { label: "Monthly commitment", value: formatTzs(salaryCommitment), hint: "Configured salaries, not cash" },
              { label: "Salary paid", value: formatTzs(salaryPaid), hint: "Posted salary expenses this period" },
              { label: "Outstanding", value: formatTzs(salaryOutstanding) },
            ]
        : [
            { label: "Fees Billed", value: formatTzs(billed), hint: "Selected fee accounts" },
            { label: "Fees Collected", value: formatTzs(collected), hint: "Posted in this period" },
            { label: "Outstanding Fees", value: formatTzs(outstanding) },
            { label: "Operating Expenses", value: formatTzs(expPosted), hint: "Posted in this period" },
          ];

  const useFeesTable = slice !== "expenses" && slice !== "salaries";
  return {
    ...base,
    years: options.years,
    levels: options.levels,
    classes: options.classes,
    streams: options.streams,
    buses: (busesRes.data ?? []).map((row) => ({ id: String(row.id), name: [str(row.registration_number), str(row.name)].filter(Boolean).join(" · ") })),
    expenseTypes: (typesRes.data ?? []).filter((row) => row.is_active).map((row) => ({ id: String(row.id), name: str(row.name) })),
    cards,
    columns: slice === "salaries"
      ? [
          { key: "employee", label: "Employee" },
          { key: "staffNumber", label: "Staff no." },
          { key: "jobTitle", label: "Job title" },
          { key: "commitment", label: "Monthly salary", align: "right" as const },
          { key: "paid", label: "Paid", align: "right" as const },
          { key: "outstanding", label: "Outstanding", align: "right" as const },
        ]
      : useFeesTable
      ? [
          { key: "student", label: "Student" },
          { key: "studentNumber", label: "Student no." },
          { key: "level", label: "Level" },
          { key: "className", label: "Class" },
          { key: "year", label: "Academic year" },
          { key: "billed", label: "Billed", align: "right" as const },
          { key: "paid", label: "Paid", align: "right" as const },
          { key: "outstanding", label: "Outstanding", align: "right" as const },
          { key: "status", label: "Status" },
        ]
      : [
          { key: "date", label: "Date" },
          { key: "type", label: "Expense type" },
          { key: "description", label: "Description" },
          { key: "method", label: "Payment" },
          { key: "amount", label: "Amount", align: "right" as const },
          { key: "reference", label: "Reference" },
          { key: "bus", label: "Bus" },
          { key: "status", label: "Status" },
        ],
    rows: slice === "salaries" ? salaryRows : useFeesTable ? feeRows : expRows,
    page: schoolPageMeta(page, slice === "salaries" ? salaryTotal : useFeesTable ? feeTotal : expTotal, pageSize),
    filtersNote: `${base.periodLabel} · ${slice === "fees" ? "Fees & Payments" : slice === "expenses" ? "Expenses" : slice === "salaries" ? "Salaries" : "All"}`,
  };
}

async function loadAdmissions(ctx: SchoolContext, input: SchoolReportLoadInput, base: SchoolReportWorkspace) {
  const { supabase, businessUnitId } = ctx;
  const options = await catalogOptions(ctx, input);
  const pageSize = input.exportAll ? 500 : parseSchoolPageSize(input.pageSize);
  const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
  const q = searchNeedle(input.q);
  const status = str(input.status);
  const yearId = str(input.academicYearId);
  const levelId = str(input.levelId);
  const classId = str(input.classId);
  const streamId = str(input.streamId);
  let query = supabase
    .from("sch_admissions")
    .select(
      "id, admission_number, status, admission_date, first_name, middle_name, last_name, student_id, stream_id, class_id, academic_year_id, term_id",
      { count: "exact" },
    )
    .eq("business_unit_id", businessUnitId)
    .gte("admission_date", base.from)
    .lte("admission_date", base.to)
    .order("admission_date", { ascending: false });
  if (status === "draft" || status === "completed" || status === "cancelled") query = query.eq("status", status);
  if (yearId) query = query.eq("academic_year_id", yearId);
  if (classId) query = query.eq("class_id", classId);
  else if (levelId) {
    const classIds = options.catalog.classes.filter((row) => row.levelId === levelId).map((row) => row.id);
    if (!classIds.length) {
      return {
        ...base,
        years: options.years,
        levels: options.levels,
        classes: options.classes,
        streams: options.streams,
        cards: [
          { label: "Total Admissions", value: "0" },
          { label: "Completed", value: "0" },
          { label: "Draft", value: "0" },
          { label: "Cancelled", value: "0" },
        ],
      };
    }
    query = query.in("class_id", classIds);
  }
  if (streamId) query = query.eq("stream_id", streamId);
  if (q) {
    const students = await supabase.from("sch_students").select("id").eq("business_unit_id", businessUnitId).ilike("student_number", `%${q}%`);
    const ids = (students.data ?? []).map((row) => String(row.id));
    const studentFilter = ids.length ? `,student_id.in.(${ids.join(",")})` : "";
    query = query.or(`admission_number.ilike.%${q}%,first_name.ilike.%${q}%,middle_name.ilike.%${q}%,last_name.ilike.%${q}%${studentFilter}`);
  }
  const list = await query.range(from, to);
  if (list.error && !isSchoolUnconfiguredRead(list.error)) mapSchoolDbError(list.error, "load");
  const lookup = catalogLookup(options.catalog);
  const raw = list.data ?? [];
  const missingStreams = raw.map((row) => str(row.stream_id)).filter((id) => id && !lookup.placement(id));
  const missingClasses = raw.filter((row) => !str(row.stream_id)).map((row) => str(row.class_id)).filter((id) => id && !lookup.placementByClass(id));
  const [byStream, byClass] = await Promise.all([
    missingStreams.length ? loadPlacementByStreamIds(ctx, missingStreams) : Promise.resolve(new Map()),
    missingClasses.length ? loadPlacementByClassIds(ctx, missingClasses) : Promise.resolve(new Map()),
  ]);
  const yearName = new Map(options.years.map((row) => [row.id, row.name]));
  const termName = new Map(options.catalog.terms.map((row) => [row.id, row.name]));
  const rows = raw
    .map((row) => {
      const place = str(row.stream_id)
        ? lookup.placement(str(row.stream_id)) ?? byStream.get(str(row.stream_id))
        : lookup.placementByClass(str(row.class_id)) ?? byClass.get(str(row.class_id));
      return {
        admissionNumber: str(row.admission_number),
        student: [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
        date: str(row.admission_date),
        level: place?.levelName ?? "",
        className: place?.className ?? "",
        stream: place?.streamName || "—",
        year: yearName.get(str(row.academic_year_id)) || "",
        term: termName.get(str(row.term_id)) || "",
        status: str(row.status),
      };
    });

  let countQuery = supabase
    .from("sch_admissions")
    .select("status")
    .eq("business_unit_id", businessUnitId)
    .gte("admission_date", base.from)
    .lte("admission_date", base.to);
  if (status === "draft" || status === "completed" || status === "cancelled") countQuery = countQuery.eq("status", status);
  if (yearId) countQuery = countQuery.eq("academic_year_id", yearId);
  if (classId) countQuery = countQuery.eq("class_id", classId);
  else if (levelId) {
    const classIds = options.catalog.classes.filter((row) => row.levelId === levelId).map((row) => row.id);
    if (classIds.length) countQuery = countQuery.in("class_id", classIds);
  }
  if (streamId) countQuery = countQuery.eq("stream_id", streamId);
  const counts = await countQuery;
  const all = counts.data ?? [];
  const total = all.length;
  const completed = all.filter((row) => row.status === "completed").length;
  const draft = all.filter((row) => row.status === "draft").length;
  const cancelled = all.filter((row) => row.status === "cancelled").length;

  return {
    ...base,
    years: options.years,
    levels: options.levels,
    classes: options.classes,
    streams: options.streams,
    cards: [
      { label: "Total Admissions", value: String(total), hint: "In this period" },
      { label: "Completed", value: String(completed) },
      { label: "Draft", value: String(draft) },
      { label: "Cancelled", value: String(cancelled) },
    ],
    columns: [
      { key: "admissionNumber", label: "Admission no." },
      { key: "student", label: "Student" },
      { key: "date", label: "Admission date" },
      { key: "level", label: "Level" },
      { key: "className", label: "Class" },
      { key: "stream", label: "Stream" },
      { key: "year", label: "Academic year" },
      { key: "term", label: "Term" },
      { key: "status", label: "Status" },
    ],
    rows,
    page: schoolPageMeta(page, list.count ?? rows.length, pageSize),
    filtersNote: `${base.periodLabel}${status ? ` · ${status}` : ""}`,
  };
}

async function loadStudents(ctx: SchoolContext, input: SchoolReportLoadInput, base: SchoolReportWorkspace, user: Awaited<ReturnType<typeof requireAuth>>) {
  const { supabase, businessUnitId } = ctx;
  const options = await catalogOptions(ctx, input);
  const scope = isOwnerRole(user.roleCode) ? null : await loadSchoolStructureScope(ctx);
  const pageSize = input.exportAll ? 500 : parseSchoolPageSize(input.pageSize);
  const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
  const q = searchNeedle(input.q);
  const status = str(input.status);
  const yearId = str(input.academicYearId);
  const placementFilter = resolveEnrollmentPlacementFilterFromCatalog(options.catalog, input, scope);
  const placementOr = enrollmentPlacementOr(placementFilter);
  let allowedIds: string[] | null = null;
  if (yearId || placementOr) {
    if (placementFilter.kind === "empty") {
      return { ...base, years: options.years, levels: options.levels, classes: options.classes, streams: options.streams };
    }
    let enrollmentsQuery = supabase
      .from("sch_student_enrollments")
      .select("student_id")
      .eq("business_unit_id", businessUnitId)
      .eq("status", "active");
    if (yearId) enrollmentsQuery = enrollmentsQuery.eq("academic_year_id", yearId);
    if (placementOr) enrollmentsQuery = enrollmentsQuery.or(placementOr);
    const enrollments = await enrollmentsQuery;
    allowedIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
    if (!allowedIds.length) {
      return {
        ...base,
        years: options.years,
        levels: options.levels,
        classes: options.classes,
        streams: options.streams,
        cards: [
          { label: "Total Matching Students", value: "0" },
          { label: "Active Students", value: "0" },
        ],
      };
    }
  }
  let query = supabase
    .from("sch_students")
    .select("id, student_number, admission_number, first_name, middle_name, last_name, status", { count: "exact" })
    .eq("business_unit_id", businessUnitId)
    .order("last_name")
    .order("first_name");
  if (allowedIds) query = query.in("id", allowedIds);
  if (status === "active" || status === "inactive") query = query.eq("status", status);
  if (q) query = query.or(`student_number.ilike.%${q}%,admission_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  const list = await query.range(from, to);
  if (list.error && !isSchoolUnconfiguredRead(list.error)) mapSchoolDbError(list.error, "load");
  const ids = (list.data ?? []).map((row) => String(row.id));
  let enrollmentRows = ids.length
    ? supabase
        .from("sch_student_enrollments")
        .select("student_id, stream_id, class_id, status")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .in("student_id", ids)
    : null;
  if (enrollmentRows && yearId) enrollmentRows = enrollmentRows.eq("academic_year_id", yearId);
  const enrollments = enrollmentRows
    ? await enrollmentRows
    : { data: [] as Array<{ student_id: string; stream_id: string | null; class_id: string | null; status: string }> };
  const lookup = catalogLookup(options.catalog);
  const missingStreams = (enrollments.data ?? []).map((row) => str(row.stream_id)).filter((id) => id && !lookup.placement(id));
  const missingClasses = (enrollments.data ?? []).filter((row) => !str(row.stream_id)).map((row) => str(row.class_id)).filter((id) => id && !lookup.placementByClass(id));
  const [byStream, byClass] = await Promise.all([
    missingStreams.length ? loadPlacementByStreamIds(ctx, missingStreams) : Promise.resolve(new Map()),
    missingClasses.length ? loadPlacementByClassIds(ctx, missingClasses) : Promise.resolve(new Map()),
  ]);
  const placeByStudent = new Map<string, { levelName: string; className: string; streamName: string }>();
  for (const row of enrollments.data ?? []) {
    const place = str(row.stream_id)
      ? lookup.placement(str(row.stream_id)) ?? byStream.get(str(row.stream_id))
      : lookup.placementByClass(str(row.class_id)) ?? byClass.get(str(row.class_id));
    placeByStudent.set(String(row.student_id), {
      levelName: place?.levelName ?? "",
      className: place?.className ?? "",
      streamName: place?.streamName ?? "",
    });
  }
  const rows = (list.data ?? []).map((row) => {
    const place = placeByStudent.get(String(row.id));
    return {
      name: [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
      studentNumber: str(row.student_number),
      admissionNumber: str(row.admission_number),
      level: place?.levelName ?? "",
      className: place?.className ?? "",
      stream: place?.streamName || "—",
      status: str(row.status) || "active",
    };
  });
  let activeQuery = supabase.from("sch_students").select("id", { count: "exact", head: true }).eq("business_unit_id", businessUnitId).eq("status", "active");
  if (allowedIds) activeQuery = activeQuery.in("id", allowedIds);
  if (q) activeQuery = activeQuery.or(`student_number.ilike.%${q}%,admission_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  const active = await activeQuery;
  return {
    ...base,
    years: options.years,
    levels: options.levels,
    classes: options.classes,
    streams: options.streams,
    cards: [
      { label: "Total Matching Students", value: String(list.count ?? rows.length) },
      { label: "Active Students", value: String(active.count ?? 0) },
    ],
    columns: [
      { key: "name", label: "Student" },
      { key: "studentNumber", label: "Student no." },
      { key: "admissionNumber", label: "Admission no." },
      { key: "level", label: "Level" },
      { key: "className", label: "Class" },
      { key: "stream", label: "Stream" },
      { key: "status", label: "Status" },
    ],
    rows,
    page: schoolPageMeta(page, list.count ?? rows.length, pageSize),
    filtersNote: base.periodLabel,
  };
}

async function loadParents(ctx: SchoolContext, input: SchoolReportLoadInput, base: SchoolReportWorkspace) {
  const { listSchoolGuardiansAction } = await import("@/actions/school/parents");
  const result = await listSchoolGuardiansAction({
    page: input.page,
    pageSize: input.exportAll ? 100 : input.pageSize,
    q: input.q,
    levelId: input.levelId,
    classId: input.classId,
    streamId: input.streamId,
  });
  if (!result.ok) throw new SchoolError(result.error, "DATABASE");
  const rows: Array<Record<string, string>> = [];
  for (const guardian of result.guardians) {
    const links = guardian.students.length ? guardian.students : [{ studentId: "", name: "", levelName: "", className: "", streamName: "", relationship: "" }];
    for (const student of links) {
      rows.push({
        guardian: guardian.fullName,
        phone: guardian.phone || "—",
        email: guardian.email || "—",
        student: student.name || "—",
        level: student.levelName || "—",
        className: student.className || "—",
        stream: student.streamName || "—",
      });
    }
  }
  const options = await catalogOptions(ctx, input);
  return {
    ...base,
    years: options.years,
    levels: options.levels,
    classes: options.classes,
    streams: options.streams,
    cards: [
      { label: "Matching Guardians", value: String(result.page.total), hint: "Unique guardian records" },
      { label: "Listed Relationships", value: String(rows.length) },
    ],
    columns: [
      { key: "guardian", label: "Guardian" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "student", label: "Student" },
      { key: "level", label: "Level" },
      { key: "className", label: "Class" },
      { key: "stream", label: "Stream" },
    ],
    rows,
    page: result.page,
    filtersNote: "Guardian listings are unique in the summary even when several students are linked.",
  };
}

async function loadTransport(ctx: SchoolContext, input: SchoolReportLoadInput, base: SchoolReportWorkspace) {
  const { supabase, businessUnitId } = ctx;
  const pageSize = input.exportAll ? 500 : parseSchoolPageSize(input.pageSize);
  const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
  const busId = str(input.busId);
  const status = str(input.status);
  const busesRes = await supabase
    .from("sch_buses")
    .select("id, registration_number, name")
    .eq("business_unit_id", businessUnitId)
    .order("registration_number");
  const buses = (busesRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: [str(row.registration_number), str(row.name)].filter(Boolean).join(" · "),
  }));
  let query = supabase
    .from("sch_expenses")
    .select("id, expense_date, amount, description, reference, method, source_type, category_id, bus_id, is_active", { count: "exact" })
    .eq("business_unit_id", businessUnitId)
    .in("source_type", ["TRANSPORT_FUEL", "TRANSPORT_MAINTENANCE"])
    .gte("expense_date", base.from)
    .lte("expense_date", base.to)
    .order("expense_date", { ascending: false });
  if (busId) query = query.eq("bus_id", busId);
  else query = query.not("bus_id", "is", null);
  if (status === "posted") query = query.eq("is_active", true);
  if (status === "reversed") query = query.eq("is_active", false);
  const list = await query.range(from, to);
  if (list.error && !isSchoolUnconfiguredRead(list.error)) mapSchoolDbError(list.error, "load");
  const busName = new Map(buses.map((row) => [row.id, row.name]));
  const rows = (list.data ?? []).map((row) => ({
    date: str(row.expense_date),
    bus: busName.get(str(row.bus_id)) || "—",
    type: schoolExpenseSourceLabel(str(row.source_type)),
    description: str(row.description),
    method: schoolExpenseMethodLabel(str(row.method)),
    amount: formatTzs(num(row.amount)),
    reference: str(row.reference),
    status: row.is_active ? "Posted" : "Reversed",
  }));
  let totalsQuery = supabase
    .from("sch_expenses")
    .select("amount, source_type, is_active")
    .eq("business_unit_id", businessUnitId)
    .in("source_type", ["TRANSPORT_FUEL", "TRANSPORT_MAINTENANCE"])
    .eq("is_active", true)
    .gte("expense_date", base.from)
    .lte("expense_date", base.to);
  if (busId) totalsQuery = totalsQuery.eq("bus_id", busId);
  else totalsQuery = totalsQuery.not("bus_id", "is", null);
  const totals = await totalsQuery;
  let posted = 0;
  let fuel = 0;
  let maint = 0;
  let count = 0;
  for (const row of totals.data ?? []) {
    const amount = num(row.amount);
    posted += amount;
    count += 1;
    if (row.source_type === "TRANSPORT_FUEL") fuel += amount;
    if (row.source_type === "TRANSPORT_MAINTENANCE") maint += amount;
  }
  return {
    ...base,
    buses,
    cards: [
      { label: "Total Posted Transport Expenses", value: formatTzs(posted) },
      { label: "Fuel Expenses", value: formatTzs(fuel) },
      { label: "Maintenance Expenses", value: formatTzs(maint) },
      { label: "Transactions", value: String(count) },
    ],
    columns: [
      { key: "date", label: "Date" },
      { key: "bus", label: "Bus" },
      { key: "type", label: "Expense type" },
      { key: "description", label: "Description" },
      { key: "method", label: "Payment" },
      { key: "amount", label: "Amount", align: "right" as const },
      { key: "reference", label: "Reference" },
      { key: "status", label: "Status" },
    ],
    rows,
    page: schoolPageMeta(page, list.count ?? rows.length, pageSize),
    filtersNote: `${base.periodLabel} · ${busId ? buses.find((item) => item.id === busId)?.name ?? "Bus" : "All Buses"}`,
  };
}

export async function loadSchoolReportsWorkspaceAction(input: SchoolReportLoadInput = {}) {
  try {
    const user = await requireAuth();
    const kinds = availableKinds(user);
    if (!kinds.length) throw new SchoolError("This action isn’t available.", "UNAUTHORIZED");
    const requested = parseSchoolReportKind(input.kind) ?? kinds[0];
    const kind = kinds.includes(requested) ? requested : kinds[0];
    const ctx = await requireAnySchoolPermission(kindPermissions(kind));
    const bounds = periodBounds(input);
    const school = await schoolName(ctx);
    const base = emptyWorkspace(kind, kinds, school, bounds, user);
    if (kind === "finance") return { ok: true as const, workspace: await loadFinance(ctx, input, base) };
    if (kind === "admissions") return { ok: true as const, workspace: await loadAdmissions(ctx, input, base) };
    if (kind === "students") return { ok: true as const, workspace: await loadStudents(ctx, input, base, user) };
    if (kind === "parents") return { ok: true as const, workspace: await loadParents(ctx, input, base) };
    return { ok: true as const, workspace: await loadTransport(ctx, input, base) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type SchoolReportsWorkspaceResult = Awaited<ReturnType<typeof loadSchoolReportsWorkspaceAction>>;
