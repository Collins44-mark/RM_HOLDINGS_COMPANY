"use server";

import { loadSchoolExpensesWorkspaceAction } from "@/actions/school/expenses";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import {
  parseTransportBillingFrequency,
  staffDisplayName,
  transportPeriodBounds,
  type TransportBusOption,
  type TransportBusRow,
  type TransportCaps,
  type TransportDriverRow,
  type TransportFuelRow,
  type TransportMaintenanceRow,
  type TransportPeriod,
  type TransportRecentService,
  type TransportRouteRow,
  type TransportStaffOption,
  type TransportSummary,
} from "@/lib/school/transport-types";

const VIEW = "school.transport.view";
const BUSES_VIEW = "school.buses.view";
const BUSES_CREATE = "school.buses.create";
const BUSES_EDIT = "school.buses.edit";
const DRIVERS_VIEW = "school.drivers.view";
const DRIVERS_CREATE = "school.drivers.create";
const DRIVERS_EDIT = "school.drivers.edit";
const ROUTES_VIEW = "school.routes.view";
const ROUTES_CREATE = "school.routes.create";
const ROUTES_EDIT = "school.routes.edit";
const FUEL_VIEW = "school.fuel.view";
const FUEL_CREATE = "school.fuel.create";
const MAINT_VIEW = "school.maintenance.view";
const MAINT_CREATE = "school.maintenance.create";
const EXP_VIEW = "school.expenses.view";
const STAFF_VIEW = "school.staff.view";
const STAFF_MANAGE = "school.staff.manage";

const VIEW_ANY = [VIEW, BUSES_VIEW, DRIVERS_VIEW, ROUTES_VIEW, FUEL_VIEW, MAINT_VIEW, EXP_VIEW];

