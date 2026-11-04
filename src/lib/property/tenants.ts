import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";

export type TenantRecord = {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  status: string;
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_name: string;
  contract_id: string;
};

export type TenantOption = { id: string; name: string; property_id?: string };

export function readAssignment(notes: string | null | undefined) {
  if (!notes || !notes.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed?._assignment && parsed.property_id) return { property_id: String(parsed.property_id) };
  } catch {
    return null;
  }
  return null;
}

export function assignmentNotes(propertyId: string) {
  return JSON.stringify({ _assignment: true, property_id: propertyId });
}

function preferredContract(contracts: any[]) {
  return [...contracts].sort((a, b) => {
    const active = Number(b.status === "Active") - Number(a.status === "Active");
    if (active) return active;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  })[0];
}

export function presentTenants(tenantRows: any[], contracts: any[], properties: any[], units: any[]): TenantRecord[] {
  const propertyName = new Map(properties.map((property) => [property.id, property.name]));
  const unitName = new Map(units.map((unit) => [unit.id, unit.unit_name || unit.unit_code || "Unit"]));
  return tenantRows.map((tenant) => {
    const contract = preferredContract(contracts.filter((item) => item.tenant_id === tenant.id && item.status !== "Ended"));
    const assignment = contract ? null : readAssignment(tenant.notes);
    const propertyId = contract?.property_id || assignment?.property_id || "";
    const unitId = contract?.unit_id || "";
    return {
      id: tenant.id,
      full_name: tenant.full_name || "",
      phone_number: tenant.phone_number || "",
      email: tenant.email || "",
      status: tenant.status || "Active",
      property_id: propertyId,
      property_name: propertyName.get(propertyId) || "",
      unit_id: unitId,
      unit_name: unitName.get(unitId) || "",
      contract_id: contract?.id || "",
    };
  });
}

export async function listTenantDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { tenants: [] as TenantRecord[], properties: [] as TenantOption[], units: [] as TenantOption[] };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  const buId = resolved.buId;
  const [tenantsResult, contractsResult, propertiesResult, unitsResult] = await Promise.all([
    admin.from("tenants").select("id, full_name, phone_number, email, status, notes, created_at").eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("rental_contracts").select("id, tenant_id, property_id, unit_id, status, created_at").eq("business_unit_id", buId),
    admin.from("properties").select("id, name").eq("business_unit_id", buId).order("name"),
    admin.from("property_units").select("id, unit_name, unit_code, property_id").eq("business_unit_id", buId).order("unit_name"),
  ]);
  const properties = propertiesResult.data || [];
  const units = unitsResult.data || [];
  return {
    tenants: presentTenants(tenantsResult.data || [], contractsResult.error ? [] : contractsResult.data || [], properties, units),
    properties: properties.map((property) => ({ id: property.id, name: property.name })),
    units: units.map((unit) => ({ id: unit.id, name: unit.unit_name || unit.unit_code || "Unit", property_id: unit.property_id })),
  };
}
