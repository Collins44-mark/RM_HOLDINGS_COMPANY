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
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import {
  expenseCategoryCode,
  type SchoolExpenseBusOption,
  type SchoolExpenseCaps,
  type SchoolExpenseRow,
  type SchoolExpenseSource,
  type SchoolExpenseSummary,
  type SchoolExpenseTypeRow,
  type SchoolExpenseWorkspace,
} from "@/lib/school/expense-types";
import { parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";

const VIEW = "school.expenses.view";
const CREATE = "school.expenses.create";
const EDIT = "school.expenses.edit";
const TRANSPORT_VIEW = "school.transport.view";
const VIEW_ANY = [VIEW, CREATE, EDIT, TRANSPORT_VIEW];

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

function asSource(value: unknown): SchoolExpenseSource {
  if (value === "TRANSPORT_FUEL" || value === "TRANSPORT_MAINTENANCE") return value;
  return "MANUAL";
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>): SchoolExpenseCaps {
  return {
    canView: VIEW_ANY.some((code) => hasPerm(user, code)),
    canRecord: hasPerm(user, CREATE),
    canManageTypes: hasPerm(user, EDIT),
    canReverse: hasPerm(user, EDIT),
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

function emptySummary(): SchoolExpenseSummary {
  return { totalPosted: 0, postedCount: 0, typesUsed: 0 };
}

function emptyWorkspace(capabilities: SchoolExpenseCaps, period: ReportPeriod, from: string, to: string): SchoolExpenseWorkspace {
  return {
    expenses: [],
    types: [],
    buses: [],
    summary: emptySummary(),
    page: schoolPageMeta(1, 0),
    period,
    from,
    to,
    categoryId: "",
    q: "",
    capabilities,
  };
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

export async function loadSchoolExpensesWorkspaceAction(
  input: {
    page?: number;
    pageSize?: number;
    q?: string;
    period?: string;
    from?: string;
    to?: string;
    categoryId?: string;
  } = {},
) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW_ANY);
    const bounds = periodBounds(input);
    const pageSize = parseSchoolPageSize(input.pageSize);
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const categoryId = str(input.categoryId);
    const capabilities = caps(user);

    const [typesRes, busesRes, postedRes] = await Promise.all([
      supabase
        .from("sch_expense_categories")
        .select("id, name, description, is_active, created_at, updated_at")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase
        .from("sch_buses")
        .select("id, registration_number, name, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("registration_number"),
      supabase
        .from("sch_expenses")
        .select("category_id, amount")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .gte("expense_date", bounds.from)
        .lte("expense_date", bounds.to),
    ]);

    if (typesRes.error && !isSchoolUnconfiguredRead(typesRes.error)) mapSchoolDbError(typesRes.error, "load");
    if (busesRes.error && !isSchoolUnconfiguredRead(busesRes.error)) mapSchoolDbError(busesRes.error, "load");
    if (postedRes.error && !isSchoolUnconfiguredRead(postedRes.error)) mapSchoolDbError(postedRes.error, "load");

    const typesMissing = Boolean(typesRes.error && isSchoolUnconfiguredRead(typesRes.error));
    if (typesMissing) {
      return { ok: true as const, workspace: emptyWorkspace(capabilities, bounds.period, bounds.from, bounds.to) };
    }

    const postedByType = new Map<string, { amount: number; count: number }>();
    for (const row of postedRes.data ?? []) {
      const id = String(row.category_id);
      const current = postedByType.get(id) ?? { amount: 0, count: 0 };
      current.amount += num(row.amount);
      current.count += 1;
      postedByType.set(id, current);
    }

    const types: SchoolExpenseTypeRow[] = (typesRes.data ?? [])
      .map((row) => {
        const posted = postedByType.get(String(row.id)) ?? { amount: 0, count: 0 };
        return {
          id: String(row.id),
          name: String(row.name),
          description: String(row.description ?? ""),
          isActive: Boolean(row.is_active),
          createdAt: String(row.created_at ?? ""),
          updatedAt: String(row.updated_at ?? ""),
          postedAmount: posted.amount,
          postedCount: posted.count,
        };
      })
      .filter((row) => row.isActive || row.postedCount > 0);

    const summary: SchoolExpenseSummary = {
      totalPosted: [...postedByType.values()].reduce((sum, row) => sum + row.amount, 0),
      postedCount: [...postedByType.values()].reduce((sum, row) => sum + row.count, 0),
      typesUsed: types.filter((row) => row.isActive && row.postedCount > 0).length,
    };

    const buses: SchoolExpenseBusOption[] = (busesRes.data ?? []).map((row) => ({
      id: String(row.id),
      registrationNumber: String(row.registration_number),
      name: String(row.name ?? ""),
      isActive: Boolean(row.is_active),
    }));
    const busMap = new Map(buses.map((row) => [row.id, row]));

    let matchingTypeIds: string[] = [];
    if (q) {
      matchingTypeIds = types.filter((row) => row.name.toLowerCase().includes(q.toLowerCase())).map((row) => row.id);
    }

    let query = supabase
      .from("sch_expenses")
      .select(
        "id, expense_number, expense_date, amount, description, reference, method, payee, source_type, source_id, category_id, bus_id, is_active",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .gte("expense_date", bounds.from)
      .lte("expense_date", bounds.to)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (categoryId) query = query.eq("category_id", categoryId);
    if (q) {
      const typeClause = matchingTypeIds.length ? `,category_id.in.(${matchingTypeIds.join(",")})` : "";
      query = query.or(
        `expense_number.ilike.%${q}%,description.ilike.%${q}%,reference.ilike.%${q}%,payee.ilike.%${q}%${typeClause}`,
      );
    }
    const listRes = await query.range(from, to);
    if (listRes.error && !isSchoolUnconfiguredRead(listRes.error)) mapSchoolDbError(listRes.error, "load");

    const rows = listRes.data ?? [];
    const fuelIds = rows.filter((row) => row.source_type === "TRANSPORT_FUEL" && row.source_id).map((row) => String(row.source_id));
    const maintIds = rows
      .filter((row) => row.source_type === "TRANSPORT_MAINTENANCE" && row.source_id)
      .map((row) => String(row.source_id));
    const extraBusIds = rows.map((row) => String(row.bus_id ?? "")).filter(Boolean);

    const [fuelRes, maintRes, extraBusesRes] = await Promise.all([
      fuelIds.length
        ? supabase
            .from("sch_fuel_records")
            .select("id, bus_id, station")
            .eq("business_unit_id", businessUnitId)
            .in("id", fuelIds)
        : Promise.resolve({ data: [] as Array<{ id: string; bus_id: string; station: string | null }>, error: null }),
      maintIds.length
        ? supabase
            .from("sch_maintenance_records")
            .select("id, bus_id, provider")
            .eq("business_unit_id", businessUnitId)
            .in("id", maintIds)
        : Promise.resolve({ data: [] as Array<{ id: string; bus_id: string; provider: string | null }>, error: null }),
      extraBusIds.length
        ? supabase
            .from("sch_buses")
            .select("id, registration_number, name, is_active")
            .eq("business_unit_id", businessUnitId)
            .in("id", extraBusIds)
        : Promise.resolve({ data: [] as typeof busesRes.data, error: null }),
    ]);

    for (const row of extraBusesRes.data ?? []) {
      busMap.set(String(row.id), {
        id: String(row.id),
        registrationNumber: String(row.registration_number),
        name: String(row.name ?? ""),
        isActive: Boolean(row.is_active),
      });
    }
    const fuelMap = new Map((fuelRes.data ?? []).map((row) => [String(row.id), row]));
    const maintMap = new Map((maintRes.data ?? []).map((row) => [String(row.id), row]));
    const typeName = new Map(types.map((row) => [row.id, row.name]));
    for (const row of typesRes.data ?? []) {
      if (!typeName.has(String(row.id))) typeName.set(String(row.id), String(row.name));
    }

    const expenses: SchoolExpenseRow[] = rows.map((row) => {
      const sourceType = asSource(row.source_type);
      const sourceId = row.source_id ? String(row.source_id) : null;
      let busId = row.bus_id ? String(row.bus_id) : null;
      let payee = String(row.payee ?? "");
      if (sourceType === "TRANSPORT_FUEL" && sourceId) {
        const fuel = fuelMap.get(sourceId);
        if (fuel?.bus_id) busId = String(fuel.bus_id);
        if (!payee) payee = String(fuel?.station ?? "");
      }
      if (sourceType === "TRANSPORT_MAINTENANCE" && sourceId) {
        const maint = maintMap.get(sourceId);
        if (maint?.bus_id) busId = String(maint.bus_id);
        if (!payee) payee = String(maint?.provider ?? "");
      }
      const bus = busId ? busMap.get(busId) : undefined;
      return {
        id: String(row.id),
        expenseNumber: String(row.expense_number),
        expenseDate: String(row.expense_date),
        amount: num(row.amount),
        description: String(row.description ?? ""),
        reference: String(row.reference ?? ""),
        method: String(row.method ?? ""),
        payee,
        sourceType,
        sourceId,
        categoryId: String(row.category_id),
        categoryName: typeName.get(String(row.category_id)) ?? "",
        busId,
        busLabel: bus ? [bus.registrationNumber, bus.name].filter(Boolean).join(" · ") : "",
        isActive: Boolean(row.is_active),
      };
    });

    const workspace: SchoolExpenseWorkspace = {
      expenses,
      types,
      buses,
      summary,
      page: schoolPageMeta(page, listRes.count ?? 0, pageSize),
      period: bounds.period,
      from: bounds.from,
      to: bounds.to,
      categoryId,
      q: str(input.q),
      capabilities,
    };
    return { ok: true as const, workspace };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type SchoolExpensesWorkspaceResult = Awaited<ReturnType<typeof loadSchoolExpensesWorkspaceAction>>;

function refreshFinance() {
  revalidatePath("/school/expenses");
  revalidatePath("/school");
  revalidatePath("/owner/finance");
  revalidatePath("/owner/reports");
  revalidatePath("/dashboard");
}

export async function saveSchoolExpenseTypeAction(input: {
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([EDIT]);
    const name = str(input.name);
    const description = str(input.description);
    if (name.length < 2) throw new SchoolError("Enter an expense type name.", "VALIDATION");
    if (name.length > 80) throw new SchoolError("Expense type name is too long.", "VALIDATION");

    const existingId = str(input.id);
    if (existingId) {
      const current = await supabase
        .from("sch_expense_categories")
        .select("id, name, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .maybeSingle();
      if (current.error && !isSchoolUnconfiguredRead(current.error)) mapSchoolDbError(current.error, "save");
      if (!current.data) throw new SchoolError("Expense type was not found.", "NOT_FOUND");
      const nextActive = input.isActive == null ? Boolean(current.data.is_active) : Boolean(input.isActive);
      const result = await supabase
        .from("sch_expense_categories")
        .update({ name, description, is_active: nextActive })
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .select("id")
        .maybeSingle();
      if (result.error) {
        if (result.error.code === "23505") throw new SchoolError("An expense type with that name already exists.", "CONFLICT");
        mapSchoolDbError(result.error, "save");
      }
      await audit({
        action: nextActive ? "school.expense_type_updated" : "school.expense_type_archived",
        description: nextActive ? `Expense type updated · ${name}` : `Expense type archived · ${name}`,
        entityType: "sch_expense_categories",
        entityId: existingId,
        businessUnitId,
      });
      refreshFinance();
      return { ok: true as const, id: existingId };
    }

    const code = expenseCategoryCode(name);
    let created = await supabase
      .from("sch_expense_categories")
      .insert({
        business_unit_id: businessUnitId,
        code,
        name,
        description,
        is_active: true,
      })
      .select("id")
      .maybeSingle();
    if (created.error?.code === "23505" && created.error.message.toLowerCase().includes("code")) {
      created = await supabase
        .from("sch_expense_categories")
        .insert({
          business_unit_id: businessUnitId,
          code: `${code.slice(0, 35)}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          name,
          description,
          is_active: true,
        })
        .select("id")
        .maybeSingle();
    }
    if (created.error) {
      if (created.error.code === "23505") throw new SchoolError("An expense type with that name already exists.", "CONFLICT");
      mapSchoolDbError(created.error, "save");
    }
    const id = String(created.data?.id ?? "");
    await audit({
      action: "school.expense_type_created",
      description: `Expense type created · ${name}`,
      entityType: "sch_expense_categories",
      entityId: id || null,
      businessUnitId,
    });
    refreshFinance();
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function recordSchoolExpenseAction(input: {
  categoryId: string;
  amount: number | string;
  expenseDate: string;
  description?: string;
  method: string;
  payee?: string;
  reference?: string;
  busId?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([CREATE]);
    const amount = num(input.amount);
    if (!(amount > 0)) throw new SchoolError("Amount must be greater than zero.", "VALIDATION");
    const expenseDate = str(input.expenseDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new SchoolError("Enter a valid expense date.", "VALIDATION");
    const categoryId = str(input.categoryId);
    if (!categoryId) throw new SchoolError("Select an expense type.", "VALIDATION");
    const method = str(input.method).toUpperCase();
    if (method !== "CASH" && method !== "MOBILE_MONEY" && method !== "BANK") {
      throw new SchoolError("Choose a valid payment method.", "VALIDATION");
    }
    const reference = str(input.reference);
    if (method !== "CASH" && reference.length < 2) throw new SchoolError("Enter a payment reference.", "VALIDATION");
    const requestId = str(input.requestId);
    if (!requestId) throw new SchoolError("Expense request is invalid.", "VALIDATION");

    const { data, error } = await supabase.rpc("sch_record_manual_expense", {
      p_category_id: categoryId,
      p_amount: amount,
      p_expense_date: expenseDate,
      p_description: str(input.description),
      p_method: method,
      p_payee: str(input.payee),
      p_reference: reference,
      p_bus_id: str(input.busId) || null,
      p_request_id: requestId,
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't save this expense.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; expense_number?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: "school.expense_recorded",
        description: `Expense recorded · ${payload.expense_number ?? ""} · ${amount}`,
        entityType: "sch_expenses",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFinance();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function reverseSchoolExpenseAction(input: { id: string }) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([EDIT]);
    const id = str(input.id);
    if (!id) throw new SchoolError("Expense was not found.", "NOT_FOUND");
    const { data, error } = await supabase.rpc("sch_reverse_manual_expense", {
      p_expense_id: id,
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't reverse this expense.", "DATABASE");
    const payload = (data ?? {}) as { already_reversed?: boolean; expense_number?: string };
    if (!payload.already_reversed) {
      await audit({
        action: "school.expense_reversed",
        description: `Expense reversed · ${payload.expense_number ?? id}`,
        entityType: "sch_expenses",
        entityId: id,
        businessUnitId,
      });
      refreshFinance();
    }
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
