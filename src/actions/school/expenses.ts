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
  isSchoolSystemExpenseType,
  sortSchoolExpenseTypes,
  type SchoolExpenseBusOption,
  type SchoolExpenseCaps,
  type SchoolExpenseRow,
  type SchoolExpenseSource,
  type SchoolExpenseSummary,
  type SchoolExpenseTypeRow,
  type SchoolExpenseWorkspace,
} from "@/lib/school/expense-types";
import { parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import type { SchoolEmergencyFund } from "@/lib/school/store-types";

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
  if (
    value === "TRANSPORT_FUEL" ||
    value === "TRANSPORT_MAINTENANCE" ||
    value === "SALARY" ||
    value === "STORE_ISSUE" ||
    value === "STORE_COGS" ||
    value === "EMERGENCY"
  ) {
    return value;
  }
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
    canManageFund: hasPerm(user, EDIT),
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
    emergencyFund: emptyFund(capabilities.canManageFund),
  };
}

function emptyFund(canManage: boolean): SchoolEmergencyFund {
  return { balance: 0, opening: 0, replenished: 0, spent: 0, hasOpening: false, entries: [], canManage };
}

function mapFund(
  rows: Array<{
    id?: unknown;
    entry_kind?: unknown;
    amount?: unknown;
    occurred_on?: unknown;
    reference?: unknown;
    notes?: unknown;
    expense_id?: unknown;
    is_active?: unknown;
    recorded_by?: unknown;
  }>,
  canManage: boolean,
): SchoolEmergencyFund {
  const fund = emptyFund(canManage);
  for (const row of rows) {
    const kind = str(row.entry_kind);
    const amount = num(row.amount);
    const active = Boolean(row.is_active);
    const mappedKind = kind === "OPENING" || kind === "REPLENISH" || kind === "SPEND" ? kind : "REPLENISH";
    if (active && mappedKind === "OPENING") {
      fund.opening += amount;
      fund.hasOpening = true;
    }
    if (active && mappedKind === "REPLENISH") fund.replenished += amount;
    if (active && mappedKind === "SPEND") fund.spent += amount;
    fund.entries.push({
      id: str(row.id),
      kind: mappedKind,
      amount,
      occurredOn: str(row.occurred_on),
      reference: str(row.reference),
      notes: str(row.notes),
      expenseId: row.expense_id ? str(row.expense_id) : null,
      isActive: active,
      recordedBy: str(row.recorded_by),
    });
  }
  fund.balance = fund.opening + fund.replenished - fund.spent;
  return fund;
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

type ExpenseLoadInput = {
  page?: number;
  pageSize?: number;
  q?: string;
  period?: string;
  from?: string;
  to?: string;
  categoryId?: string;
};

type ExpenseListContext = Awaited<ReturnType<typeof requireAnySchoolPermission>>;

function mapExpenseType(
  row: { id: unknown; code?: unknown; name: unknown; description?: unknown; is_active: unknown; created_at?: unknown; updated_at?: unknown },
  posted: { amount: number; count: number },
): SchoolExpenseTypeRow {
  const code = str(row.code);
  return {
    id: String(row.id),
    code,
    name: String(row.name),
    description: String(row.description ?? ""),
    isActive: Boolean(row.is_active),
    isSystem: isSchoolSystemExpenseType(code),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    postedAmount: posted.amount,
    postedCount: posted.count,
  };
}

async function ensureOtherExpenseType(ctx: ExpenseListContext) {
  const { supabase, businessUnitId } = ctx;
  const rpc = await supabase.rpc("sch_ensure_other_expense_type", { p_bu: businessUnitId });
  if (!rpc.error) return;

  const existing = await supabase
    .from("sch_expense_categories")
    .select("id, code, name, is_active, description")
    .eq("business_unit_id", businessUnitId)
    .or("code.eq.OTHER,name.ilike.other");
  if (existing.error) return;
  const row =
    (existing.data ?? []).find((item) => isSchoolSystemExpenseType(str(item.code))) ??
    (existing.data ?? []).find((item) => str(item.name).toLowerCase() === "other") ??
    null;
  if (row) {
    const needsRepair =
      !row.is_active || str(row.code).toUpperCase() !== "OTHER" || str(row.name) !== "Other";
    if (!needsRepair) return;
    const updated = await supabase
      .from("sch_expense_categories")
      .update({
        code: "OTHER",
        name: "Other",
        is_active: true,
        description: str(row.description) || "Uncategorized operating expenses.",
      })
      .eq("business_unit_id", businessUnitId)
      .eq("id", row.id);
    if (updated.error && updated.error.code !== "23505") return;
    return;
  }

  await supabase.from("sch_expense_categories").insert({
    business_unit_id: businessUnitId,
    code: "OTHER",
    name: "Other",
    description: "Uncategorized operating expenses.",
    is_active: true,
  });
}

async function fetchExpensePage(
  ctx: ExpenseListContext,
  input: ExpenseLoadInput,
  typeNameSeed: Map<string, string>,
  knownTypeIds?: string[],
) {
  const { supabase, businessUnitId } = ctx;
  const bounds = periodBounds(input);
  const pageSize = parseSchoolPageSize(input.pageSize);
  const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
  const q = searchNeedle(input.q);
  const categoryId = str(input.categoryId);
  const typeName = new Map(typeNameSeed);

  let matchingTypeIds = knownTypeIds ?? [];
  if (q && knownTypeIds == null) {
    const typeMatch = await supabase
      .from("sch_expense_categories")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .ilike("name", `%${q}%`);
    if (typeMatch.error && !isSchoolUnconfiguredRead(typeMatch.error)) mapSchoolDbError(typeMatch.error, "load");
    matchingTypeIds = (typeMatch.data ?? []).map((row) => String(row.id));
    for (const row of typeMatch.data ?? []) typeName.set(String(row.id), String(row.name));
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
  const missingNames = [...new Set(rows.map((row) => String(row.category_id)).filter((id) => id && !typeName.has(id)))];
  const fuelIds = rows.filter((row) => row.source_type === "TRANSPORT_FUEL" && row.source_id).map((row) => String(row.source_id));
  const maintIds = rows
    .filter((row) => row.source_type === "TRANSPORT_MAINTENANCE" && row.source_id)
    .map((row) => String(row.source_id));
  const extraBusIds = rows.map((row) => String(row.bus_id ?? "")).filter(Boolean);

  const [namesRes, fuelRes, maintRes, extraBusesRes] = await Promise.all([
    missingNames.length
      ? supabase.from("sch_expense_categories").select("id, name").eq("business_unit_id", businessUnitId).in("id", missingNames)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    fuelIds.length
      ? supabase.from("sch_fuel_records").select("id, bus_id, station").eq("business_unit_id", businessUnitId).in("id", fuelIds)
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
      : Promise.resolve({ data: [] as Array<{ id: string; registration_number: string; name: string | null; is_active: boolean }>, error: null }),
  ]);

  for (const row of namesRes.data ?? []) typeName.set(String(row.id), String(row.name));
  const busMap = new Map<string, SchoolExpenseBusOption>();
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

  return {
    expenses,
    page: schoolPageMeta(page, listRes.count ?? 0, pageSize),
    bounds,
    categoryId,
    q: str(input.q),
  };
}

export async function loadSchoolExpensesWorkspaceAction(input: ExpenseLoadInput = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireAnySchoolPermission(VIEW_ANY);
    const { supabase, businessUnitId } = ctx;
    const bounds = periodBounds(input);
    const capabilities = caps(user);

    await ensureOtherExpenseType(ctx);

    const [typesRes, busesRes, postedRes, fundRes] = await Promise.all([
      supabase
        .from("sch_expense_categories")
        .select("id, code, name, description, is_active, created_at, updated_at")
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
      supabase
        .from("sch_emergency_fund_entries")
        .select("id, entry_kind, amount, occurred_on, reference, notes, expense_id, is_active, recorded_by")
        .eq("business_unit_id", businessUnitId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (typesRes.error && !isSchoolUnconfiguredRead(typesRes.error)) mapSchoolDbError(typesRes.error, "load");
    if (busesRes.error && !isSchoolUnconfiguredRead(busesRes.error)) mapSchoolDbError(busesRes.error, "load");
    if (postedRes.error && !isSchoolUnconfiguredRead(postedRes.error)) mapSchoolDbError(postedRes.error, "load");
    if (fundRes.error && !isSchoolUnconfiguredRead(fundRes.error)) mapSchoolDbError(fundRes.error, "load");

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

    const types = sortSchoolExpenseTypes(
      (typesRes.data ?? [])
        .map((row) => mapExpenseType(row, postedByType.get(String(row.id)) ?? { amount: 0, count: 0 }))
        .filter((row) => row.isActive || row.postedCount > 0),
    );

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

    const q = searchNeedle(input.q);
    const knownTypeIds = q
      ? types.filter((row) => row.name.toLowerCase().includes(q.toLowerCase())).map((row) => row.id)
      : [];
    const typeName = new Map(types.map((row) => [row.id, row.name]));
    for (const row of typesRes.data ?? []) {
      if (!typeName.has(String(row.id))) typeName.set(String(row.id), String(row.name));
    }

    const list = await fetchExpensePage(ctx, input, typeName, q ? knownTypeIds : []);

    const workspace: SchoolExpenseWorkspace = {
      expenses: list.expenses,
      types,
      buses,
      summary,
      page: list.page,
      period: list.bounds.period,
      from: list.bounds.from,
      to: list.bounds.to,
      categoryId: list.categoryId,
      q: list.q,
      capabilities,
      emergencyFund: mapFund(fundRes.data ?? [], capabilities.canManageFund),
    };
    return { ok: true as const, workspace };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function loadSchoolExpenseListAction(input: ExpenseLoadInput = {}) {
  try {
    const ctx = await requireAnySchoolPermission(VIEW_ANY);
    const list = await fetchExpensePage(ctx, input, new Map());
    return {
      ok: true as const,
      expenses: list.expenses,
      page: list.page,
      period: list.bounds.period,
      from: list.bounds.from,
      to: list.bounds.to,
      categoryId: list.categoryId,
      q: list.q,
    };
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
        .select("id, code, name, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .maybeSingle();
      if (current.error && !isSchoolUnconfiguredRead(current.error)) mapSchoolDbError(current.error, "save");
      if (!current.data) throw new SchoolError("Expense type was not found.", "NOT_FOUND");
      const systemType = isSchoolSystemExpenseType(str(current.data.code));
      if (systemType && input.isActive === false) {
        throw new SchoolError("Other is the default expense type and cannot be archived.", "VALIDATION");
      }
      if (systemType && name.toLowerCase() !== "other") {
        throw new SchoolError("Other is a system type and cannot be renamed.", "VALIDATION");
      }
      const nextActive = input.isActive == null ? Boolean(current.data.is_active) : Boolean(input.isActive);
      const result = await supabase
        .from("sch_expense_categories")
        .update({ name: systemType ? "Other" : name, description, is_active: nextActive })
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
  fundingSource?: string;
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

    const fundingSource = str(input.fundingSource).toUpperCase() === "EMERGENCY" ? "EMERGENCY" : "OPERATING";
    const { data, error } = await supabase.rpc("sch_record_funded_expense", {
      p_category_id: categoryId,
      p_amount: amount,
      p_expense_date: expenseDate,
      p_description: str(input.description),
      p_method: method,
      p_payee: str(input.payee),
      p_reference: reference,
      p_bus_id: str(input.busId) || null,
      p_funding_source: fundingSource,
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

export async function creditSchoolEmergencyFundAction(input: {
  kind: "OPENING" | "REPLENISH";
  amount: number | string;
  occurredOn: string;
  reference?: string;
  notes?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([EDIT]);
    const amount = num(input.amount);
    if (!(amount > 0)) throw new SchoolError("Amount must be greater than zero.", "VALIDATION");
    const occurredOn = str(input.occurredOn);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw new SchoolError("Enter a valid date.", "VALIDATION");
    const { data, error } = await supabase.rpc("sch_emergency_fund_credit", {
      p_kind: input.kind,
      p_amount: amount,
      p_occurred_on: occurredOn,
      p_reference: str(input.reference),
      p_notes: str(input.notes),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
      p_business_unit_id: businessUnitId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't update the emergency fund.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: input.kind === "OPENING" ? "school.emergency_fund_opened" : "school.emergency_fund_replenished",
        description:
          input.kind === "OPENING"
            ? `Emergency fund opening balance · ${amount}`
            : `Emergency fund replenished · ${amount}`,
        entityType: "sch_emergency_fund_entries",
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
