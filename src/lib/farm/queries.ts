import type { AuthUser } from "@/lib/auth/types";
import { EMPTY_PAGE, pageMeta, pageRange, parsePageSize, type PageMeta } from "@/lib/pagination";
import { FarmError, farmHasPermission, isFarmEmptyRead, isFarmMissingRelation, type FarmContext } from "@/lib/farm/access";
import { summarizeFarmLedgers, type FarmFinanceSummary, type FarmLedgerExpense, type FarmLedgerJob } from "@/lib/farm/accounting";
import type {
  FarmActivityRow,
  FarmCaps,
  FarmExpense,
  FarmFuel,
  FarmHarvest,
  FarmJob,
  FarmMaintenance,
  FarmOperation,
  FarmParty,
  FarmPlot,
  FarmSeason,
  FarmServiceType,
  FarmStaff,
  FarmTractor,
  FarmTractorStatus,
  FarmJobStatus,
  FarmPartyKind,
} from "@/lib/farm/types";

export type FarmPaging = { page?: number; pageSize?: number } | "all";

function resolvePaging(paging: FarmPaging = "all") {
  if (paging === "all") return null;
  return pageRange(paging.page ?? 1, parsePageSize(paging.pageSize));
}

const n = (value: unknown) => Number(value ?? 0) || 0;
const s = (value: unknown) => String(value ?? "");

export function farmCaps(user: AuthUser): FarmCaps {
  return {
    canTractors: farmHasPermission(user, "farm.tractors.create") || farmHasPermission(user, "farm.tractors.edit"),
    canJobs: farmHasPermission(user, "farm.jobs.create") || farmHasPermission(user, "farm.jobs.edit"),
    canFuel: farmHasPermission(user, "farm.fuel.create"),
    canMaintenance: farmHasPermission(user, "farm.maintenance.create"),
    canOperations: farmHasPermission(user, "farm.operations.create") || farmHasPermission(user, "farm.harvests.create"),
    canFinance: farmHasPermission(user, "farm.finance.view") || farmHasPermission(user, "farm.jobs.view"),
    canExpense: farmHasPermission(user, "farm.expenses.create") || farmHasPermission(user, "farm.fuel.create"),
    canReports: farmHasPermission(user, "farm.reports.view") || farmHasPermission(user, "farm.jobs.view"),
    canSettings: farmHasPermission(user, "farm.settings.manage"),
    canParties: farmHasPermission(user, "farm.customers.create") || farmHasPermission(user, "farm.jobs.create"),
    canStaff: farmHasPermission(user, "farm.staff.create") || farmHasPermission(user, "farm.jobs.edit"),
  };
}

function missing(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  if (isFarmMissingRelation(error)) return true;
  return false;
}

async function farmQuery<T>(
  ctx: FarmContext,
  run: () => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null; count?: number | null }>,
  message: string,
): Promise<{ rows: T[]; count: number }> {
  const { data, error, count } = await run();
  if (error) {
    if (missing(error)) throw new FarmError("Farm & Tractor Services ledgers are not in the live database yet.", "NOT_CONFIGURED");
    if (isFarmEmptyRead(error)) return { rows: [], count: 0 };
    throw new FarmError(message, "DATABASE");
  }
  return { rows: data ?? [], count: count ?? (data ?? []).length };
}

export async function loadFarmTractors(ctx: FarmContext): Promise<FarmTractor[]> {
  const { rows } = await farmQuery(
    ctx,
    () =>
      ctx.supabase
        .from("farm_tractors")
        .select("id, code, name, registration_number, manufacturer, model, acquired_on, acquisition_cost, status, hour_meter, notes, is_active")
        .eq("business_unit_id", ctx.businessUnitId)
        .order("name"),
    "Couldn't load tractors.",
  );
  const { rows: fuel } = await farmQuery(
    ctx,
    () => ctx.supabase.from("farm_v_tractor_fuel").select("tractor_id, litres").eq("business_unit_id", ctx.businessUnitId),
    "Couldn't load tractor fuel totals.",
  );
  const litres = new Map(fuel.map((row) => [s((row as { tractor_id: string }).tractor_id), n((row as { litres: number }).litres)]));
  return rows.map((row) => ({
    id: s(row.id),
    code: s(row.code),
    name: s(row.name),
    registrationNumber: row.registration_number ? s(row.registration_number) : null,
    manufacturer: row.manufacturer ? s(row.manufacturer) : null,
    model: row.model ? s(row.model) : null,
    acquiredOn: row.acquired_on ? s(row.acquired_on) : null,
    acquisitionCost: row.acquisition_cost == null ? null : n(row.acquisition_cost),
    status: s(row.status) as FarmTractorStatus,
    hourMeter: n(row.hour_meter),
    fuelLitres: litres.get(s(row.id)) ?? 0,
    notes: row.notes ? s(row.notes) : null,
    isActive: Boolean(row.is_active),
  }));
}

