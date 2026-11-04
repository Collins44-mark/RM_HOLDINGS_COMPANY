import { businessToday, invoiceStatus, PAYMENT_METHODS, presentInvoices } from "@/lib/property/invoices";
import { isCurrentContract } from "@/lib/property/contracts";
import { nextSerial } from "@/lib/property/serial";

const INVOICE_COLUMNS = "id, business_unit_id, contract_id, tenant_id, property_id, unit_id, invoice_number, billing_period_start, billing_period_end, issue_date, due_date, rent_amount, additional_charges, discount, total_amount, amount_paid, balance, status, notes, created_at, updated_at";

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function invoiceNumber(existing: string[]) {
  return nextSerial(existing, "INV", 1);
}

async function load(admin: any, buId: string) {
  const [invoicesResult, contractsResult, tenantsResult, propertiesResult, unitsResult, paymentsResult] = await Promise.all([
    admin.from("rent_invoices").select(INVOICE_COLUMNS).eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("rental_contracts").select("id, contract_number, tenant_id, property_id, unit_id, rent_amount, billing_frequency, payment_due_day, start_date, end_date, status").eq("business_unit_id", buId),
    admin.from("tenants").select("id, full_name, phone_number, email").eq("business_unit_id", buId),
    admin.from("properties").select("id, name, street_address, ward, district, region").eq("business_unit_id", buId),
    admin.from("property_units").select("id, unit_name, unit_code, unit_type, property_id").eq("business_unit_id", buId),
    admin.from("rent_payments").select("id, invoice_id, amount, payment_date, payment_method, transaction_reference, notes, status").eq("business_unit_id", buId),
  ]);
  return {
    invoices: invoicesResult.data || [],
    contracts: contractsResult.data || [],
    tenants: tenantsResult.data || [],
    properties: propertiesResult.data || [],
    units: unitsResult.data || [],
    payments: paymentsResult.error ? [] : paymentsResult.data || [],
  };
}

function one(directory: Awaited<ReturnType<typeof load>>, id: string) {
  const row = directory.invoices.find((invoice: any) => invoice.id === id);
  if (!row) return null;
  return presentInvoices([row], directory.contracts, directory.tenants, directory.properties, directory.units, directory.payments)[0];
}

function storedStatus(row: { due_date: string; total_amount: number; amount_paid: number; balance: number; status?: string }) {
  const status = invoiceStatus(row);
  return status === "Overdue" ? (Number(row.amount_paid) > 0 ? "Partially Paid" : "Unpaid") : status;
}

async function refreshPaid(admin: any, buId: string, invoice: any) {
  const { data } = await admin.from("rent_payments").select("amount, status").eq("business_unit_id", buId).eq("invoice_id", invoice.id);
  const paid = (data || []).filter((payment: any) => payment.status === "Completed").reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const total = Number(invoice.total_amount || 0);
  const balance = Math.round((total - paid) * 100) / 100;
  const status = storedStatus({ due_date: invoice.due_date, total_amount: total, amount_paid: paid, balance });
  const updated = await admin.from("rent_invoices").update({ amount_paid: paid, status, updated_at: new Date().toISOString() }).eq("id", invoice.id).eq("business_unit_id", buId).select(INVOICE_COLUMNS).single();
  return updated;
}

export async function listInvoiceRecords(admin: any, buId: string) {
  const directory = await load(admin, buId);
  return presentInvoices(directory.invoices, directory.contracts, directory.tenants, directory.properties, directory.units, directory.payments);
}

