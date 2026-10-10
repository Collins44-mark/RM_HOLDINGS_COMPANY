"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import { formatCompactStaffNumber } from "@/lib/school/student-number";
import { upsertSalaryArrangement } from "@/lib/school/salary-arrangement";
import {
  parseMoney,
  remainingSalary,
  salaryPayStatus,
  salaryPeriodFromRange,
  type SalaryAllocationRow,
  type SalaryCaps,
  type SalaryStaffRow,
  type SalarySummary,
  type SalaryWorkspace,
} from "@/lib/school/salary";

const VIEW = "school.payroll.view";
const MANAGE = "school.payroll.manage";
const PAY = "school.payroll.pay";
const VIEW_ANY = [VIEW, MANAGE, PAY];

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function personName(first: string, middle: string, last: string) {
  return [first, middle, last].filter(Boolean).join(" ");
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>): SalaryCaps {
  return {
    canView: VIEW_ANY.some((code) => hasPerm(user, code)),
    canManage: hasPerm(user, MANAGE),
    canPay: hasPerm(user, PAY),
  };
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

function periodBounds(input: { period?: string; from?: string; to?: string }) {
  const period = parseReportPeriod(input.period ?? "this-month");
  const custom = period === "custom" ? { from: str(input.from), to: str(input.to) } : undefined;
  const range = reportPeriodRange(period === "custom" && (!custom?.from || !custom?.to) ? "this-month" : period, new Date(), custom);
  return {
    period: period === "custom" && (!custom?.from || !custom?.to) ? ("this-month" as ReportPeriod) : period,
    from: localDate(range.from),
    to: localDate(range.to),
  };
}

async function audit(input: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  businessUnitId: string;
}) {
  await writeAuditEvent({ ...input, module: "school", severity: "medium" });
}

function refreshSalary() {
  revalidatePath("/school/expenses/salaries");
  revalidatePath("/school/expenses");
  revalidatePath("/school/staff");
  revalidatePath("/supermarket/finance/salaries");
  revalidatePath("/owner/finance");
  revalidatePath("/owner/reports");
  revalidatePath("/school");
}

export type SchoolSalaryWorkspaceResult =
  | { ok: true; workspace: SalaryWorkspace }
  | { ok: false; error: string };

