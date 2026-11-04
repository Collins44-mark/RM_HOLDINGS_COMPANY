import { CONTRACT_FREQUENCIES, isCurrentContract, presentContracts, todayIso } from "@/lib/property/contracts";
import { nextSerial } from "@/lib/property/serial";

const CONTRACT_COLUMNS = "id, business_unit_id, property_id, unit_id, tenant_id, contract_number, start_date, end_date, rent_amount, billing_frequency, deposit_amount, payment_due_day, contract_terms, status, created_at, updated_at";

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function contractNumber(existing: string[]) {
  return nextSerial(existing, "CON", 0);
}

async function loadDirectory(admin: any, buId: string) {
  const [contractsResult, tenantsResult, propertiesResult, unitsResult] = await Promise.all([
    admin.from("rental_contracts").select(CONTRACT_COLUMNS).eq("business_unit_id", buId),
    admin.from("tenants").select("id, full_name, phone_number, email, business_unit_id").eq("business_unit_id", buId),
    admin.from("properties").select("id, name, street_address, ward, district, region, business_unit_id").eq("business_unit_id", buId),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent, unit_type, floor, business_unit_id").eq("business_unit_id", buId),
  ]);
  return {
    contracts: contractsResult.data || [],
    tenants: tenantsResult.data || [],
    properties: propertiesResult.data || [],
    units: unitsResult.data || [],
  };
}

function presentOne(directory: Awaited<ReturnType<typeof loadDirectory>>, id: string) {
  const row = directory.contracts.find((contract: any) => contract.id === id);
  if (!row) return null;
  return presentContracts([row], directory.tenants, directory.properties, directory.units)[0];
}

export async function syncUnitOccupancy(admin: any, buId: string, unitId: string) {
  if (!unitId) return;
  const { data } = await admin.from("rental_contracts").select("id, status, start_date, end_date").eq("business_unit_id", buId).eq("unit_id", unitId).eq("status", "Active");
  const occupied = (data || []).some((contract: any) => isCurrentContract(contract));
  await admin.from("property_units").update({ occupancy_status: occupied ? "Occupied" : "Vacant" }).eq("id", unitId).eq("business_unit_id", buId);
}

function validateTerms(body: any, directory: Awaited<ReturnType<typeof loadDirectory>>, ignoreContractId = "") {
  const tenantId = String(body.tenant_id || "").trim();
  const propertyId = String(body.property_id || "").trim();
  const unitId = String(body.unit_id || "").trim();
  const start = String(body.start_date || "").slice(0, 10);
  const end = String(body.end_date || "").slice(0, 10);
  const rent = money(body.rent_amount);
  const deposit = money(body.deposit_amount ?? 0);
  const frequency = String(body.billing_frequency || "Monthly");
  const dueDay = Number(body.payment_due_day || 1);
  const requested = body.status === "Active" ? "Active" : "Pending";
  if (!directory.tenants.some((tenant: any) => tenant.id === tenantId)) return { error: "Select a tenant from this business" };
  const property = directory.properties.find((item: any) => item.id === propertyId);
  if (!property) return { error: "Select a property from this business" };
  const unit = directory.units.find((item: any) => item.id === unitId);
  if (!unit || unit.property_id !== propertyId) return { error: "Select a unit that belongs to the selected property" };
  if (!start || !end) return { error: "Start date and end date are required" };
  if (end <= start) return { error: "End date must be after the start date" };
  if (rent == null) return { error: "Monthly rent must be a valid amount" };
  if (deposit == null) return { error: "Security deposit must be a valid amount" };
  if (!CONTRACT_FREQUENCIES.includes(frequency as (typeof CONTRACT_FREQUENCIES)[number])) return { error: "Select a payment frequency" };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { error: "Rent due day must be between 1 and 28" };
  const status = requested === "Active" && end < todayIso() ? "Completed" : requested;
  if (status === "Active") {
    const clash = directory.contracts.find((contract: any) => {
      if (contract.id === ignoreContractId || contract.unit_id !== unitId || contract.status !== "Active") return false;
      return start < contract.end_date && contract.start_date < end;
    });
    if (clash) return { error: "This unit already has an active contract for those dates" };
  }
  return {
    value: {
      tenant_id: tenantId,
      property_id: propertyId,
      unit_id: unitId,
      start_date: start,
      end_date: end,
      rent_amount: rent,
      deposit_amount: deposit,
      billing_frequency: frequency,
      payment_due_day: dueDay,
      contract_terms: String(body.contract_terms || "").trim(),
      status,
    },
  };
}