export async function loadFarmParties(ctx: FarmContext, kind?: FarmPartyKind): Promise<FarmParty[]> {
  let query = ctx.supabase
    .from("farm_parties")
    .select("id, party_number, kind, name, phone, notes")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("name");
  if (kind) query = query.or(`kind.eq.${kind},kind.eq.BOTH`);
  const { rows } = await farmQuery(ctx, () => query, "Couldn't load customers or suppliers.");
  return rows.map((row) => ({
    id: s(row.id),
    number: s(row.party_number),
    kind: s(row.kind) as FarmPartyKind,
    name: s(row.name),
    phone: row.phone ? s(row.phone) : null,
    notes: row.notes ? s(row.notes) : null,
  }));
}

export async function loadFarmStaff(ctx: FarmContext): Promise<FarmStaff[]> {
  const { rows } = await farmQuery(
    ctx,
    () =>
      ctx.supabase
        .from("farm_staff")
        .select("id, staff_number, name, phone, role")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("is_active", true)
        .order("name"),
    "Couldn't load staff.",
  );
  return rows.map((row) => ({
    id: s(row.id),
    number: s(row.staff_number),
    name: s(row.name),
    phone: row.phone ? s(row.phone) : null,
    role: s(row.role),
  }));
}

export async function loadFarmServiceTypes(ctx: FarmContext): Promise<FarmServiceType[]> {
  const { rows } = await farmQuery(
    ctx,
    () =>
      ctx.supabase
        .from("farm_service_types")
        .select("id, code, name, sort_order, is_active")
        .eq("business_unit_id", ctx.businessUnitId)
        .order("sort_order")
        .order("name"),
    "Couldn't load service types.",
  );
  return rows.map((row) => ({
    id: s(row.id),
    code: s(row.code),
    name: s(row.name),
    sortOrder: n(row.sort_order),
    isActive: Boolean(row.is_active),
  }));
}

function mapJob(row: Record<string, unknown>): FarmJob {
  const party = row.farm_parties as { name?: string } | null;
  const service = row.farm_service_types as { name?: string } | null;
  const tractor = row.farm_tractors as { name?: string } | null;
  return {
    id: s(row.id),
    number: s(row.job_number),
    partyId: s(row.party_id),
    partyName: s(party?.name),
    location: row.location ? s(row.location) : null,
    serviceTypeId: s(row.service_type_id),
    serviceName: s(service?.name),
    tractorId: row.tractor_id ? s(row.tractor_id) : null,
    tractorName: tractor?.name ? s(tractor.name) : null,
    operatorId: row.operator_id ? s(row.operator_id) : null,
    occurredOn: s(row.occurred_on),
    completedOn: row.completed_on ? s(row.completed_on) : null,
    areaHa: row.area_ha == null ? null : n(row.area_ha),
    agreedPrice: n(row.agreed_price),
    amountPaid: n(row.amount_paid),
    status: s(row.status) as FarmJobStatus,
    notes: row.notes ? s(row.notes) : null,
    payments: (row.farm_job_payments as Array<Record<string,unknown>> | null)?.map((p)=>({ id: s(p.id), amount: n(p.amount), occurredOn: s(p.occurred_on), paymentMethod: s(p.payment_method) || null, reference: s(p.payment_reference) || null, notes: s(p.notes) || null })) ?? [],
  };
}

export async function loadFarmJobs(ctx: FarmContext, from?: string, to?: string, paging: FarmPaging = "all"): Promise<{ jobs: FarmJob[]; listPage: PageMeta }> {
  const page = resolvePaging(paging);
  let query = ctx.supabase
    .from("farm_jobs")
    .select("id, job_number, party_id, service_type_id, tractor_id, operator_id, location, area_ha, occurred_on, completed_on, agreed_price, amount_paid, status, notes, farm_parties(name), farm_service_types(name), farm_tractors(name), farm_job_payments(id, amount, payment_method, payment_reference, occurred_on, notes, recorded_by)" , { count: "exact" })
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (page) query = query.range(page.from, page.to);
  const { rows, count } = await farmQuery(ctx, () => query, "Couldn't load jobs.");
  return {
    jobs: rows.map((row) => mapJob(row as Record<string, unknown>)),
    listPage: page ? pageMeta(page.page, count, page.pageSize) : pageMeta(1, count, Math.max(count, 1)),
  };
}

