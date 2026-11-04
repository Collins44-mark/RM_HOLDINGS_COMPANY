export const CONTRACT_FREQUENCIES = ["Monthly", "Quarterly", "Yearly"] as const;

export type ContractRecord = {
  id: string;
  contract_number: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  tenant_email: string;
  property_id: string;
  property_name: string;
  property_address: string;
  unit_id: string;
  unit_name: string;
  unit_type: string;
  floor: number | null;
  unit_rent: number;
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  billing_frequency: string;
  payment_due_day: number;
  contract_terms: string;
  status: string;
  effective_status: string;
  created_at: string;
  updated_at: string;
};

export type ContractOption = {
  id: string;
  name: string;
  property_id?: string;
  monthly_rent?: number;
  unit_type?: string;
  floor?: number | null;
  phone?: string;
  email?: string;
  address?: string;
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function effectiveStatus(row: { status?: string; start_date?: string; end_date?: string }, today = todayIso()) {
  const status = row.status || "Pending";
  if (status === "Terminated" || status === "Ended") return "Terminated";
  if (status === "Completed") return "Completed";
  if (status === "Pending") return "Pending";
  if (status === "Active") {
    if (row.end_date && row.end_date < today) return "Completed";
    if (row.start_date && row.start_date > today) return "Pending";
    return "Active";
  }
  return status;
}

export function isCurrentContract(row: { status?: string; start_date?: string; end_date?: string }, today = todayIso()) {
  return row.status === "Active" && !!row.start_date && !!row.end_date && row.start_date <= today && row.end_date >= today;
}

function addressOf(property: any) {
  return [property?.street_address, property?.ward, property?.district, property?.region].filter(Boolean).join(", ");
}

export function presentContracts(rows: any[], tenants: any[], properties: any[], units: any[]): ContractRecord[] {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  return rows.map((row) => {
    const tenant = tenantById.get(row.tenant_id);
    const property = propertyById.get(row.property_id);
    const unit = unitById.get(row.unit_id);
    return {
      id: row.id,
      contract_number: row.contract_number || "",
      tenant_id: row.tenant_id || "",
      tenant_name: tenant?.full_name || "",
      tenant_phone: tenant?.phone_number || "",
      tenant_email: tenant?.email || "",
      property_id: row.property_id || "",
      property_name: property?.name || "",
      property_address: addressOf(property),
      unit_id: row.unit_id || "",
      unit_name: unit?.unit_name || unit?.unit_code || "",
      unit_type: unit?.unit_type || "",
      floor: unit?.floor ?? null,
      unit_rent: Number(unit?.monthly_rent || 0),
      start_date: String(row.start_date || "").slice(0, 10),
      end_date: String(row.end_date || "").slice(0, 10),
      rent_amount: Number(row.rent_amount || 0),
      deposit_amount: Number(row.deposit_amount || 0),
      billing_frequency: row.billing_frequency || "Monthly",
      payment_due_day: Number(row.payment_due_day || 1),
      contract_terms: row.contract_terms || "",
      status: row.status || "Pending",
      effective_status: effectiveStatus(row),
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
    };
  });
}
