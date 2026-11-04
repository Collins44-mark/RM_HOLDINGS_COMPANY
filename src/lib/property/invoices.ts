export type InvoicePayment = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  notes: string;
  status: string;
};

export type InvoiceRecord = {
  id: string;
  invoice_number: string;
  contract_id: string;
  contract_number: string;
  contract_start: string;
  contract_end: string;
  agreed_rent: number;
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
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  rent_amount: number;
  additional_charges: number;
  discount: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  effective_status: string;
  notes: string;
  payments: InvoicePayment[];
};

export type InvoiceContractOption = {
  id: string;
  contract_number: string;
  tenant_name: string;
  property_name: string;
  unit_name: string;
  rent_amount: number;
  billing_frequency: string;
  payment_due_day: number;
  start_date: string;
  end_date: string;
};

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Money"] as const;

export function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function invoiceStatus(row: { status?: string; due_date?: string; total_amount?: number; amount_paid?: number; balance?: number }, today = businessToday()) {
  if (row.status === "Cancelled") return "Cancelled";
  const balance = Number(row.balance ?? 0);
  const paid = Number(row.amount_paid ?? 0);
  if (balance <= 0) return "Paid";
  if (row.due_date && row.due_date.slice(0, 10) < today) return "Overdue";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

function dateOnly(value: string | null | undefined) {
  return String(value || "").slice(0, 10);
}

export function presentInvoices(invoices: any[], contracts: any[], tenants: any[], properties: any[], units: any[], payments: any[]): InvoiceRecord[] {
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const paymentsByInvoice = new Map<string, any[]>();
  for (const payment of payments) {
    const list = paymentsByInvoice.get(payment.invoice_id) || [];
    list.push(payment);
    paymentsByInvoice.set(payment.invoice_id, list);
  }
  return invoices.map((invoice) => {
    const contract = contractById.get(invoice.contract_id);
    const tenant = tenantById.get(invoice.tenant_id);
    const property = propertyById.get(invoice.property_id);
    const unit = unitById.get(invoice.unit_id);
    const linked = (paymentsByInvoice.get(invoice.id) || []).map((payment) => ({
      id: payment.id,
      payment_date: dateOnly(payment.payment_date),
      amount: Number(payment.amount || 0),
      payment_method: payment.payment_method || "Cash",
      transaction_reference: payment.transaction_reference || "",
      notes: payment.notes || "",
      status: payment.status || "Completed",
    }));
    const record = {
      id: invoice.id,
      invoice_number: invoice.invoice_number || "",
      contract_id: invoice.contract_id || "",
      contract_number: contract?.contract_number || "",
      contract_start: dateOnly(contract?.start_date),
      contract_end: dateOnly(contract?.end_date),
      agreed_rent: Number(contract?.rent_amount || 0),
      tenant_id: invoice.tenant_id || "",
      tenant_name: tenant?.full_name || "",
      tenant_phone: tenant?.phone_number || "",
      tenant_email: tenant?.email || "",
      property_id: invoice.property_id || "",
      property_name: property?.name || "",
      property_address: [property?.street_address, property?.ward, property?.district, property?.region].filter(Boolean).join(", "),
      unit_id: invoice.unit_id || "",
      unit_name: unit?.unit_name || unit?.unit_code || "",
      unit_type: unit?.unit_type || "",
      billing_period_start: dateOnly(invoice.billing_period_start),
      billing_period_end: dateOnly(invoice.billing_period_end),
      issue_date: dateOnly(invoice.issue_date),
      due_date: dateOnly(invoice.due_date),
      rent_amount: Number(invoice.rent_amount || 0),
      additional_charges: Number(invoice.additional_charges || 0),
      discount: Number(invoice.discount || 0),
      total_amount: Number(invoice.total_amount || 0),
      amount_paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance || 0),
      status: invoice.status || "Unpaid",
      effective_status: "Unpaid",
      notes: invoice.notes || "",
      payments: linked,
    };
    record.effective_status = invoiceStatus(record);
    return record;
  });
}

export function summarizeInvoices(rows: InvoiceRecord[]) {
  const open = rows.filter((row) => row.effective_status !== "Cancelled");
  return {
    total: rows.length,
    paid: rows.filter((row) => row.effective_status === "Paid").length,
    unpaid: rows.filter((row) => row.effective_status === "Unpaid").length,
    overdue: rows.filter((row) => row.effective_status === "Overdue").length,
    invoiced: open.reduce((sum, row) => sum + row.total_amount, 0),
    collected: open.reduce((sum, row) => sum + row.amount_paid, 0),
    outstanding: open.reduce((sum, row) => sum + row.balance, 0),
  };
}
