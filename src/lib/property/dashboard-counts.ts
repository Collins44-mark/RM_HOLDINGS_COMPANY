import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readAssignment } from "@/lib/property/tenants";
import { isCurrentContract } from "@/lib/property/contracts";
import { summarizeInvoices, type InvoiceRecord } from "@/lib/property/invoices";
import { listInvoiceRecords } from "@/lib/property/invoice-write";
import { summarizeExpenses } from "@/lib/property/expenses";
import { listExpenseRecords } from "@/lib/property/expense-write";

export type PropertyDashboardCounts = {
  properties: number;
  totalUnits: number;
  occupied: number;
  vacant: number;
  occupancyPct: number;
  rentCollected: number;
  expensesPaid: number;
  expensesOutstanding: number;
  paid: number;
  unpaid: number;
  overdue: number;
  totalInv: number;
  paidAmount: number;
  unpaidAmount: number;
  overdueAmount: number;
  recentInvoices: InvoiceRecord[];
  monthlyIncome: { month: string; amount: number }[];
};

const emptyCounts: PropertyDashboardCounts = {
  properties: 0,
  totalUnits: 0,
  occupied: 0,
  vacant: 0,
  occupancyPct: 0,
  rentCollected: 0,
  expensesPaid: 0,
  expensesOutstanding: 0,
  paid: 0,
  unpaid: 0,
  overdue: 0,
  totalInv: 0,
  paidAmount: 0,
  unpaidAmount: 0,
  overdueAmount: 0,
  recentInvoices: [],
  monthlyIncome: [],
};

async function resolveBusinessUnitId(user: any, admin: any) {
  const roleCode = user?.roleCode || "";
  const isOwner = roleCode === "OWNER" || roleCode === "SUPER_ADMIN";
  let buId = "";
  const assigned = user?.businessUnits || [];
  const propertyUnit = assigned.find((unit: { code?: string }) => unit?.code === "property") || (assigned.length === 1 ? assigned[0] : null);
  if (propertyUnit?.id && (propertyUnit.code === "property" || assigned.length === 1)) buId = String(propertyUnit.id);
  if (!buId && (isOwner || user?.modules?.includes("*") || assigned.some((unit: { code?: string }) => unit?.code === "property"))) {
    const { data: property } = await admin.from("business_units").select("id").eq("code", "property").maybeSingle();
    if (property?.id) buId = String(property.id);
  }
  return buId;
}

function unitRecord(row: any, tenantName = "") {
  return {
    id: row.id,
    name: row.unit_name || row.unit_code,
    status: row.occupancy_status || "Vacant",
    monthly_rent: Number(row.monthly_rent || 0),
    unit_type: row.unit_type || "Apartment",
    tenant_name: tenantName,
  };
}

