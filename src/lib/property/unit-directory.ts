import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { isCurrentContract } from "@/lib/property/contracts";

export type UnitListItem = {
  id: string;
  name: string;
  status: string;
  monthly_rent: number;
  property_id: string;
  unit_type: string;
  tenant_name: string | null;
  property: { name: string } | null;
};

export type UnitPropertyOption = { id: string; name: string };

export async function listUnitDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { units: [] as UnitListItem[], properties: [] as UnitPropertyOption[] };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  const buId = resolved.buId;
  const [unitsResult, contractsResult, tenantsResult, propertiesResult] = await Promise.all([
    admin.from("property_units").select("*, properties(name)").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(200),
    admin.from("rental_contracts").select("unit_id, tenant_id, status, start_date, end_date, created_at").eq("business_unit_id", buId).eq("status", "Active"),
    admin.from("tenants").select("id, full_name").eq("business_unit_id", buId),
    admin.from("properties").select("id, name").eq("business_unit_id", buId).order("name"),
  ]);
  if (unitsResult.error) return empty;
  const names = new Map((tenantsResult.data || []).map((tenant) => [tenant.id, tenant.full_name]));
  const tenantByUnit = new Map<string, string>();
  for (const contract of [...(contractsResult.data || [])]
    .filter((row) => isCurrentContract(row))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))) {
    const name = names.get(contract.tenant_id);
    if (name) tenantByUnit.set(contract.unit_id, name);
  }
  return {
    units: (unitsResult.data || []).map((row) => ({
      id: row.id,
      name: row.unit_name || row.unit_code,
      status: row.occupancy_status || "Vacant",
      monthly_rent: row.monthly_rent ?? 0,
      property_id: row.property_id,
      unit_type: row.unit_type,
      tenant_name: tenantByUnit.get(row.id) || null,
      property: row.properties ? { name: row.properties.name } : null,
    })),
    properties: (propertiesResult.data || []).map((property) => ({ id: property.id, name: property.name })),
  };
}
