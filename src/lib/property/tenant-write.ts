import { losesToEarlier, writeError, isUniqueConflict } from "@/lib/data/conflict";
import { assignmentNotes, owedByTenant, presentTenants, readAssignment } from "@/lib/property/tenants";
import { contractNumber, syncUnitOccupancy } from "@/lib/property/contract-write";

function phoneKey(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function codeFromName(name: string, prefix: string) {
  const base = String(name || prefix).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || prefix;
  return `${base}-${Date.now().toString(36).slice(-4)}`.slice(0, 50);
}

function plusOneYear(start: string) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

async function syncOccupancy(admin: any, buId: string, unitId: string) {
  await syncUnitOccupancy(admin, buId, unitId);
}

async function loadContext(admin: any, buId: string) {
  const [tenantsResult, contractsResult, propertiesResult, unitsResult, invoicesResult] = await Promise.all([
    admin.from("tenants").select("id, full_name, phone_number, email, status, notes, created_at").eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("rental_contracts").select("id, tenant_id, property_id, unit_id, status, rent_amount, contract_number, start_date, created_at").eq("business_unit_id", buId),
    admin.from("properties").select("id, name").eq("business_unit_id", buId),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent").eq("business_unit_id", buId),
    admin.from("rent_invoices").select("tenant_id, balance, status").eq("business_unit_id", buId),
  ]);
  return {
    tenants: tenantsResult.data || [],
    contracts: contractsResult.error ? [] : contractsResult.data || [],
    properties: propertiesResult.data || [],
    units: unitsResult.data || [],
    invoices: invoicesResult.data || [],
  };
}

function oneTenant(context: Awaited<ReturnType<typeof loadContext>>, tenantId: string) {
  const row = context.tenants.find((tenant: any) => tenant.id === tenantId);
  if (!row) return null;
  return presentTenants([row], context.contracts, context.properties, context.units, owedByTenant(context.invoices))[0];
}

export async function listTenantRecords(admin: any, buId: string) {
  const context = await loadContext(admin, buId);
  return presentTenants(context.tenants, context.contracts, context.properties, context.units, owedByTenant(context.invoices));
}

export async function createTenant(admin: any, buId: string, body: any) {
  const fullName = String(body.full_name || body.name || "").trim();
  const propertyId = String(body.property_id || "").trim();
  const unitId = String(body.unit_id || "").trim();
  if (!fullName) return { error: "Tenant name is required" };
  if (!propertyId) return { error: "Select a property" };

  const context = await loadContext(admin, buId);
  const property = context.properties.find((item: any) => item.id === propertyId);
  if (!property) return { error: "Property not found" };
  const unit = unitId ? context.units.find((item: any) => item.id === unitId) : null;
  if (unitId && (!unit || unit.property_id !== propertyId)) return { error: "Unit does not belong to the selected property" };

  const arrived = String(body.arrived_on || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrived)) return { error: "Enter the arrival date" };
  const status = body.status === "Inactive" ? "Inactive" : "Active";
  const phone = String(body.phone_number || body.phone || "").trim();
  const key = phoneKey(phone);
  if (key.length >= 6 && context.tenants.some((tenant: any) => phoneKey(tenant.phone_number) === key)) {
    return { error: "A tenant with this phone number already exists" };
  }
  const payload = {
    business_unit_id: buId,
    tenant_code: codeFromName(fullName, "TENANT"),
    full_name: fullName,
    phone_number: phone,
    email: String(body.email || "").trim(),
    status,
    notes: unit ? null : assignmentNotes(propertyId, arrived),
  };
  let inserted = await admin.from("tenants").insert(payload).select("id, full_name, phone_number, email, status, notes, created_at").single();
  if (inserted.error && isUniqueConflict(inserted.error)) {
    inserted = await admin.from("tenants").insert({ ...payload, tenant_code: codeFromName(fullName, "TENANT") }).select("id, full_name, phone_number, email, status, notes, created_at").single();
  }
  if (inserted.error || !inserted.data) return { error: writeError(inserted.error, "Save failed") };
  if (key.length >= 6) {
    const peers = await admin.from("tenants").select("id, phone_number, created_at").eq("business_unit_id", buId);
    const same = (peers.data || []).filter((tenant: any) => phoneKey(tenant.phone_number) === key);
    if (losesToEarlier(inserted.data, same)) {
      await admin.from("tenants").delete().eq("id", inserted.data.id).eq("business_unit_id", buId);
      return { error: "A tenant with this phone number already exists" };
    }
  }

  if (unit) {
    const contract = await admin.from("rental_contracts").insert({
      business_unit_id: buId,
      property_id: propertyId,
      unit_id: unit.id,
      tenant_id: inserted.data.id,
      contract_number: contractNumber(context.contracts.map((item: any) => item.contract_number)),
      start_date: arrived,
      end_date: plusOneYear(arrived),
      rent_amount: Number(unit.monthly_rent || 0),
      status: status === "Active" ? "Active" : "Ended",
    }).select("id, tenant_id, property_id, unit_id, status, start_date, created_at").single();
    if (contract.error) {
      await admin.from("tenants").delete().eq("id", inserted.data.id);
      return { error: writeError(contract.error, "The tenant could not be assigned to that unit") };
    }
    context.contracts.push(contract.data);
    if (status === "Active") await syncOccupancy(admin, buId, unit.id);
  }

  context.tenants.unshift(inserted.data);
  return { data: oneTenant(context, inserted.data.id) };
}