export async function createInvoice(admin: any, buId: string, body: any) {
  const directory = await load(admin, buId);
  const contract = directory.contracts.find((item: any) => item.id === body.contract_id);
  if (!contract) return { error: "Select a contract from this business" };
  if (contract.status === "Terminated" || contract.status === "Ended" || contract.status === "Pending") {
    return { error: "This contract is not eligible for an invoice" };
  }
  const start = String(body.billing_period_start || "").slice(0, 10);
  const end = String(body.billing_period_end || "").slice(0, 10);
  const issue = String(body.issue_date || businessToday()).slice(0, 10);
  const due = String(body.due_date || "").slice(0, 10);
  const rent = money(body.rent_amount);
  const charges = money(body.additional_charges ?? 0);
  const discount = money(body.discount ?? 0);
  if (!start || !end || end < start) return { error: "Billing period end must be on or after the start" };
  if (start < String(contract.start_date).slice(0, 10) || end > String(contract.end_date).slice(0, 10)) {
    return { error: "Billing period is outside the contract dates" };
  }
  if (!due) return { error: "Due date is required" };
  if (rent == null || charges == null || discount == null) return { error: "Amounts must be valid numbers" };
  if (discount > rent + charges) return { error: "Discount cannot exceed the invoice amount" };
  const duplicate = directory.invoices.find((invoice: any) => invoice.contract_id === contract.id && invoice.status !== "Cancelled" && String(invoice.billing_period_start).slice(0, 10) === start && String(invoice.billing_period_end).slice(0, 10) === end);
  if (duplicate) return { error: "An invoice already exists for this contract and billing period" };

  const payload = {
    business_unit_id: buId,
    contract_id: contract.id,
    tenant_id: contract.tenant_id,
    property_id: contract.property_id,
    unit_id: contract.unit_id,
    invoice_number: invoiceNumber(directory.invoices.map((invoice: any) => invoice.invoice_number)),
    billing_period_start: start,
    billing_period_end: end,
    issue_date: issue,
    due_date: due,
    rent_amount: rent,
    additional_charges: charges,
    discount,
    amount_paid: 0,
    status: "Unpaid",
    notes: String(body.notes || "").trim(),
    updated_at: new Date().toISOString(),
  };
  let inserted = await admin.from("rent_invoices").insert(payload).select(INVOICE_COLUMNS).single();
  if (inserted.error && /duplicate|unique/i.test(inserted.error.message || "")) {
    inserted = await admin.from("rent_invoices").insert({ ...payload, invoice_number: invoiceNumber([...directory.invoices.map((invoice: any) => invoice.invoice_number), payload.invoice_number]) }).select(INVOICE_COLUMNS).single();
  }
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Save failed" };
  const refreshed = await refreshPaid(admin, buId, inserted.data);
  const saved = refreshed.data || inserted.data;
  directory.invoices.unshift(saved);
  return { data: one(directory, saved.id) };
}