async function insertContract(admin: any, buId: string, value: any, existingNumbers: string[]) {
  const number = value.contract_number || contractNumber(existingNumbers);
  let payload = { ...value, business_unit_id: buId, contract_number: number, updated_at: new Date().toISOString() };
  let inserted = await admin.from("rental_contracts").insert(payload).select(CONTRACT_COLUMNS).single();
  if (inserted.error && /duplicate|unique/i.test(inserted.error.message || "")) {
    payload = { ...payload, contract_number: contractNumber([...existingNumbers, number]) };
    inserted = await admin.from("rental_contracts").insert(payload).select(CONTRACT_COLUMNS).single();
  }
  return inserted;
}

export async function createContract(admin: any, buId: string, body: any) {
  const directory = await loadDirectory(admin, buId);
  const checked = validateTerms(body, directory);
  if (checked.error || !checked.value) return { error: checked.error || "Invalid contract" };
  const inserted = await insertContract(admin, buId, checked.value, directory.contracts.map((contract: any) => contract.contract_number));
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Save failed" };
  directory.contracts.push(inserted.data);
  if (checked.value.status === "Active") await syncUnitOccupancy(admin, buId, checked.value.unit_id);
  return { data: presentOne(directory, inserted.data.id) };
}

export async function updateContract(admin: any, buId: string, id: string, body: any) {
  const directory = await loadDirectory(admin, buId);
  const existing = directory.contracts.find((contract: any) => contract.id === id);
  if (!existing) return { error: "Contract not found" };
  if (existing.status === "Terminated" || existing.status === "Ended") return { error: "A terminated contract cannot be edited" };
  const checked = validateTerms(body, directory, id);
  if (checked.error || !checked.value) return { error: checked.error || "Invalid contract" };
  const previousUnit = existing.unit_id;
  const updated = await admin.from("rental_contracts").update({ ...checked.value, updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId).select(CONTRACT_COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Update failed" };
  Object.assign(existing, updated.data);
  await syncUnitOccupancy(admin, buId, checked.value.unit_id);
  if (previousUnit !== checked.value.unit_id) await syncUnitOccupancy(admin, buId, previousUnit);
  return { data: presentOne(directory, id) };
}

export async function terminateContract(admin: any, buId: string, id: string, body: any) {
  const directory = await loadDirectory(admin, buId);
  const existing = directory.contracts.find((contract: any) => contract.id === id);
  if (!existing) return { error: "Contract not found" };
  if (existing.status === "Terminated" || existing.status === "Ended" || existing.status === "Completed") {
    return { error: "This contract is already closed" };
  }
  const reason = String(body.reason || "").trim();
  const date = String(body.termination_date || todayIso()).slice(0, 10);
  if (!reason) return { error: "A termination reason is required" };
  if (!date) return { error: "A termination date is required" };
  const note = `Terminated on ${date}: ${reason}`;
  const terms = existing.contract_terms ? `${existing.contract_terms}\n\n${note}` : note;
  const updated = await admin.from("rental_contracts").update({
    status: "Terminated",
    contract_terms: terms,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).select(CONTRACT_COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Termination failed" };
  Object.assign(existing, updated.data);
  await syncUnitOccupancy(admin, buId, existing.unit_id);
  return { data: presentOne(directory, id) };
}

export async function renewContract(admin: any, buId: string, id: string, body: any) {
  const directory = await loadDirectory(admin, buId);
  const existing = directory.contracts.find((contract: any) => contract.id === id);
  if (!existing) return { error: "Contract not found" };
  const renewal = {
    ...body,
    tenant_id: existing.tenant_id,
    property_id: existing.property_id,
    unit_id: existing.unit_id,
    contract_terms: [`Renewed from ${existing.contract_number}.`, String(body.contract_terms || "").trim()].filter(Boolean).join("\n"),
  };
  const checked = validateTerms(renewal, directory, existing.status === "Active" ? id : "");
  if (checked.error || !checked.value) return { error: checked.error || "Invalid renewal" };
  const previousStatus = existing.status;
  if (checked.value.status === "Active" && existing.status === "Active") {
    const closed = await admin.from("rental_contracts").update({ status: "Completed", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId);
    if (closed.error) return { error: closed.error.message };
    existing.status = "Completed";
  }
  const inserted = await insertContract(admin, buId, checked.value, directory.contracts.map((contract: any) => contract.contract_number));
  if (inserted.error || !inserted.data) {
    if (previousStatus !== existing.status) {
      await admin.from("rental_contracts").update({ status: previousStatus }).eq("id", id);
      existing.status = previousStatus;
    }
    return { error: inserted.error?.message || "Renewal failed" };
  }
  directory.contracts.push(inserted.data);
  await syncUnitOccupancy(admin, buId, existing.unit_id);
  return { data: presentOne(directory, inserted.data.id), previous: presentOne(directory, id) };
}
