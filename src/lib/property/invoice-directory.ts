import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { listInvoiceRecords } from "@/lib/property/invoice-write";
import type { InvoiceContractOption, InvoiceRecord } from "@/lib/property/invoices";

export async function listInvoiceDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { invoices: [] as InvoiceRecord[], contracts: [] as InvoiceContractOption[] };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  const [invoices, contractsResult] = await Promise.all([
    listInvoiceRecords(admin, resolved.buId),
    admin.from("rental_contracts").select("id, contract_number, tenant_id, property_id, unit_id, rent_amount, billing_frequency, payment_due_day, start_date, end_date, status").eq("business_unit_id", resolved.buId),
  ]);
  const contracts = contractsResult.data || [];
  const tenantIds = [...new Set(contracts.map((contract) => contract.tenant_id))];
  const propertyIds = [...new Set(contracts.map((contract) => contract.property_id))];
  const unitIds = [...new Set(contracts.map((contract) => contract.unit_id))];
  const [tenantsResult, propertiesResult, unitsResult] = await Promise.all([
    tenantIds.length ? admin.from("tenants").select("id, full_name").in("id", tenantIds) : Promise.resolve({ data: [] }),
    propertyIds.length ? admin.from("properties").select("id, name").in("id", propertyIds) : Promise.resolve({ data: [] }),
    unitIds.length ? admin.from("property_units").select("id, unit_name, unit_code").in("id", unitIds) : Promise.resolve({ data: [] }),
  ]);
  const tenantName = new Map((tenantsResult.data || []).map((tenant) => [tenant.id, tenant.full_name]));
  const propertyName = new Map((propertiesResult.data || []).map((property) => [property.id, property.name]));
  const unitName = new Map((unitsResult.data || []).map((unit) => [unit.id, unit.unit_name || unit.unit_code]));
  return {
    invoices,
    contracts: contracts
      .filter((contract) => contract.status === "Active" || contract.status === "Completed")
      .map((contract) => ({
        id: contract.id,
        contract_number: contract.contract_number,
        tenant_name: tenantName.get(contract.tenant_id) || "",
        property_name: propertyName.get(contract.property_id) || "",
        unit_name: unitName.get(contract.unit_id) || "",
        rent_amount: Number(contract.rent_amount || 0),
        billing_frequency: contract.billing_frequency || "Monthly",
        payment_due_day: Number(contract.payment_due_day || 1),
        start_date: String(contract.start_date || "").slice(0, 10),
        end_date: String(contract.end_date || "").slice(0, 10),
      })),
  };
}