export async function assignTenant(admin: any, buId: string, tenant: any, propertyId: string, unitId: string, status: string, arrivedOn = "") {
  const context = await loadContext(admin, buId);
  const property = context.properties.find((item: any) => item.id === propertyId);
  if (!property) return { error: "Property not found" };
  const unit = unitId ? context.units.find((item: any) => item.id === unitId) : null;
  if (unitId && (!unit || unit.property_id !== propertyId)) return { error: "Unit does not belong to the selected property" };

  const existing = context.contracts.find((contract: any) => contract.tenant_id === tenant.id && contract.status !== "Ended")
    || context.contracts.find((contract: any) => contract.tenant_id === tenant.id);
  const previousUnitId = existing?.unit_id || "";
  const contractStatus = status === "Active" && unit ? "Active" : "Ended";

  if (unit) {
    if (existing) {
      const updated = await admin.from("rental_contracts").update({
        property_id: propertyId,
        unit_id: unit.id,
        rent_amount: Number(unit.monthly_rent || existing.rent_amount || 0),
        status: contractStatus,
        ...(arrivedOn ? { start_date: arrivedOn } : {}),
      }).eq("id", existing.id).select("id, tenant_id, property_id, unit_id, status, start_date, created_at").single();
      if (updated.error) return { error: updated.error.message };
      Object.assign(existing, updated.data);
    } else {
      const start = arrivedOn || new Date().toISOString().slice(0, 10);
      const created = await admin.from("rental_contracts").insert({
        business_unit_id: buId,
        property_id: propertyId,
        unit_id: unit.id,
        tenant_id: tenant.id,
        contract_number: contractNumber(context.contracts.map((item: any) => item.contract_number)),
        start_date: start,
        end_date: plusOneYear(start),
        rent_amount: Number(unit.monthly_rent || 0),
        status: contractStatus,
      }).select("id, tenant_id, property_id, unit_id, status, start_date, created_at").single();
      if (created.error) return { error: writeError(created.error, "The tenant could not be assigned to that unit") };
      context.contracts.push(created.data);
    }
    const notes = readAssignment(tenant.notes) ? null : tenant.notes;
    if (notes !== tenant.notes) {
      await admin.from("tenants").update({ notes }).eq("id", tenant.id);
      tenant.notes = notes;
    }
  } else if (existing) {
    const ended = await admin.from("rental_contracts").update({ status: "Ended" }).eq("id", existing.id).select("id, tenant_id, property_id, unit_id, status, created_at").single();
    if (ended.error) return { error: ended.error.message };
    Object.assign(existing, ended.data);
    await admin.from("tenants").update({ notes: assignmentNotes(propertyId, arrivedOn) }).eq("id", tenant.id);
    tenant.notes = assignmentNotes(propertyId, arrivedOn);
  } else {
    await admin.from("tenants").update({ notes: assignmentNotes(propertyId, arrivedOn) }).eq("id", tenant.id);
    tenant.notes = assignmentNotes(propertyId, arrivedOn);
  }

  if (previousUnitId && previousUnitId !== unitId) await syncOccupancy(admin, buId, previousUnitId);
  if (unitId) await syncOccupancy(admin, buId, unitId);
  const row = context.tenants.find((item: any) => item.id === tenant.id) || tenant;
  Object.assign(row, tenant);
  const tenants = context.tenants.some((item: any) => item.id === tenant.id) ? context.tenants : [tenant, ...context.tenants];
  return { data: oneTenant({ ...context, tenants }, tenant.id) };
}
