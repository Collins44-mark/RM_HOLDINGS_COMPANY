import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { paidByContract, presentContracts, type ContractOption, type ContractRecord } from "@/lib/property/contracts";
import { readAssignment } from "@/lib/property/tenants";
import { settlePendingContracts } from "@/lib/property/contract-write";

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
  await settlePendingContracts(admin, buId);
  const [contractsResult, tenantsResult, propertiesResult, unitsResult, invoicesResult] = await Promise.all([
    admin.from("rental_contracts").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(200),
    admin.from("tenants").select("id, full_name, phone_number, email, notes").eq("business_unit_id", buId).order("full_name"),
    admin.from("properties").select("id, name, street_address, ward, district, region").eq("business_unit_id", buId).order("name"),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent, unit_type, floor").eq("business_unit_id", buId).order("unit_name"),
    admin.from("rent_invoices").select("contract_id, amount_paid, status").eq("business_unit_id", buId),
  ]);
  const tenants = tenantsResult.data || [];
  const properties = propertiesResult.data || [];
  const units = unitsResult.data || [];
  return {
    contracts: presentContracts(contractsResult.data || [], tenants, properties, units, paidByContract(invoicesResult.data || [])),
    tenants: tenants.map((tenant) => {
      const current = (contractsResult.data || []).find((contract) => contract.tenant_id === tenant.id && contract.status !== "Ended" && contract.status !== "Terminated");
      const assignment = current ? null : readAssignment(tenant.notes);
      return {
        id: tenant.id,
        name: tenant.full_name,
        phone: tenant.phone_number || "",
        email: tenant.email || "",
        property_id: current?.property_id || assignment?.property_id || "",
        unit_id: current?.unit_id || "",
        arrived_on: current?.start_date ? String(current.start_date).slice(0, 10) : assignment?.arrived_on || "",
      };
    }),
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
