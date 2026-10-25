"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { FarmError, farmActionError, mapFarmDbError, requireAnyFarmPermission } from "@/lib/farm/access";

function refreshFarm() {
  revalidatePath("/farm");
  revalidatePath("/farm/tractors");
  revalidatePath("/farm/jobs");
  revalidatePath("/farm/fuel");
  revalidatePath("/farm/operations");
  revalidatePath("/farm/finance");
  revalidatePath("/farm/reports");
  revalidatePath("/farm/customers");
  revalidatePath("/farm/suppliers");
  revalidatePath("/farm/staff");
  revalidatePath("/farm/settings");
  revalidatePath("/owner/finance");
  revalidatePath("/dashboard");
}

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

type RpcPayload = { id?: string; number?: string; code?: string; duplicate?: boolean };

async function rpcResult(
  supabase: Awaited<ReturnType<typeof requireAnyFarmPermission>>["supabase"],
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) mapFarmDbError(error);
  return (data ?? {}) as RpcPayload;
}

export async function saveFarmTractorAction(input: {
  id?: string;
  code: string;
  name: string;
  registrationNumber?: string;
  manufacturer?: string;
  model?: string;
  acquiredOn?: string;
  acquisitionCost?: string;
  status: string;
  hourMeter: string;
  notes?: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnyFarmPermission(["farm.tractors.create", "farm.tractors.edit"]);
    const payload = await rpcResult(supabase, "farm_save_tractor", {
      p_id: str(input.id) || null,
      p_code: str(input.code),
      p_name: str(input.name),
      p_registration_number: str(input.registrationNumber) || null,
      p_manufacturer: str(input.manufacturer) || null,
      p_model: str(input.model) || null,
      p_acquired_on: str(input.acquiredOn) || null,
      p_acquisition_cost: str(input.acquisitionCost) ? num(input.acquisitionCost) : null,
      p_status: str(input.status) || "AVAILABLE",
      p_hour_meter: num(input.hourMeter || "0"),
      p_notes: str(input.notes) || null,
      p_is_active: true,
    });
    await writeAuditEvent({
      action: input.id ? "farm.tractor_updated" : "farm.tractor_saved",
      module: "farm",
      description: `Tractor ${payload.code ?? str(input.code)}`,
      severity: "medium",
      entityType: "farm_tractors",
      entityId: payload.id ?? null,
      businessUnitId,
    });
    refreshFarm();
    return { ok: true as const, id: payload.id ?? "" };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmJobAction(input: {
  requestId: string;
  partyId?: string;
  partyName?: string;
  partyPhone?: string;
  serviceTypeId: string;
  tractorId?: string;
  operatorId?: string;
  location?: string;
  areaHa?: string;
  occurredOn: string;
  agreedPrice: string;
  amountPaid?: string;
  paymentMethod?: string;
  status?: string;
  hourMeter?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.jobs.create", "farm.jobs.edit"]);
    const payload = await rpcResult(supabase, "farm_record_job", {
      p_party_id: str(input.partyId) || null,
      p_party_name: str(input.partyName),
      p_party_phone: str(input.partyPhone),
      p_service_type_id: str(input.serviceTypeId),
      p_tractor_id: str(input.tractorId) || null,
      p_operator_id: str(input.operatorId) || null,
      p_location: str(input.location) || null,
      p_area_ha: str(input.areaHa) ? num(input.areaHa) : null,
      p_occurred_on: str(input.occurredOn),
      p_agreed_price: num(input.agreedPrice),
      p_amount_paid: str(input.amountPaid) ? num(input.amountPaid) : 0,
      p_payment_method: str(input.paymentMethod) || null,
      p_status: str(input.status) || "PENDING",
      p_hour_meter: str(input.hourMeter) ? num(input.hourMeter) : null,
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.job_recorded",
        module: "farm",
        description: `Tractor job ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "farm_jobs",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmJobPaymentAction(input: {
  requestId: string;
  jobId: string;
  amount: string;
  occurredOn?: string;
  paymentMethod?: string;
  paymentReference?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.jobs.edit", "farm.jobs.create"]);
    const amount = num(input.amount);
    if (!(amount > 0)) throw new FarmError("Payment amount must be greater than zero.", "VALIDATION");
    const payload = await rpcResult(supabase, "farm_record_job_payment", {
      p_job_id: str(input.jobId),
      p_amount: amount,
      p_occurred_on: str(input.occurredOn) || null,
      p_payment_method: str(input.paymentMethod) || null,
      p_payment_reference: str(input.paymentReference) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.job_payment_recorded",
        module: "farm",
        description: "Customer payment on a tractor job",
        severity: "medium",
        entityType: "farm_job_payments",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmFuelAction(input: {
  requestId: string;
  tractorId: string;
  supplierId?: string;
  supplierName?: string;
  occurredOn: string;
  litres: string;
  unitPrice: string;
  fuelType?: string;
  stationName?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.fuel.create"]);
    const payload = await rpcResult(supabase, "farm_record_fuel", {
      p_tractor_id: str(input.tractorId),
      p_supplier_id: str(input.supplierId) || null,
      p_supplier_name: str(input.supplierName) || null,
      p_occurred_on: str(input.occurredOn),
      p_litres: num(input.litres),
      p_unit_price: num(input.unitPrice),
      p_hour_meter: null,
      p_station_name: str(input.stationName) || null,
      p_payment_method: str(input.paymentMethod) || "CASH",
      p_payment_reference: str(input.paymentReference) || null,
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.fuel_recorded",
        module: "farm",
        description: `Fuel ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "farm_fuel",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmMaintenanceAction(input: {
  requestId: string;
  tractorId: string;
  supplierId?: string;
  supplierName?: string;
  occurredOn: string;
  category: string;
  description: string;
  partsCost?: string;
  labourCost?: string;
  hourMeter?: string;
  nextServiceOn?: string;
  nextServiceHours?: string;
  markUnderService?: boolean;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.maintenance.create"]);
    const payload = await rpcResult(supabase, "farm_record_maintenance", {
      p_tractor_id: str(input.tractorId),
      p_supplier_id: str(input.supplierId) || null,
      p_supplier_name: str(input.supplierName) || null,
      p_occurred_on: str(input.occurredOn),
      p_category: str(input.category) || "SERVICE",
      p_description: str(input.description),
      p_parts_cost: str(input.partsCost) ? num(input.partsCost) : 0,
      p_labour_cost: str(input.labourCost) ? num(input.labourCost) : 0,
      p_hour_meter: str(input.hourMeter) ? num(input.hourMeter) : null,
      p_next_service_on: str(input.nextServiceOn) || null,
      p_next_service_hours: str(input.nextServiceHours) ? num(input.nextServiceHours) : null,
      p_mark_under_service: Boolean(input.markUnderService),
      p_payment_method: str(input.paymentMethod) || "CASH",
      p_payment_reference: str(input.paymentReference) || null,
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.maintenance_recorded",
        module: "farm",
        description: `Maintenance ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "farm_maintenance",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmOperationAction(input: {
  requestId: string;
  plotId?: string;
  seasonId?: string;
  tractorId?: string;
  activity: string;
  occurredOn: string;
  areaHa?: string;
  cost?: string;
  paymentMethod?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.operations.create"]);
    const payload = await rpcResult(supabase, "farm_record_operation", {
      p_plot_id: str(input.plotId) || null,
      p_season_id: str(input.seasonId) || null,
      p_tractor_id: str(input.tractorId) || null,
      p_activity: str(input.activity),
      p_occurred_on: str(input.occurredOn),
      p_area_ha: str(input.areaHa) ? num(input.areaHa) : null,
      p_cost: str(input.cost) ? num(input.cost) : 0,
      p_payment_method: str(input.paymentMethod) || null,
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.operation_recorded",
        module: "farm",
        description: "Company farm operation",
        severity: "low",
        entityType: "farm_operations",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmExpenseAction(input: {
  requestId: string;
  kind: string;
  occurredOn: string;
  amount: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyFarmPermission(["farm.expenses.create", "farm.fuel.create"]);
    const payload = await rpcResult(supabase, "farm_record_expense", {
      p_kind: str(input.kind),
      p_occurred_on: str(input.occurredOn),
      p_amount: num(input.amount),
      p_payment_method: str(input.paymentMethod) || "CASH",
      p_payment_reference: str(input.paymentReference) || null,
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "farm.expense_recorded",
        module: "farm",
        description: "Farm operating expense",
        severity: "medium",
        entityType: "farm_expenses",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshFarm();
    }
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function saveFarmPartyAction(input: { id?: string; kind: string; name: string; phone?: string; notes?: string }) {
  try {
    const { supabase } = await requireAnyFarmPermission(["farm.customers.create", "farm.jobs.create", "farm.customers.edit"]);
    const payload = await rpcResult(supabase, "farm_save_party", {
      p_id: str(input.id) || null,
      p_kind: str(input.kind),
      p_name: str(input.name),
      p_phone: str(input.phone) || null,
      p_notes: str(input.notes) || null,
    });
    refreshFarm();
    return { ok: true as const, id: payload.id ?? "" };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function saveFarmStaffAction(input: { id?: string; name: string; phone?: string; role?: string; notes?: string }) {
  try {
    const { supabase } = await requireAnyFarmPermission(["farm.staff.create", "farm.jobs.edit"]);
    const payload = await rpcResult(supabase, "farm_save_staff", {
      p_id: str(input.id) || null,
      p_name: str(input.name),
      p_phone: str(input.phone) || null,
      p_role: str(input.role) || "OPERATOR",
      p_notes: str(input.notes) || null,
    });
    refreshFarm();
    return { ok: true as const, id: payload.id ?? "" };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function saveFarmPlotAction(input: { id?: string; name: string; hectares?: string; crop?: string; notes?: string }) {
  try {
    const { supabase } = await requireAnyFarmPermission(["farm.plots.create", "farm.plots.edit", "farm.operations.create"]);
    const payload = await rpcResult(supabase, "farm_save_plot", {
      p_id: str(input.id) || null,
      p_name: str(input.name),
      p_hectares: str(input.hectares) ? num(input.hectares) : null,
      p_crop: str(input.crop) || null,
      p_notes: str(input.notes) || null,
    });
    refreshFarm();
    return { ok: true as const, id: payload.id ?? "" };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function saveFarmSeasonAction(input: { id?: string; plotId: string; name: string; year: string; crop?: string }) {
  try {
    const { supabase } = await requireAnyFarmPermission(["farm.seasons.create", "farm.seasons.edit", "farm.operations.create"]);
    const payload = await rpcResult(supabase, "farm_save_season", {
      p_id: str(input.id) || null,
      p_plot_id: str(input.plotId),
      p_name: str(input.name),
      p_year: num(input.year),
      p_crop: str(input.crop) || null,
    });
    refreshFarm();
    return { ok: true as const, id: payload.id ?? "" };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function recordFarmHarvestAction(input: {
  requestId: string;
  seasonId: string;
  quantity: string;
  unit?: string;
  harvestedOn: string;
  notes?: string;
}) {
  try {
    const { supabase, userId } = await requireAnyFarmPermission(["farm.harvests.create"]);
    const payload = await rpcResult(supabase, "farm_record_harvest", {
      p_season_id: str(input.seasonId),
      p_quantity: num(input.quantity),
      p_unit: str(input.unit) || "kg",
      p_harvested_on: str(input.harvestedOn),
      p_notes: str(input.notes) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) refreshFarm();
    return { ok: true as const, duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}