export async function updateInvoice(admin: any, buId: string, id: string, body: any) {
  const directory = await load(admin, buId);
  const invoice = directory.invoices.find((item: any) => item.id === id);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "Cancelled") return { error: "A cancelled invoice cannot be edited" };
  const notes = body.notes === undefined ? invoice.notes : String(body.notes || "").trim();
  if (Number(invoice.amount_paid) > 0) {
    const updated = await admin.from("rent_invoices").update({ notes, updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId).select(INVOICE_COLUMNS).single();
    if (updated.error) return { error: updated.error.message };
    Object.assign(invoice, updated.data);
    return { data: one(directory, id), notice: "Amounts stay unchanged because payments are already recorded." };
  }
  const rent = money(body.rent_amount ?? invoice.rent_amount);
  const charges = money(body.additional_charges ?? invoice.additional_charges);
  const discount = money(body.discount ?? invoice.discount);
  const start = String(body.billing_period_start || invoice.billing_period_start).slice(0, 10);
  const end = String(body.billing_period_end || invoice.billing_period_end).slice(0, 10);
  const due = String(body.due_date || invoice.due_date).slice(0, 10);
  const issue = String(body.issue_date || invoice.issue_date).slice(0, 10);
  if (!start || !end || end < start) return { error: "Billing period end must be on or after the start" };
  if (rent == null || charges == null || discount == null) return { error: "Amounts must be valid numbers" };
  if (discount > rent + charges) return { error: "Discount cannot exceed the invoice amount" };
  const duplicate = directory.invoices.find((item: any) => item.id !== id && item.contract_id === invoice.contract_id && item.status !== "Cancelled" && String(item.billing_period_start).slice(0, 10) === start && String(item.billing_period_end).slice(0, 10) === end);
  if (duplicate) return { error: "An invoice already exists for this contract and billing period" };
  const updated = await admin.from("rent_invoices").update({
    rent_amount: rent,
    additional_charges: charges,
    discount,
    billing_period_start: start,
    billing_period_end: end,
    due_date: due,
    issue_date: issue,
    notes,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).select(INVOICE_COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Update failed" };
  const refreshed = await refreshPaid(admin, buId, updated.data);
  Object.assign(invoice, refreshed.data || updated.data);
  return { data: one(directory, id) };
}

export async function recordPayment(admin: any, buId: string, invoiceId: string, body: any) {
  const directory = await load(admin, buId);
  const invoice = directory.invoices.find((item: any) => item.id === invoiceId);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "Cancelled") return { error: "A cancelled invoice cannot take a payment" };
  const amount = money(body.amount);
  if (amount == null || amount <= 0) return { error: "Payment amount must be greater than zero" };
  const balance = Number(invoice.balance || 0);
  if (amount > balance + 0.001) return { error: "Payment cannot exceed the outstanding balance" };
  const method = String(body.payment_method || "Cash");
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  const reference = String(body.transaction_reference || "").trim();
  const paymentDate = String(body.payment_date || businessToday()).slice(0, 10);
  if (reference) {
    const same = directory.payments.find((payment: any) => payment.invoice_id === invoiceId && payment.transaction_reference === reference && payment.status === "Completed");
    if (same) return { error: "A payment with this reference is already recorded" };
  }
  const inserted = await admin.from("rent_payments").insert({
    business_unit_id: buId,
    invoice_id: invoice.id,
    contract_id: invoice.contract_id,
    tenant_id: invoice.tenant_id,
    amount,
    payment_date: paymentDate,
    payment_method: method,
    transaction_reference: reference,
    notes: String(body.notes || "").trim(),
    status: "Completed",
    updated_at: new Date().toISOString(),
  }).select("id, invoice_id, amount, payment_date, payment_method, transaction_reference, notes, status").single();
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Payment failed" };
  directory.payments.push(inserted.data);
  const refreshed = await refreshPaid(admin, buId, invoice);
  if (refreshed.error || !refreshed.data) {
    await admin.from("rent_payments").delete().eq("id", inserted.data.id);
    return { error: refreshed.error?.message || "Payment could not be applied" };
  }
  Object.assign(invoice, refreshed.data);
  return { data: one(directory, invoice.id) };
}

export async function cancelInvoice(admin: any, buId: string, id: string) {
  const directory = await load(admin, buId);
  const invoice = directory.invoices.find((item: any) => item.id === id);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "Cancelled") return { error: "This invoice is already cancelled" };
  if (Number(invoice.amount_paid) > 0) return { error: "An invoice with recorded payments cannot be cancelled" };
  const updated = await admin.from("rent_invoices").update({ status: "Cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId).select(INVOICE_COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Cancel failed" };
  Object.assign(invoice, updated.data);
  return { data: one(directory, id) };
}

function periodFor(contract: any, today: string) {
  const frequency = contract.billing_frequency || "Monthly";
  const [year, month] = today.split("-").map(Number);
  const contractStart = String(contract.start_date).slice(0, 10);
  const contractEnd = String(contract.end_date).slice(0, 10);
  let start = `${year}-${String(month).padStart(2, "0")}-01`;
  let endDate = new Date(Date.UTC(year, month, 0));
  if (frequency === "Quarterly") {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    start = `${year}-${String(quarterStart).padStart(2, "0")}-01`;
    endDate = new Date(Date.UTC(year, quarterStart + 2, 0));
  } else if (frequency === "Yearly") {
    start = `${year}-01-01`;
    endDate = new Date(Date.UTC(year, 12, 0));
  }
  let end = endDate.toISOString().slice(0, 10);
  if (start < contractStart) start = contractStart;
  if (end > contractEnd) end = contractEnd;
  if (start > end || today < start) return null;
  const dueDay = Math.min(28, Math.max(1, Number(contract.payment_due_day || 1)));
  const dueMonth = start.slice(0, 7);
  const due = `${dueMonth}-${String(dueDay).padStart(2, "0")}`;
  return { start, end, due: due < start ? start : due };
}

export async function generateDueInvoices(admin: any) {
  const { data: units } = await admin.from("business_units").select("id");
  const today = businessToday();
  const created: string[] = [];
  const skipped: string[] = [];
  for (const unit of units || []) {
    const { data: contracts } = await admin.from("rental_contracts").select("id, rent_amount, billing_frequency, payment_due_day, start_date, end_date, status").eq("business_unit_id", unit.id).eq("status", "Active");
    for (const contract of contracts || []) {
      if (!isCurrentContract(contract, today)) {
        skipped.push(contract.id);
        continue;
      }
      const period = periodFor(contract, today);
      if (!period) {
        skipped.push(contract.id);
        continue;
      }
      const result = await createInvoice(admin, unit.id, {
        contract_id: contract.id,
        billing_period_start: period.start,
        billing_period_end: period.end,
        issue_date: today,
        due_date: period.due,
        rent_amount: Number(contract.rent_amount || 0),
        additional_charges: 0,
        discount: 0,
      });
      if (result.data) created.push(result.data.invoice_number);
      else skipped.push(result.error || contract.id);
    }
  }
  return { created, skipped };
}
