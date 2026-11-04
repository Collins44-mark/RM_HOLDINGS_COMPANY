import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { presentContracts, type ContractOption, type ContractRecord } from "@/lib/property/contracts";

function addressOf(property: { street_address?: string; ward?: string; district?: string; region?: string }) {
  return [property?.street_address, property?.ward, property?.district, property?.region].filter(Boolean).join(", ");
}

export async function listContractDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { contracts: [] as ContractRecord[], tenants: [] as ContractOption[], properties: [] as ContractOption[], units: [] as ContractOption[] };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  const buId = resolved.buId;
  const [contractsResult, tenantsResult, propertiesResult, unitsResult] = await Promise.all([
    admin.from("rental_contracts").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(200),
    admin.from("tenants").select("id, full_name, phone_number, email").eq("business_unit_id", buId).order("full_name"),
    admin.from("properties").select("id, name, street_address, ward, district, region").eq("business_unit_id", buId).order("name"),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent, unit_type, floor").eq("business_unit_id", buId).order("unit_name"),
  ]);
  const tenants = tenantsResult.data || [];
  const properties = propertiesResult.data || [];
  const units = unitsResult.data || [];
  return {
    contracts: presentContracts(contractsResult.data || [], tenants, properties, units),
    tenants: tenants.map((tenant) => ({ id: tenant.id, name: tenant.full_name, phone: tenant.phone_number || "", email: tenant.email || "" })),
    properties: properties.map((property) => ({ id: property.id, name: property.name, address: addressOf(property) })),
    units: units.map((unit) => ({
      id: unit.id,
      name: unit.unit_name || unit.unit_code || "Unit",
      property_id: unit.property_id,
      monthly_rent: Number(unit.monthly_rent || 0),
      unit_type: unit.unit_type || "",
      floor: unit.floor ?? null,
    })),
  };
}