export async function loadFarmFuel(ctx: FarmContext, from?: string, to?: string, paging: FarmPaging = "all"): Promise<{ rows: FarmFuel[]; listPage: PageMeta }> {
  const page = resolvePaging(paging);
  let query = ctx.supabase
    .from("farm_fuel")
    .select("id, fuel_number, tractor_id, occurred_on, litres, unit_price, total_cost, station_name, notes, farm_tractors(name)", { count: "exact" })
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (page) query = query.range(page.from, page.to);
  const { rows, count } = await farmQuery(ctx, () => query, "Couldn't load fuel records.");
  return {
    rows: rows.map((row) => {
      const tractor = (row as { farm_tractors?: { name?: string } }).farm_tractors;
      return {
        id: s(row.id),
        number: s(row.fuel_number),
        tractorId: s(row.tractor_id),
        tractorName: s(tractor?.name),
        occurredOn: s(row.occurred_on),
        litres: n(row.litres),
        unitPrice: n(row.unit_price),
        totalCost: n(row.total_cost),
        stationName: row.station_name ? s(row.station_name) : null,
        notes: row.notes ? s(row.notes) : null,
      };
    }),
    listPage: page ? pageMeta(page.page, count, page.pageSize) : EMPTY_PAGE,
  };
}

export async function loadFarmMaintenance(ctx: FarmContext, from?: string, to?: string, paging: FarmPaging = "all"): Promise<{ rows: FarmMaintenance[]; listPage: PageMeta }> {
  const page = resolvePaging(paging);
  let query = ctx.supabase
    .from("farm_maintenance")
    .select("id, maintenance_number, tractor_id, occurred_on, category, description, parts_cost, labour_cost, total_cost, farm_tractors(name)", { count: "exact" })
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (page) query = query.range(page.from, page.to);
  const { rows, count } = await farmQuery(ctx, () => query, "Couldn't load maintenance records.");
  return {
    rows: rows.map((row) => {
      const tractor = (row as { farm_tractors?: { name?: string } }).farm_tractors;
      return {
        id: s(row.id),
        number: s(row.maintenance_number),
        tractorId: s(row.tractor_id),
        tractorName: s(tractor?.name),
        occurredOn: s(row.occurred_on),
        category: s(row.category),
        description: s(row.description),
        partsCost: n(row.parts_cost),
        labourCost: n(row.labour_cost),
        totalCost: n(row.total_cost),
      };
    }),
    listPage: page ? pageMeta(page.page, count, page.pageSize) : EMPTY_PAGE,
  };
}

export async function loadFarmExpenses(ctx: FarmContext, from?: string, to?: string, paging: FarmPaging = "all"): Promise<{ rows: FarmExpense[]; listPage: PageMeta }> {
  const page = resolvePaging(paging);
  let query = ctx.supabase
    .from("farm_expenses")
    .select("id, expense_number, kind, occurred_on, amount, notes, source_type", { count: "exact" })
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (page) query = query.range(page.from, page.to);
  const { rows, count } = await farmQuery(ctx, () => query, "Couldn't load expenses.");
  return {
    rows: rows.map((row) => ({
      id: s(row.id),
      number: s(row.expense_number),
      kind: s(row.kind),
      occurredOn: s(row.occurred_on),
      amount: n(row.amount),
      notes: row.notes ? s(row.notes) : null,
      sourceType: s(row.source_type),
    })),
    listPage: page ? pageMeta(page.page, count, page.pageSize) : EMPTY_PAGE,
  };
}

export async function loadFarmPlots(ctx: FarmContext): Promise<FarmPlot[]> {
  const { rows } = await farmQuery(
    ctx,
    () =>
      ctx.supabase
        .from("farm_plots")
        .select("id, plot_number, name, hectares, crop")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("is_active", true)
        .order("name"),
    "Couldn't load plots.",
  );
  return rows.map((row) => ({
    id: s(row.id),
    number: s(row.plot_number),
    name: s(row.name),
    hectares: row.hectares == null ? null : n(row.hectares),
    crop: row.crop ? s(row.crop) : null,
  }));
}

export async function loadFarmSeasons(ctx: FarmContext): Promise<FarmSeason[]> {
  const { rows } = await farmQuery(
    ctx,
    () =>
      ctx.supabase
        .from("farm_seasons")
        .select("id, season_number, plot_id, name, year, crop, farm_plots(name)")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("is_active", true)
        .order("year", { ascending: false }),
    "Couldn't load seasons.",
  );
  return rows.map((row) => {
    const plot = (row as { farm_plots?: { name?: string } }).farm_plots;
    return {
      id: s(row.id),
      number: s(row.season_number),
      plotId: s(row.plot_id),
      plotName: s(plot?.name),
      name: s(row.name),
      year: n(row.year),
      crop: row.crop ? s(row.crop) : null,
    };
  });
}