export async function loadSchoolSalaryWorkspaceAction(input: {
  period?: ReportPeriod | string;
  from?: string;
  to?: string;
  q?: string;
  status?: string;
  unitCode?: string;
  lockedUnitCode?: string;
  periodYear?: number | string;
  periodMonth?: number | string;
  page?: number;
  pageSize?: number;
} = {}): Promise<SchoolSalaryWorkspaceResult> {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW_ANY);
    const { period, from: fromDate, to: toDate } = periodBounds(input);
    const fromRange = salaryPeriodFromRange(fromDate, toDate);
    const year = Number(input.periodYear) || fromRange.year;
    const month = Number(input.periodMonth) || fromRange.month;
    const pageSize = parseSchoolPageSize(input.pageSize);
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const status = str(input.status);
    const lockedUnitCode = str(input.lockedUnitCode);
    const unitCode = lockedUnitCode || str(input.unitCode);

    const [staffRes, unitsRes, payRes, allocRes, histRes] = await Promise.all([
      supabase
        .from("sch_staff")
        .select(
          "id, staff_number, first_name, middle_name, last_name, employment_status, job_title, monthly_salary, salary_effective_on, business_unit_id, sch_staff_types(name), sch_staff_positions(name)",
        )
        .eq("business_unit_id", businessUnitId)
        .order("last_name")
        .order("first_name"),
      supabase.from("business_units").select("id, code, name").order("name"),
      supabase
        .from("sch_staff_salary_payments")
        .select(
          "id, staff_id, cost_business_unit_id, period_year, period_month, amount, payment_date, method, reference, notes, expense_id, is_active, created_at",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("period_year", year)
        .eq("period_month", month)
        .order("payment_date", { ascending: false }),
      supabase
        .from("sch_staff_salary_allocations")
        .select("id, staff_id, cost_business_unit_id, amount, payday, effective_on, is_active")
        .eq("business_unit_id", businessUnitId),
      supabase
        .from("sch_staff_salary_history")
        .select("id, staff_id, monthly_salary, effective_on, created_at")
        .eq("business_unit_id", businessUnitId)
        .order("effective_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (staffRes.error && !isSchoolUnconfiguredRead(staffRes.error)) mapSchoolDbError(staffRes.error, "load");
    if (payRes.error && !isSchoolUnconfiguredRead(payRes.error)) mapSchoolDbError(payRes.error, "load");

    let allocations = allocRes.data ?? [];
    if (allocRes.error && !isSchoolUnconfiguredRead(allocRes.error)) {
      const fallback = await supabase
        .from("sch_staff_salary_allocations")
        .select("id, staff_id, cost_business_unit_id, amount")
        .eq("business_unit_id", businessUnitId);
      allocations = (fallback.data ?? []).map((row) => ({ ...row, payday: 28, effective_on: null, is_active: true }));
    }

    let payments = payRes.data ?? [];
    if (payRes.error) {
      const fallback = await supabase
        .from("sch_staff_salary_payments")
        .select(
          "id, staff_id, period_year, period_month, amount, payment_date, method, reference, notes, expense_id, is_active, created_at",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("period_year", year)
        .eq("period_month", month)
        .order("payment_date", { ascending: false });
      payments = (fallback.data ?? []).map((row) => ({ ...row, cost_business_unit_id: businessUnitId }));
    }

    const units = (unitsRes.data ?? []).map((row) => ({
      id: String(row.id),
      code: str(row.code),
      name: str(row.name),
    }));
    const unitById = new Map(units.map((row) => [row.id, row]));
    const unitByCode = new Map(units.map((row) => [row.code, row]));
    const schoolUnit = units.find((row) => row.id === businessUnitId) ?? {
      id: businessUnitId,
      code: "school",
      name: "School",
    };

    const staffById = new Map(
      (staffRes.data ?? []).map((row) => {
        const type = row.sch_staff_types as { name?: string } | null;
        const position = row.sch_staff_positions as { name?: string } | null;
        return [
          String(row.id),
          {
            id: String(row.id),
            staffNumber: str(row.staff_number),
            name: personName(str(row.first_name), str(row.middle_name), str(row.last_name)),
            jobTitle: str(row.job_title) || str(position?.name),
            typeName: str(type?.name),
            status: str(row.employment_status) === "inactive" ? ("inactive" as const) : ("active" as const),
            monthlySalary: parseMoney(row.monthly_salary),
            salaryEffectiveOn: String(row.salary_effective_on ?? ""),
          },
        ];
      }),
    );

    const paidKey = (staffId: string, costId: string) => `${staffId}:${costId}`;
    const paidByKey = new Map<string, number>();
    for (const row of payments) {
      if (!row.is_active) continue;
      const staffId = String(row.staff_id);
      const costId = str(row.cost_business_unit_id) || businessUnitId;
      const key = paidKey(staffId, costId);
      paidByKey.set(key, (paidByKey.get(key) ?? 0) + num(row.amount));
    }

    const filterUnit = unitCode ? unitByCode.get(unitCode) : null;
    let rows: SalaryStaffRow[] = [];
    for (const row of allocations) {
      const amount = parseMoney(row.amount);
      if (amount == null) continue;
      const staff = staffById.get(String(row.staff_id));
      if (!staff) continue;
      const costId = String(row.cost_business_unit_id || businessUnitId);
      const cost = unitById.get(costId) ?? schoolUnit;
      if (filterUnit && cost.id !== filterUnit.id) continue;
      const paidInPeriod = paidByKey.get(paidKey(staff.id, costId)) ?? 0;
      const outstanding = remainingSalary(amount, paidInPeriod);
      const allocation: SalaryAllocationRow = {
        id: String(row.id),
        costBusinessUnitId: costId,
        amount,
        costBusinessUnitCode: cost.code,
        costBusinessUnitName: cost.name,
        payday: Number(row.payday) || 28,
        effectiveOn: String(row.effective_on ?? staff.salaryEffectiveOn),
        isActive: row.is_active !== false,
      };
      rows.push({
        id: staff.id,
        arrangementId: String(row.id),
        staffNumber: staff.staffNumber,
        name: staff.name,
        jobTitle: staff.jobTitle,
        typeName: staff.typeName,
        status: staff.status,
        salaryActive: allocation.isActive,
        payday: allocation.payday,
        businessUnitId,
        businessUnitCode: schoolUnit.code,
        businessUnitName: schoolUnit.name,
        costBusinessUnitId: costId,
        costBusinessUnitCode: cost.code,
        costBusinessUnitName: cost.name,
        monthlySalary: amount,
        salaryEffectiveOn: allocation.effectiveOn,
        paidInPeriod,
        outstandingInPeriod: outstanding,
        payStatus: salaryPayStatus(amount, paidInPeriod),
        allocations: [allocation],
      });
    }

    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.staffNumber.toLowerCase().includes(needle) ||
          formatCompactStaffNumber(row.staffNumber).toLowerCase().includes(needle) ||
          row.jobTitle.toLowerCase().includes(needle),
      );
    }
    if (status === "active" || status === "inactive") {
      rows = rows.filter((row) => row.status === status && row.salaryActive);
    } else if (status === "inactive-salary") {
      rows = rows.filter((row) => !row.salaryActive);
    }

    rows.sort((a, b) => a.name.localeCompare(b.name) || a.costBusinessUnitName.localeCompare(b.costBusinessUnitName));

    const summary: SalarySummary = {
      employeeCount: new Set(rows.filter((row) => row.salaryActive).map((row) => row.id)).size,
      withSalary: rows.filter((row) => row.salaryActive).length,
      commitment: rows.filter((row) => row.salaryActive).reduce((sum, row) => sum + (row.monthlySalary ?? 0), 0),
      paid: rows.reduce((sum, row) => sum + row.paidInPeriod, 0),
      outstanding: rows.filter((row) => row.salaryActive).reduce((sum, row) => sum + (row.outstandingInPeriod ?? 0), 0),
    };

    const pageRows = rows.slice(from, to + 1);
    const names = new Map(rows.map((row) => [row.id, row.name]));

    return {
      ok: true,
      workspace: {
        employees: pageRows,
        payees: rows.filter((row) => row.salaryActive && row.monthlySalary != null),
        payments: payments.map((row) => ({
          id: String(row.id),
          staffId: String(row.staff_id),
          staffName: names.get(String(row.staff_id)) || staffById.get(String(row.staff_id))?.name || "Staff",
          periodYear: num(row.period_year),
          periodMonth: num(row.period_month),
          amount: num(row.amount),
          paymentDate: String(row.payment_date ?? ""),
          method: str(row.method),
          reference: str(row.reference),
          notes: str(row.notes),
          expenseId: row.expense_id ? String(row.expense_id) : null,
          isActive: Boolean(row.is_active),
        })),
        history: (histRes.data ?? []).map((row) => ({
          id: String(row.id),
          staffId: String(row.staff_id),
          staffName: staffById.get(String(row.staff_id))?.name || "Staff",
          monthlySalary: num(row.monthly_salary),
          effectiveOn: String(row.effective_on ?? ""),
          createdAt: String(row.created_at ?? ""),
        })),
        units,
        summary,
        page: schoolPageMeta(page, rows.length, pageSize),
        period,
        from: fromDate,
        to: toDate,
        periodYear: year,
        periodMonth: month,
        unitCode,
        lockedUnitCode,
        q: str(input.q),
        status,
        capabilities: caps(user),
      },
    };
  } catch (error) {
    return { ok: false, error: schoolActionError(error) };
  }
}

export async function saveSchoolStaffSalaryAction(input: {
  staffId: string;
  monthlySalary?: number | string | null;
  salaryEffectiveOn?: string;
  costBusinessUnitId?: string;
  payday?: number | string | null;
  salaryActive?: boolean;
  allocations?: Array<{ costBusinessUnitId: string; amount: number }>;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSchoolPermission(MANAGE);
    const staffId = str(input.staffId);
    if (!staffId) throw new SchoolError("Staff member was not found.", "NOT_FOUND");
    const salary = parseMoney(input.monthlySalary);
    if (salary != null && salary < 0) throw new SchoolError("Monthly salary cannot be negative.", "VALIDATION");
    const effectiveOn = str(input.salaryEffectiveOn);
    if (salary != null && effectiveOn && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) {
      throw new SchoolError("Enter a valid salary effective date.", "VALIDATION");
    }

    const current = await supabase
      .from("sch_staff")
      .select("id, first_name, last_name, monthly_salary")
      .eq("business_unit_id", businessUnitId)
      .eq("id", staffId)
      .maybeSingle();
    if (!current.data) throw new SchoolError("Staff member was not found.", "NOT_FOUND");

    const extra = (input.allocations ?? []).filter((row) => str(row.costBusinessUnitId) && (parseMoney(row.amount) ?? 0) > 0);
    const targets =
      extra.length > 0
        ? extra.map((row) => ({
            costBusinessUnitId: str(row.costBusinessUnitId),
            monthlySalary: parseMoney(row.amount),
          }))
        : [{ costBusinessUnitId: str(input.costBusinessUnitId) || businessUnitId, monthlySalary: salary }];

    for (const target of targets) {
      const saved = await upsertSalaryArrangement(supabase, {
        staffHomeBusinessUnitId: businessUnitId,
        staffId,
        costBusinessUnitId: target.costBusinessUnitId,
        monthlySalary: target.monthlySalary,
        payday: input.payday,
        effectiveOn,
        isActive: input.salaryActive !== false && target.monthlySalary != null,
      });
      if (saved.error) throw new SchoolError(saved.error, "DATABASE");
    }

    await audit({
      action: "school.salary_updated",
      description: `Salary updated · ${personName(str(current.data.first_name), "", str(current.data.last_name))}`,
      entityType: "sch_staff",
      entityId: staffId,
      businessUnitId,
    });
    void userId;
    refreshSalary();
    return { ok: true as const, monthlySalary: salary };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function recordSchoolSalaryPaymentAction(input: {
  staffId: string;
  costBusinessUnitId?: string;
  periodYear: number | string;
  periodMonth: number | string;
  amount: number | string;
  paymentDate: string;
  method: string;
  reference?: string;
  notes?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSchoolPermission(PAY);
    const staffId = str(input.staffId);
    const amount = parseMoney(input.amount);
    if (!staffId) throw new SchoolError("Select an employee.", "VALIDATION");
    if (amount == null || !(amount > 0)) throw new SchoolError("Amount must be greater than zero.", "VALIDATION");
    const year = Number(input.periodYear);
    const month = Number(input.periodMonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new SchoolError("Choose a valid salary period.", "VALIDATION");
    }
    const paymentDate = str(input.paymentDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new SchoolError("Enter a valid payment date.", "VALIDATION");
    const method = str(input.method).toUpperCase();
    if (method !== "CASH" && method !== "MOBILE_MONEY" && method !== "BANK") {
      throw new SchoolError("Choose a valid payment method.", "VALIDATION");
    }
    const reference = str(input.reference);
    if (method !== "CASH" && reference.length < 2) throw new SchoolError("Enter a payment reference.", "VALIDATION");
    const requestId = str(input.requestId);
    if (!requestId) throw new SchoolError("Salary payment request is invalid.", "VALIDATION");
    const costBusinessUnitId = str(input.costBusinessUnitId) || businessUnitId;

    const payloadArgs = {
      p_staff_id: staffId,
      p_period_year: year,
      p_period_month: month,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_method: method,
      p_reference: reference,
      p_notes: str(input.notes),
      p_request_id: requestId,
      p_actor_id: userId,
      p_cost_business_unit_id: costBusinessUnitId,
    };
    let { data, error } = await supabase.rpc("sch_record_salary_payment", payloadArgs);
    if (error && /could not find|schema cache|does not exist|PGRST202/i.test(error.message)) {
      const retry = await supabase.rpc("sch_record_salary_payment", {
        p_staff_id: staffId,
        p_period_year: year,
        p_period_month: month,
        p_amount: amount,
        p_payment_date: paymentDate,
        p_method: method,
        p_reference: reference,
        p_notes: str(input.notes),
        p_request_id: requestId,
        p_actor_id: userId,
      });
      data = retry.data;
      error = retry.error;
    }
    if (error) throw new SchoolError(error.message || "Couldn't record this salary payment.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; expense_id?: string; expense_number?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: "school.salary_paid",
        description: `Salary payment recorded · ${payload.expense_number ?? ""} · ${amount}`,
        entityType: "sch_staff_salary_payments",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshSalary();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