export async function listProperties() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const buId = await resolveBusinessUnitId(user, admin);
  if (!buId) return [];
  const [propertiesResult, unitsResult, contractsResult, tenantsResult] = await Promise.all([
    admin.from("properties").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(50),
    admin.from("property_units").select("id, property_id, unit_name, unit_code, occupancy_status, monthly_rent, unit_type").eq("business_unit_id", buId),
    admin.from("rental_contracts").select("id, property_id, unit_id, tenant_id, contract_number, status, rent_amount, start_date, end_date").eq("business_unit_id", buId),
    admin.from("tenants").select("id, full_name, phone_number, status, notes").eq("business_unit_id", buId),
  ]);
  const units = unitsResult.data || [];
  const contracts = contractsResult.error ? [] : contractsResult.data || [];
  const tenants = tenantsResult.error ? [] : tenantsResult.data || [];
  const tenantName = new Map(tenants.map((tenant) => [tenant.id, tenant.full_name]));
  const activeContracts = contracts.filter((contract) => isCurrentContract(contract));
  return (propertiesResult.data || []).map((property) => {
    const propertyUnits = units.filter((unit) => unit.property_id === property.id).map((unit) => {
      const contract = activeContracts.find((item) => item.unit_id === unit.id);
      return unitRecord(unit, contract ? tenantName.get(contract.tenant_id) || "" : "");
    });
    const propertyRentals = contracts.filter((contract) => contract.property_id === property.id).map((contract) => ({
      ...contract,
      tenant_name: tenantName.get(contract.tenant_id) || "",
    }));
    const linked = new Map<string, { id: string; name: string; phone: string; status: string; unit_name: string }>();
    for (const contract of activeContracts.filter((item) => item.property_id === property.id)) {
      const tenant = tenants.find((item) => item.id === contract.tenant_id);
      if (!tenant || linked.has(tenant.id)) continue;
      const unit = units.find((item) => item.id === contract.unit_id);
      linked.set(tenant.id, {
        id: tenant.id,
        name: tenant.full_name,
        phone: tenant.phone_number || "",
        status: tenant.status || "Active",
        unit_name: unit?.unit_name || unit?.unit_code || "",
      });
    }
    for (const tenant of tenants) {
      if (linked.has(tenant.id)) continue;
      const assignment = readAssignment(tenant.notes);
      if (assignment?.property_id !== property.id) continue;
      linked.set(tenant.id, {
        id: tenant.id,
        name: tenant.full_name,
        phone: tenant.phone_number || "",
        status: tenant.status || "Active",
        unit_name: "",
      });
    }
    return {
      ...property,
      units: propertyUnits,
      rentals: propertyRentals,
      tenants: [...linked.values()],
      unit_count: propertyUnits.length,
      occupied_count: propertyUnits.filter((unit) => unit.status === "Occupied").length,
      vacant_count: propertyUnits.filter((unit) => unit.status === "Vacant").length,
      maintenance_count: propertyUnits.filter((unit) => unit.status === "Maintenance").length,
    };
  });
}

export async function getPropertyDashboardCounts(): Promise<PropertyDashboardCounts> {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return emptyCounts;
  const buId = await resolveBusinessUnitId(user, admin);
  if (!buId) return emptyCounts;

  const [propertiesResult, unitsResult] = await Promise.all([
    admin.from("properties").select("id", { count: "exact", head: true }).eq("business_unit_id", buId),
    admin.from("property_units").select("occupancy_status").eq("business_unit_id", buId),
  ]);

  const units = unitsResult.data || [];
  const occupied = units.filter((unit) => unit.occupancy_status === "Occupied").length;
  const vacant = units.filter((unit) => unit.occupancy_status === "Vacant").length;
  const totalUnits = units.length;
  const [invoices, expenses] = await Promise.all([listInvoiceRecords(admin, buId), listExpenseRecords(admin, buId)]);
  const summary = summarizeInvoices(invoices);
  const expenseSummary = summarizeExpenses(expenses.expenses);
  const open = invoices.filter((invoice) => invoice.effective_status !== "Cancelled");
  const amountFor = (status: string) => open.filter((invoice) => invoice.effective_status === status).reduce((sum, invoice) => sum + (status === "Paid" ? invoice.amount_paid : invoice.balance), 0);
  const months: { month: string; amount: number }[] = [];
  const cursor = new Date();
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    const key = date.toISOString().slice(0, 7);
    const label = date.toLocaleString("en", { month: "short", timeZone: "UTC" });
    const amount = invoices.flatMap((invoice) => invoice.payments).filter((payment) => payment.status === "Completed" && payment.payment_date.startsWith(key)).reduce((sum, payment) => sum + payment.amount, 0);
    months.push({ month: `${label} ${date.getUTCFullYear()}`, amount });
  }

  return {
    properties: propertiesResult.count ?? 0,
    totalUnits,
    occupied,
    vacant,
    occupancyPct: totalUnits ? Math.round((occupied / totalUnits) * 100) : 0,
    rentCollected: summary.collected,
    expensesPaid: expenseSummary.collected,
    expensesOutstanding: expenseSummary.outstanding,
    paid: summary.paid,
    unpaid: summary.unpaid,
    overdue: summary.overdue,
    totalInv: summary.total,
    paidAmount: amountFor("Paid"),
    unpaidAmount: amountFor("Unpaid") + amountFor("Partially Paid"),
    overdueAmount: amountFor("Overdue"),
    recentInvoices: invoices.slice(0, 5),
    monthlyIncome: months,
  };
}