export async function loadFarmOperations(ctx: FarmContext, from?: string, to?: string): Promise<FarmOperation[]> {
  let query = ctx.supabase
    .from("farm_operations")
    .select("id, operation_number, activity, occurred_on, area_ha, cost, farm_plots(name), farm_seasons(name), farm_tractors(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  const { rows } = await farmQuery(ctx, () => query, "Couldn't load farming operations.");
  return rows.map((row) => {
    const rec = row as {
      farm_plots?: { name?: string };
      farm_seasons?: { name?: string };
      farm_tractors?: { name?: string };
    };
    return {
      id: s(row.id),
      number: s(row.operation_number),
      plotName: rec.farm_plots?.name ? s(rec.farm_plots.name) : null,
      seasonName: rec.farm_seasons?.name ? s(rec.farm_seasons.name) : null,
      tractorName: rec.farm_tractors?.name ? s(rec.farm_tractors.name) : null,
      activity: s(row.activity),
      occurredOn: s(row.occurred_on),
      areaHa: row.area_ha == null ? null : n(row.area_ha),
      cost: n(row.cost),
    };
  });
}

export async function loadFarmHarvests(ctx: FarmContext, from?: string, to?: string): Promise<FarmHarvest[]> {
  let query = ctx.supabase
    .from("farm_harvests")
    .select("id, harvest_number, quantity, unit, harvested_on, farm_seasons(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("harvested_on", { ascending: false });
  if (from) query = query.gte("harvested_on", from);
  if (to) query = query.lte("harvested_on", to);
  const { rows } = await farmQuery(ctx, () => query, "Couldn't load harvests.");
  return rows.map((row) => {
    const season = (row as { farm_seasons?: { name?: string } }).farm_seasons;
    return {
      id: s(row.id),
      number: s(row.harvest_number),
      seasonName: s(season?.name),
      quantity: n(row.quantity),
      unit: s(row.unit),
      harvestedOn: s(row.harvested_on),
    };
  });
}

export async function loadFarmLedgerSummary(ctx: FarmContext, from: string, to: string): Promise<FarmFinanceSummary> {
  const [jobsRes, expensesRes] = await Promise.all([
    ctx.supabase
      .from("farm_jobs")
      .select("id, occurred_on, completed_on, party_id, agreed_price, amount_paid, status, is_active")
      .eq("business_unit_id", ctx.businessUnitId),
    ctx.supabase
      .from("farm_expenses")
      .select("id, occurred_on, amount, kind, source_type, source_id, is_active")
      .eq("business_unit_id", ctx.businessUnitId),
  ]);
  if (jobsRes.error) {
    if (missing(jobsRes.error)) throw new FarmError("Farm & Tractor Services ledgers are not in the live database yet.", "NOT_CONFIGURED");
    if (!isFarmEmptyRead(jobsRes.error)) throw new FarmError("Couldn't load farm jobs ledger.", "DATABASE");
  }
  if (expensesRes.error) {
    if (missing(expensesRes.error)) throw new FarmError("Farm & Tractor Services ledgers are not in the live database yet.", "NOT_CONFIGURED");
    if (!isFarmEmptyRead(expensesRes.error)) throw new FarmError("Couldn't load farm expenses ledger.", "DATABASE");
  }
  const jobs: FarmLedgerJob[] = (jobsRes.data ?? []).map((row) => ({
    id: s(row.id),
    occurredOn: s(row.occurred_on),
    completedOn: row.completed_on ? s(row.completed_on) : null,
    partyId: s(row.party_id),
    agreedPrice: n(row.agreed_price),
    amountPaid: n(row.amount_paid),
    status: s(row.status),
    isActive: Boolean(row.is_active),
  }));
  const expenses: FarmLedgerExpense[] = (expensesRes.data ?? []).map((row) => ({
    id: s(row.id),
    occurredOn: s(row.occurred_on),
    amount: n(row.amount),
    kind: s(row.kind),
    sourceType: s(row.source_type),
    sourceId: row.source_id ? s(row.source_id) : null,
    isActive: Boolean(row.is_active),
  }));
  return summarizeFarmLedgers({ from, to, jobs, expenses });
}

export async function loadFarmActivity(ctx: FarmContext, limit = 8): Promise<FarmActivityRow[]> {
  const [fuel, maint] = await Promise.all([loadFarmFuel(ctx, undefined, undefined, "all"), loadFarmMaintenance(ctx, undefined, undefined, "all")]);
  const rows: FarmActivityRow[] = [
    ...fuel.rows.map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      tractorName: row.tractorName,
      kind: "FUEL" as const,
      detail: `${row.litres} L`,
      amount: row.totalCost,
    })),
    ...maint.rows.map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      tractorName: row.tractorName,
      kind: "MAINTENANCE" as const,
      detail: row.description,
      amount: row.totalCost,
    })),
  ];
  return rows.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id)).slice(0, limit);
}