export type { TransportBusRow, TransportCaps, TransportDriverRow, TransportFuelRow, TransportMaintenanceRow, TransportPeriod, TransportRouteRow, TransportSummary };

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

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>): TransportCaps {
  return {
    canView: VIEW_ANY.some((code) => hasPerm(user, code)),
    canManageBuses: hasPerm(user, BUSES_CREATE) || hasPerm(user, BUSES_EDIT),
    canManageDrivers: hasPerm(user, DRIVERS_CREATE) || hasPerm(user, DRIVERS_EDIT),
    canManageRoutes: hasPerm(user, ROUTES_CREATE) || hasPerm(user, ROUTES_EDIT),
    canRecordFuel: hasPerm(user, FUEL_CREATE) || hasPerm(user, "school.fuel.edit"),
    canRecordMaintenance: hasPerm(user, MAINT_CREATE) || hasPerm(user, "school.maintenance.edit"),
    canViewExpenses: hasPerm(user, EXP_VIEW),
    canManageStaff: hasPerm(user, STAFF_MANAGE),
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

type Ctx = Awaited<ReturnType<typeof requireAnySchoolPermission>>;

async function transportEnabled(supabase: Ctx["supabase"], businessUnitId: string) {
  const result = await supabase
    .from("sch_transport_settings")
    .select("enabled")
    .eq("business_unit_id", businessUnitId)
    .maybeSingle();
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  return Boolean(result.data?.enabled);
}

async function loadBusOptions(supabase: Ctx["supabase"], businessUnitId: string, activeOnly = false) {
  let query = supabase
    .from("sch_buses")
    .select("id, registration_number, name, is_active")
    .eq("business_unit_id", businessUnitId)
    .order("registration_number");
  if (activeOnly) query = query.eq("is_active", true);
  const result = await query;
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  return (result.data ?? []).map(
    (row): TransportBusOption => ({
      id: String(row.id),
      registrationNumber: String(row.registration_number),
      name: String(row.name ?? ""),
      isActive: Boolean(row.is_active),
    }),
  );
}

async function loadStaffOptions(supabase: Ctx["supabase"], businessUnitId: string) {
  const result = await supabase
    .from("sch_staff")
    .select("id, first_name, middle_name, last_name, staff_number")
    .eq("business_unit_id", businessUnitId)
    .eq("employment_status", "active")
    .order("first_name");
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  return (result.data ?? []).map(
    (row): TransportStaffOption => ({
      id: String(row.id),
      name: staffDisplayName(row),
      staffNumber: String(row.staff_number),
    }),
  );
}

async function currentDrivers(supabase: Ctx["supabase"], businessUnitId: string, busIds: string[]) {
  const map = new Map<string, { staffId: string; name: string }>();
  if (!busIds.length) return map;
  const assigns = await supabase
    .from("sch_driver_assignments")
    .select("bus_id, staff_id")
    .eq("business_unit_id", businessUnitId)
    .eq("is_active", true)
    .in("bus_id", busIds);
  if (assigns.error && !isSchoolUnconfiguredRead(assigns.error)) mapSchoolDbError(assigns.error, "load");
  const staffIds = [...new Set((assigns.data ?? []).map((row) => String(row.staff_id)))];
  const names = new Map<string, string>();
  if (staffIds.length) {
    const staff = await supabase
      .from("sch_staff")
      .select("id, first_name, middle_name, last_name")
      .eq("business_unit_id", businessUnitId)
      .in("id", staffIds);
    for (const row of staff.data ?? []) names.set(String(row.id), staffDisplayName(row));
  }
  for (const row of assigns.data ?? []) {
    map.set(String(row.bus_id), { staffId: String(row.staff_id), name: names.get(String(row.staff_id)) ?? "" });
  }
  return map;
}

async function periodCosts(
  supabase: Ctx["supabase"],
  businessUnitId: string,
  from: string,
  to: string,
  busIds?: string[],
) {
  const fuelMap = new Map<string, { cost: number; litres: number }>();
  const maintMap = new Map<string, number>();
  let fuelQuery = supabase
    .from("sch_fuel_records")
    .select("bus_id, litres, total_amount")
    .eq("business_unit_id", businessUnitId)
    .gte("recorded_on", from)
    .lte("recorded_on", to);
  let maintQuery = supabase
    .from("sch_maintenance_records")
    .select("bus_id, cost")
    .eq("business_unit_id", businessUnitId)
    .gte("recorded_on", from)
    .lte("recorded_on", to);
  if (busIds?.length) {
    fuelQuery = fuelQuery.in("bus_id", busIds);
    maintQuery = maintQuery.in("bus_id", busIds);
  }
  const [fuel, maint] = await Promise.all([fuelQuery, maintQuery]);
  if (fuel.error && !isSchoolUnconfiguredRead(fuel.error)) mapSchoolDbError(fuel.error, "load");
  if (maint.error && !isSchoolUnconfiguredRead(maint.error)) mapSchoolDbError(maint.error, "load");
  for (const row of fuel.data ?? []) {
    const id = String(row.bus_id);
    const current = fuelMap.get(id) ?? { cost: 0, litres: 0 };
    current.cost += num(row.total_amount);
    current.litres += num(row.litres);
    fuelMap.set(id, current);
  }
  for (const row of maint.data ?? []) {
    const id = String(row.bus_id);
    maintMap.set(id, (maintMap.get(id) ?? 0) + num(row.cost));
  }
  return { fuelMap, maintMap };
}

async function loadSummary(
  supabase: Ctx["supabase"],
  businessUnitId: string,
  from: string,
  to: string,
): Promise<TransportSummary> {
  const [buses, drivers, routes, fuel, maint] = await Promise.all([
    supabase.from("sch_buses").select("id", { count: "exact", head: true }).eq("business_unit_id", businessUnitId).eq("is_active", true),
    supabase.from("sch_driver_assignments").select("id", { count: "exact", head: true }).eq("business_unit_id", businessUnitId).eq("is_active", true),
    supabase.from("sch_transport_routes").select("id", { count: "exact", head: true }).eq("business_unit_id", businessUnitId).eq("is_active", true),
    supabase
      .from("sch_fuel_records")
      .select("litres, total_amount")
      .eq("business_unit_id", businessUnitId)
      .gte("recorded_on", from)
      .lte("recorded_on", to),
    supabase
      .from("sch_maintenance_records")
      .select("cost")
      .eq("business_unit_id", businessUnitId)
      .gte("recorded_on", from)
      .lte("recorded_on", to),
  ]);
  for (const result of [buses, drivers, routes, fuel, maint]) {
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  }
  const fuelCost = (fuel.data ?? []).reduce((sum, row) => sum + num(row.total_amount), 0);
  const fuelLitres = (fuel.data ?? []).reduce((sum, row) => sum + num(row.litres), 0);
  const maintenanceCost = (maint.data ?? []).reduce((sum, row) => sum + num(row.cost), 0);
  const otherTransportCost = 0;
  return {
    activeBuses: buses.count ?? 0,
    drivers: drivers.count ?? 0,
    activeRoutes: routes.count ?? 0,
    fuelCost,
    fuelLitres,
    maintenanceCost,
    otherTransportCost,
    totalTransportCost: fuelCost + maintenanceCost + otherTransportCost,
  };
}

export async function getTransportOverviewAction(input: { period?: TransportPeriod; from?: string; to?: string } = {}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW_ANY);
    const period = input.period ?? "month";
    const bounds = transportPeriodBounds(period, input.from, input.to);
    const enabled = await transportEnabled(supabase, businessUnitId);
    const [summary, busesRes, routesRes, fuelRes, maintRes] = await Promise.all([
      loadSummary(supabase, businessUnitId, bounds.from, bounds.to),
      supabase
        .from("sch_buses")
        .select("id, registration_number, name, make_model, capacity, model_year, odometer, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("registration_number")
        .limit(40),
      supabase
        .from("sch_transport_routes")
        .select("id, name, details, price, billing_frequency, bus_id, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name")
        .limit(40),
      supabase
        .from("sch_fuel_records")
        .select("id, bus_id, recorded_on, total_amount, station, litres")
        .eq("business_unit_id", businessUnitId)
        .order("recorded_on", { ascending: false })
        .limit(8),
      supabase
        .from("sch_maintenance_records")
        .select("id, bus_id, recorded_on, cost, work_performed")
        .eq("business_unit_id", businessUnitId)
        .order("recorded_on", { ascending: false })
        .limit(8),
    ]);
    if (busesRes.error && !isSchoolUnconfiguredRead(busesRes.error)) mapSchoolDbError(busesRes.error, "load");
    if (routesRes.error && !isSchoolUnconfiguredRead(routesRes.error)) mapSchoolDbError(routesRes.error, "load");
    const busRows = busesRes.data ?? [];
    const busIds = busRows.map((row) => String(row.id));
    const [drivers, costs] = await Promise.all([
      currentDrivers(supabase, businessUnitId, busIds),
      periodCosts(supabase, businessUnitId, bounds.from, bounds.to, busIds),
    ]);
    const buses: TransportBusRow[] = busRows.map((row) => {
      const id = String(row.id);
      const fuel = costs.fuelMap.get(id);
      return {
        id,
        registrationNumber: String(row.registration_number),
        name: String(row.name ?? ""),
        makeModel: String(row.make_model ?? ""),
        capacity: num(row.capacity),
        modelYear: row.model_year == null ? null : num(row.model_year),
        odometer: num(row.odometer),
        isActive: Boolean(row.is_active),
        driverId: drivers.get(id)?.staffId ?? null,
        driverName: drivers.get(id)?.name ?? "",
        fuelCost: fuel?.cost ?? 0,
        fuelLitres: fuel?.litres ?? 0,
        maintenanceCost: costs.maintMap.get(id) ?? 0,
      };
    });
    const driverByBus = new Map(buses.map((row) => [row.id, row.driverName]));
    const busReg = new Map(buses.map((row) => [row.id, row.registrationNumber]));
    const extraIds = [
      ...new Set(
        [...(fuelRes.data ?? []), ...(maintRes.data ?? [])]
          .map((row) => String(row.bus_id))
          .filter((id) => !busReg.has(id)),
      ),
    ];
    if (extraIds.length) {
      const extra = await supabase.from("sch_buses").select("id, registration_number").eq("business_unit_id", businessUnitId).in("id", extraIds);
      for (const row of extra.data ?? []) busReg.set(String(row.id), String(row.registration_number));
    }
    const recent: TransportRecentService[] = [
      ...(fuelRes.data ?? []).map((row) => ({
        id: String(row.id),
        kind: "fuel" as const,
        recordedOn: String(row.recorded_on),
        busRegistration: busReg.get(String(row.bus_id)) ?? "",
        description: `${num(row.litres)} L${row.station ? ` · ${row.station}` : ""}`,
        cost: num(row.total_amount),
      })),
      ...(maintRes.data ?? []).map((row) => ({
        id: String(row.id),
        kind: "maintenance" as const,
        recordedOn: String(row.recorded_on),
        busRegistration: busReg.get(String(row.bus_id)) ?? "",
        description: String(row.work_performed ?? ""),
        cost: num(row.cost),
      })),
    ]
      .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn))
      .slice(0, 8);
    const routes: TransportRouteRow[] = (routesRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      details: String(row.details ?? ""),
      price: num(row.price),
      billingFrequency: parseTransportBillingFrequency(row.billing_frequency),
      busId: row.bus_id ? String(row.bus_id) : null,
      busRegistration: row.bus_id ? (busReg.get(String(row.bus_id)) ?? "") : "",
      driverName: row.bus_id ? (driverByBus.get(String(row.bus_id)) ?? "") : "",
      isActive: Boolean(row.is_active),
    }));
    return { ok: true as const, enabled, summary, buses, routes, recent, period, ...bounds, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type TransportOverviewResult = Awaited<ReturnType<typeof getTransportOverviewAction>>;

async function mapBuses(
  supabase: Ctx["supabase"],
  businessUnitId: string,
  rows: Array<Record<string, unknown>>,
  from: string,
  to: string,
): Promise<TransportBusRow[]> {
  const ids = rows.map((row) => String(row.id));
  const [drivers, costs] = await Promise.all([
    currentDrivers(supabase, businessUnitId, ids),
    periodCosts(supabase, businessUnitId, from, to, ids),
  ]);
  return rows.map((row) => {
    const id = String(row.id);
    const fuel = costs.fuelMap.get(id);
    return {
      id,
      registrationNumber: String(row.registration_number ?? ""),
      name: String(row.name ?? ""),
      makeModel: String(row.make_model ?? ""),
      capacity: num(row.capacity),
      modelYear: row.model_year == null ? null : num(row.model_year),
      odometer: num(row.odometer),
      isActive: Boolean(row.is_active),
      driverId: drivers.get(id)?.staffId ?? null,
      driverName: drivers.get(id)?.name ?? "",
      fuelCost: fuel?.cost ?? 0,
      fuelLitres: fuel?.litres ?? 0,
      maintenanceCost: costs.maintMap.get(id) ?? 0,
    };
  });
}

export async function listTransportBusesAction(input: { page?: number; q?: string; status?: string } = {}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, BUSES_VIEW]);
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const q = searchNeedle(input.q);
    let query = supabase
      .from("sch_buses")
      .select("id, registration_number, name, make_model, capacity, model_year, odometer, is_active", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("registration_number");
    if (input.status === "active") query = query.eq("is_active", true);
    if (input.status === "inactive") query = query.eq("is_active", false);
    if (q) query = query.or(`registration_number.ilike.%${q}%,name.ilike.%${q}%,make_model.ilike.%${q}%`);
    const result = await query.range(from, to);
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const bounds = transportPeriodBounds("year");
    const buses = await mapBuses(supabase, businessUnitId, (result.data ?? []) as Array<Record<string, unknown>>, bounds.from, bounds.to);
    return { ok: true as const, buses, page: schoolPageMeta(page, result.count ?? 0, pageSize), capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getTransportBusesWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, BUSES_VIEW]);
    const enabled = await transportEnabled(supabase, businessUnitId);
    const list = await listTransportBusesAction({ page: 1, status: "active" });
    if (!list.ok) return list;
    return { ok: true as const, enabled, buses: list.buses, page: list.page, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type TransportBusesWorkspace = Awaited<ReturnType<typeof getTransportBusesWorkspaceAction>>;

export async function saveTransportBusAction(input: {
  id?: string;
  registrationNumber: string;
  name: string;
  makeModel: string;
  capacity: string;
  modelYear: string;
  odometer: string;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([BUSES_CREATE, BUSES_EDIT]);
    const registrationNumber = str(input.registrationNumber).toUpperCase();
    if (registrationNumber.length < 2) throw new SchoolError("Enter the bus registration number.", "VALIDATION");
    const capacity = num(input.capacity);
    const odometer = num(input.odometer);
    if (capacity < 0 || odometer < 0) throw new SchoolError("Capacity and odometer cannot be negative.", "VALIDATION");
    const modelYear = str(input.modelYear) ? num(input.modelYear) : null;
    const payload = {
      business_unit_id: businessUnitId,
      registration_number: registrationNumber,
      name: str(input.name),
      make_model: str(input.makeModel),
      capacity,
      model_year: modelYear,
      is_active: Boolean(input.isActive),
      ...(input.id ? {} : { odometer }),
    };
    const result = input.id
      ? await supabase.from("sch_buses").update(payload).eq("business_unit_id", businessUnitId).eq("id", str(input.id)).select("id").maybeSingle()
      : await supabase.from("sch_buses").insert(payload).select("id").maybeSingle();
    if (result.error) {
      if (result.error.code === "23505") throw new SchoolError("That registration number is already in use.", "CONFLICT");
      mapSchoolDbError(result.error, "save");
    }
    const id = String(result.data?.id ?? input.id ?? "");
    await audit({
      action: input.id ? "school.bus_updated" : "school.bus_added",
      description: `School bus ${input.id ? "updated" : "added"} · ${registrationNumber}`,
      entityType: "sch_buses",
      entityId: id,
      businessUnitId,
    });
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveTransportBusAction(id: string, isActive: boolean) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([BUSES_EDIT]);
    const row = await supabase
      .from("sch_buses")
      .select("id, registration_number")
      .eq("business_unit_id", businessUnitId)
      .eq("id", str(id))
      .maybeSingle();
    if (!row.data) throw new SchoolError("Bus was not found.", "NOT_FOUND");
    const { error } = await supabase.from("sch_buses").update({ is_active: isActive }).eq("id", str(id)).eq("business_unit_id", businessUnitId);
    if (error) mapSchoolDbError(error, "save");
    if (!isActive) {
      await supabase
        .from("sch_driver_assignments")
        .update({ is_active: false, ended_on: new Date().toISOString().slice(0, 10) })
        .eq("business_unit_id", businessUnitId)
        .eq("bus_id", str(id))
        .eq("is_active", true);
    }
    await audit({
      action: isActive ? "school.bus_updated" : "school.bus_archived",
      description: `School bus ${isActive ? "activated" : "deactivated"} · ${row.data.registration_number}`,
      entityType: "sch_buses",
      entityId: str(id),
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getTransportDriversWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, DRIVERS_VIEW, BUSES_VIEW, STAFF_VIEW]);
    const { page, from, to, pageSize } = schoolPageRange(1);
    const [assigns, buses, staff] = await Promise.all([
      supabase
        .from("sch_driver_assignments")
        .select("id, staff_id, bus_id, is_active, started_on", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("is_active", { ascending: false })
        .order("started_on", { ascending: false })
        .range(from, to),
      loadBusOptions(supabase, businessUnitId, true),
      loadStaffOptions(supabase, businessUnitId),
    ]);
    if (assigns.error && !isSchoolUnconfiguredRead(assigns.error)) mapSchoolDbError(assigns.error, "load");
    const staffIds = [...new Set((assigns.data ?? []).map((row) => String(row.staff_id)))];
    const busIds = [...new Set((assigns.data ?? []).map((row) => String(row.bus_id)))];
    const [staffRows, busRows] = await Promise.all([
      staffIds.length
        ? supabase.from("sch_staff").select("id, first_name, middle_name, last_name, staff_number").eq("business_unit_id", businessUnitId).in("id", staffIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      busIds.length
        ? supabase.from("sch_buses").select("id, registration_number").eq("business_unit_id", businessUnitId).in("id", busIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    ]);
    const staffMap = new Map((staffRows.data ?? []).map((row) => [String(row.id), { name: staffDisplayName(row), number: String(row.staff_number ?? "") }]));
    const busMap = new Map((busRows.data ?? []).map((row) => [String(row.id), String(row.registration_number)]));
    const drivers: TransportDriverRow[] = (assigns.data ?? []).map((row) => ({
      assignmentId: String(row.id),
      staffId: String(row.staff_id),
      staffName: staffMap.get(String(row.staff_id))?.name ?? "",
      staffNumber: staffMap.get(String(row.staff_id))?.number ?? "",
      busId: String(row.bus_id),
      busRegistration: busMap.get(String(row.bus_id)) ?? "",
      isActive: Boolean(row.is_active),
      startedOn: String(row.started_on ?? ""),
    }));
    return {
      ok: true as const,
      drivers,
      page: schoolPageMeta(page, assigns.count ?? 0, pageSize),
      buses,
      staff,
      capabilities: caps(user),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type TransportDriversWorkspace = Awaited<ReturnType<typeof getTransportDriversWorkspaceAction>>;

export async function listTransportDriversAction(input: { page?: number } = {}) {
  const workspace = await getTransportDriversWorkspaceAction();
  if (!workspace.ok) return workspace;
  const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
  const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, DRIVERS_VIEW, BUSES_VIEW, STAFF_VIEW]);
  const assigns = await supabase
    .from("sch_driver_assignments")
    .select("id, staff_id, bus_id, is_active, started_on", { count: "exact" })
    .eq("business_unit_id", businessUnitId)
    .order("is_active", { ascending: false })
    .order("started_on", { ascending: false })
    .range(from, to);
  if (assigns.error && !isSchoolUnconfiguredRead(assigns.error)) mapSchoolDbError(assigns.error, "load");
  const staffIds = [...new Set((assigns.data ?? []).map((row) => String(row.staff_id)))];
  const busIds = [...new Set((assigns.data ?? []).map((row) => String(row.bus_id)))];
  const [staffRows, busRows] = await Promise.all([
    staffIds.length
      ? supabase.from("sch_staff").select("id, first_name, middle_name, last_name, staff_number").eq("business_unit_id", businessUnitId).in("id", staffIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    busIds.length
      ? supabase.from("sch_buses").select("id, registration_number").eq("business_unit_id", businessUnitId).in("id", busIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const staffMap = new Map((staffRows.data ?? []).map((row) => [String(row.id), { name: staffDisplayName(row), number: String(row.staff_number ?? "") }]));
  const busMap = new Map((busRows.data ?? []).map((row) => [String(row.id), String(row.registration_number)]));
  return {
    ok: true as const,
    drivers: (assigns.data ?? []).map((row) => ({
      assignmentId: String(row.id),
      staffId: String(row.staff_id),
      staffName: staffMap.get(String(row.staff_id))?.name ?? "",
      staffNumber: staffMap.get(String(row.staff_id))?.number ?? "",
      busId: String(row.bus_id),
      busRegistration: busMap.get(String(row.bus_id)) ?? "",
      isActive: Boolean(row.is_active),
      startedOn: String(row.started_on ?? ""),
    })),
    page: schoolPageMeta(page, assigns.count ?? 0, pageSize),
    capabilities: workspace.capabilities,
  };
}

export async function assignTransportDriverAction(input: { staffId: string; busId: string }) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([DRIVERS_CREATE, DRIVERS_EDIT]);
    const { data, error } = await supabase.rpc("sch_assign_driver", {
      p_staff_id: str(input.staffId),
      p_bus_id: str(input.busId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't assign this driver.", "DATABASE");
    const staff = await supabase
      .from("sch_staff")
      .select("first_name, middle_name, last_name")
      .eq("id", str(input.staffId))
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    const bus = await supabase
      .from("sch_buses")
      .select("registration_number")
      .eq("id", str(input.busId))
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    await audit({
      action: "school.driver_assigned",
      description: `Driver assigned · ${staffDisplayName(staff.data ?? {})} → ${bus.data?.registration_number ?? ""}`,
      entityType: "sch_driver_assignments",
      entityId: String((data as { id?: string } | null)?.id ?? ""),
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function endTransportDriverAssignmentAction(assignmentId: string) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([DRIVERS_EDIT]);
    const row = await supabase
      .from("sch_driver_assignments")
      .select("id, staff_id, bus_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", str(assignmentId))
      .maybeSingle();
    if (!row.data) throw new SchoolError("Assignment was not found.", "NOT_FOUND");
    const { error } = await supabase
      .from("sch_driver_assignments")
      .update({ is_active: false, ended_on: new Date().toISOString().slice(0, 10) })
      .eq("id", str(assignmentId))
      .eq("business_unit_id", businessUnitId);
    if (error) mapSchoolDbError(error, "save");
    await audit({
      action: "school.driver_unassigned",
      description: "Driver assignment ended",
      entityType: "sch_driver_assignments",
      entityId: str(assignmentId),
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getTransportRoutesWorkspaceAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, ROUTES_VIEW, BUSES_VIEW]);
    const { page, from, to, pageSize } = schoolPageRange(1);
    const [routesRes, buses] = await Promise.all([
      supabase
        .from("sch_transport_routes")
        .select("id, name, details, price, billing_frequency, bus_id, is_active", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .order("name")
        .range(from, to),
      loadBusOptions(supabase, businessUnitId),
    ]);
    if (routesRes.error && !isSchoolUnconfiguredRead(routesRes.error)) mapSchoolDbError(routesRes.error, "load");
    const busIds = [...new Set((routesRes.data ?? []).map((row) => (row.bus_id ? String(row.bus_id) : "")).filter(Boolean))];
    const drivers = await currentDrivers(supabase, businessUnitId, busIds);
    const busMap = new Map(buses.map((row) => [row.id, row.registrationNumber]));
    const routes: TransportRouteRow[] = (routesRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      details: String(row.details ?? ""),
      price: num(row.price),
      billingFrequency: parseTransportBillingFrequency(row.billing_frequency),
      busId: row.bus_id ? String(row.bus_id) : null,
      busRegistration: row.bus_id ? (busMap.get(String(row.bus_id)) ?? "") : "",
      driverName: row.bus_id ? (drivers.get(String(row.bus_id))?.name ?? "") : "",
      isActive: Boolean(row.is_active),
    }));
    return { ok: true as const, routes, buses, page: schoolPageMeta(page, routesRes.count ?? 0, pageSize), capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type TransportRoutesWorkspace = Awaited<ReturnType<typeof getTransportRoutesWorkspaceAction>>;

export async function saveTransportRouteAction(input: {
  id?: string;
  name: string;
  details: string;
  price: string;
  billingFrequency: string;
  busId: string;
  isActive: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([ROUTES_CREATE, ROUTES_EDIT]);
    const name = str(input.name);
    if (name.length < 2) throw new SchoolError("Enter a route name.", "VALIDATION");
    const price = num(input.price);
    if (price < 0) throw new SchoolError("Route price cannot be negative.", "VALIDATION");
    const billingFrequency = parseTransportBillingFrequency(input.billingFrequency);
    const busId = str(input.busId) || null;
    if (busId) {
      const bus = await supabase
        .from("sch_buses")
        .select("id, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", busId)
        .maybeSingle();
      if (!bus.data) throw new SchoolError("Bus was not found.", "NOT_FOUND");
      if (!bus.data.is_active && input.isActive) throw new SchoolError("Assign an active bus to this route.", "VALIDATION");
    }
    const payload = {
      business_unit_id: businessUnitId,
      name,
      details: str(input.details),
      price,
      billing_frequency: billingFrequency,
      bus_id: busId,
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase.from("sch_transport_routes").update(payload).eq("id", str(input.id)).eq("business_unit_id", businessUnitId).select("id").maybeSingle()
      : await supabase.from("sch_transport_routes").insert(payload).select("id").maybeSingle();
    if (result.error) {
      if (result.error.code === "23505") throw new SchoolError("That route name is already in use.", "CONFLICT");
      mapSchoolDbError(result.error, "save");
    }
    await audit({
      action: input.id ? "school.route_updated" : "school.route_created",
      description: `Route ${input.id ? "updated" : "created"} · ${name}`,
      entityType: "sch_transport_routes",
      entityId: String(result.data?.id ?? input.id ?? ""),
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveTransportRouteAction(id: string, isActive: boolean) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([ROUTES_EDIT]);
    const { error } = await supabase
      .from("sch_transport_routes")
      .update({ is_active: isActive })
      .eq("id", str(id))
      .eq("business_unit_id", businessUnitId);
    if (error) mapSchoolDbError(error, "save");
    await audit({
      action: isActive ? "school.route_updated" : "school.route_archived",
      description: `Route ${isActive ? "activated" : "deactivated"}`,
      entityType: "sch_transport_routes",
      entityId: str(id),
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getTransportServiceWorkspaceAction(input: {
  tab?: "fuel" | "maintenance";
  busId?: string;
  period?: TransportPeriod;
  from?: string;
  to?: string;
  page?: number;
} = {}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, FUEL_VIEW, MAINT_VIEW, BUSES_VIEW]);
    const period = input.period ?? "month";
    const bounds = transportPeriodBounds(period, input.from, input.to);
    const tab = input.tab === "maintenance" ? "maintenance" : "fuel";
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const busId = str(input.busId);
    const [summary, buses] = await Promise.all([
      loadSummary(supabase, businessUnitId, bounds.from, bounds.to),
      loadBusOptions(supabase, businessUnitId),
    ]);
    if (tab === "maintenance") {
      let query = supabase
        .from("sch_maintenance_records")
        .select("id, bus_id, recorded_on, odometer, provider, work_performed, parts, cost, reference, notes", { count: "exact" })
        .eq("business_unit_id", businessUnitId)
        .gte("recorded_on", bounds.from)
        .lte("recorded_on", bounds.to)
        .order("recorded_on", { ascending: false });
      if (busId) query = query.eq("bus_id", busId);
      const result = await query.range(from, to);
      if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
      const busMap = new Map(buses.map((row) => [row.id, row.registrationNumber]));
      const maintenance: TransportMaintenanceRow[] = (result.data ?? []).map((row) => ({
        id: String(row.id),
        busId: String(row.bus_id),
        busRegistration: busMap.get(String(row.bus_id)) ?? "",
        recordedOn: String(row.recorded_on),
        odometer: row.odometer == null ? null : num(row.odometer),
        provider: String(row.provider ?? ""),
        workPerformed: String(row.work_performed ?? ""),
        parts: String(row.parts ?? ""),
        cost: num(row.cost),
        reference: String(row.reference ?? ""),
        notes: String(row.notes ?? ""),
      }));
      return {
        ok: true as const,
        tab,
        period,
        ...bounds,
        summary,
        buses,
        fuel: [] as TransportFuelRow[],
        maintenance,
        page: schoolPageMeta(page, result.count ?? 0, pageSize),
        capabilities: caps(user),
      };
    }
    let query = supabase
      .from("sch_fuel_records")
      .select("id, bus_id, recorded_on, litres, unit_price, total_amount, odometer, station, reference, notes", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .gte("recorded_on", bounds.from)
      .lte("recorded_on", bounds.to)
      .order("recorded_on", { ascending: false });
    if (busId) query = query.eq("bus_id", busId);
    const result = await query.range(from, to);
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const busMap = new Map(buses.map((row) => [row.id, row.registrationNumber]));
    const fuel: TransportFuelRow[] = (result.data ?? []).map((row) => ({
      id: String(row.id),
      busId: String(row.bus_id),
      busRegistration: busMap.get(String(row.bus_id)) ?? "",
      recordedOn: String(row.recorded_on),
      litres: num(row.litres),
      unitPrice: num(row.unit_price),
      totalAmount: num(row.total_amount),
      odometer: row.odometer == null ? null : num(row.odometer),
      station: String(row.station ?? ""),
      reference: String(row.reference ?? ""),
      notes: String(row.notes ?? ""),
    }));
    return {
      ok: true as const,
      tab,
      period,
      ...bounds,
      summary,
      buses,
      fuel,
      maintenance: [] as TransportMaintenanceRow[],
      page: schoolPageMeta(page, result.count ?? 0, pageSize),
      capabilities: caps(user),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type TransportServiceWorkspace = Awaited<ReturnType<typeof getTransportServiceWorkspaceAction>>;

export async function recordTransportFuelAction(input: {
  busId: string;
  recordedOn: string;
  litres: string;
  unitPrice: string;
  odometer: string;
  station: string;
  reference: string;
  notes: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([FUEL_CREATE, "school.fuel.edit"]);
    const litres = num(input.litres);
    const unitPrice = num(input.unitPrice);
    if (litres <= 0 || unitPrice <= 0) throw new SchoolError("Enter valid litres and price per litre.", "VALIDATION");
    const odometer = str(input.odometer) ? num(input.odometer) : null;
    const { data, error } = await supabase.rpc("sch_record_fuel", {
      p_bus_id: str(input.busId),
      p_recorded_on: str(input.recordedOn),
      p_litres: litres,
      p_unit_price: unitPrice,
      p_odometer: odometer,
      p_station: str(input.station),
      p_reference: str(input.reference),
      p_notes: str(input.notes),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't save this fuel record.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; amount?: number; duplicate?: boolean };
    if (!payload.duplicate) {
      const bus = await supabase
        .from("sch_buses")
        .select("registration_number")
        .eq("id", str(input.busId))
        .eq("business_unit_id", businessUnitId)
        .maybeSingle();
      await audit({
        action: "school.fuel_recorded",
        description: `Fuel recorded · ${bus.data?.registration_number ?? ""} · ${payload.amount ?? litres * unitPrice}`,
        entityType: "sch_fuel_records",
        entityId: payload.id ?? null,
        businessUnitId,
      });
    }
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function recordTransportMaintenanceAction(input: {
  busId: string;
  recordedOn: string;
  odometer: string;
  provider: string;
  workPerformed: string;
  parts: string;
  cost: string;
  reference: string;
  notes: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([MAINT_CREATE, "school.maintenance.edit"]);
    const cost = num(input.cost);
    if (cost <= 0) throw new SchoolError("Enter a valid maintenance cost.", "VALIDATION");
    const odometer = str(input.odometer) ? num(input.odometer) : null;
    const { data, error } = await supabase.rpc("sch_record_maintenance", {
      p_bus_id: str(input.busId),
      p_recorded_on: str(input.recordedOn),
      p_odometer: odometer,
      p_provider: str(input.provider),
      p_work: str(input.workPerformed),
      p_parts: str(input.parts),
      p_cost: cost,
      p_reference: str(input.reference),
      p_notes: str(input.notes),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't save this maintenance record.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      const bus = await supabase
        .from("sch_buses")
        .select("registration_number")
        .eq("id", str(input.busId))
        .eq("business_unit_id", businessUnitId)
        .maybeSingle();
      await audit({
        action: "school.maintenance_recorded",
        description: `Maintenance recorded · ${bus.data?.registration_number ?? ""} · ${cost}`,
        entityType: "sch_maintenance_records",
        entityId: payload.id ?? null,
        businessUnitId,
      });
    }
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listSchoolExpensesAction(input: { page?: number; q?: string } = {}) {
  const result = await loadSchoolExpensesWorkspaceAction({
    page: input.page,
    q: input.q,
    period: "this-year",
  });
  if (!result.ok) return result;
  return {
    ok: true as const,
    expenses: result.workspace.expenses.map((row) => ({
      id: row.id,
      expenseNumber: row.expenseNumber,
      expenseDate: row.expenseDate,
      amount: row.amount,
      description: row.description,
      reference: row.reference,
      sourceType: row.sourceType,
      categoryName: row.categoryName,
    })),
    page: result.workspace.page,
    capabilities: caps(await requireAuth()),
  };
}

export type SchoolExpensesResult = Awaited<ReturnType<typeof listSchoolExpensesAction>>;
