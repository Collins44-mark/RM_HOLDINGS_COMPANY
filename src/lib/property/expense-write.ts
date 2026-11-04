import { PAYMENT_METHODS, businessToday } from "@/lib/property/invoices";
import { nextSerial } from "@/lib/property/serial";
import {
  EXPENSE_CATEGORIES,
  paidOf,
  presentExpenses,
  readExpenseMeta,
  writeExpenseMeta,
  type ExpenseBookingOption,
  type ExpenseMeta,
  type ExpensePayment,
  type PropertyIncome,
} from "@/lib/property/expenses";

const COLUMNS = "id, business_unit_id, property_id, unit_id, expense_category, description, amount, expense_date, payment_method, vendor_name, receipt_reference, notes, recorded_by, created_at, updated_at";

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function dateOf(value: unknown) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
  return date;
}

async function load(admin: any, buId: string) {
  const [expensesResult, propertiesResult, unitsResult, bookingsResult, invoicesResult] = await Promise.all([
    admin.from("property_expenses").select(COLUMNS).eq("business_unit_id", buId).order("expense_date", { ascending: false }),
    admin.from("properties").select("id, name, status, street_address, ward, district, region").eq("business_unit_id", buId).order("name"),
    admin.from("property_units").select("id, property_id, unit_name, unit_code").eq("business_unit_id", buId).order("unit_name"),
    admin.from("hall_bookings").select("id, property_id, booking_number, event_date, amount_paid").eq("business_unit_id", buId).order("event_date", { ascending: false }),
    admin.from("rent_invoices").select("id, property_id").eq("business_unit_id", buId),
  ]);
  const invoices = invoicesResult.data || [];
  const invoiceIds = invoices.map((invoice: any) => invoice.id);
  const paymentsResult = invoiceIds.length
    ? await admin.from("rent_payments").select("invoice_id, amount, status").in("invoice_id", invoiceIds)
    : { data: [] };
  const propertyName = new Map((propertiesResult.data || []).map((property: any) => [property.id, property.name]));
  const bookings: ExpenseBookingOption[] = (bookingsResult.data || []).map((booking: any) => ({
    id: booking.id,
    booking_number: booking.booking_number,
    property_id: booking.property_id,
    hall_name: propertyName.get(booking.property_id) || "",
    event_date: String(booking.event_date || "").slice(0, 10),
    amount_paid: Number(booking.amount_paid || 0),
  }));
  const income = new Map<string, number>();
  const invoiceProperty = new Map<string, string>(invoices.map((invoice: any) => [String(invoice.id), String(invoice.property_id)]));
  for (const payment of paymentsResult.data || []) {
    if (payment.status !== "Completed") continue;
    const propertyId = invoiceProperty.get(payment.invoice_id);
    if (!propertyId) continue;
    income.set(propertyId, (income.get(propertyId) || 0) + Number(payment.amount || 0));
  }
  for (const booking of bookingsResult.data || []) {
    income.set(booking.property_id, (income.get(booking.property_id) || 0) + Number(booking.amount_paid || 0));
  }
  const propertyIncome: PropertyIncome[] = (propertiesResult.data || []).map((property: any) => ({
    id: property.id,
    name: property.name,
    income: Math.round((income.get(property.id) || 0) * 100) / 100,
  }));
  const recorderIds = [...new Set((expensesResult.data || []).map((row: any) => row.recorded_by).filter(Boolean))];
  const profilesResult = recorderIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", recorderIds)
    : { data: [] };
  const names = new Map<string, string>((profilesResult.data || []).map((profile: any) => [profile.id, profile.full_name || ""]));
  return {
    expenses: expensesResult.data || [],
    properties: propertiesResult.data || [],
    units: unitsResult.data || [],
    bookings,
    propertyIncome,
    names,
  };
}

function records(directory: Awaited<ReturnType<typeof load>>) {
  return presentExpenses(directory.expenses, directory.properties, directory.units, directory.bookings, directory.names);
}

function one(directory: Awaited<ReturnType<typeof load>>, id: string) {
  return records(directory).find((expense) => expense.id === id) || null;
}

function links(directory: Awaited<ReturnType<typeof load>>, body: any) {
  const property = directory.properties.find((item: any) => item.id === String(body.property_id || ""));
  if (!property) return { error: "Select a property from this business" };
  const unitId = String(body.unit_id || "");
  if (unitId) {
    const unit = directory.units.find((item: any) => item.id === unitId && item.property_id === property.id);
    if (!unit) return { error: "That unit does not belong to the selected property" };
  }
  const bookingId = String(body.booking_id || "");
  if (bookingId) {
    const booking = directory.bookings.find((item) => item.id === bookingId && item.property_id === property.id);
    if (!booking) return { error: "That hall booking does not belong to the selected property" };
  }
  return { propertyId: property.id, unitId: unitId || null, bookingId };
}

function details(body: any, current?: ExpenseMeta) {
  const title = String(body.title ?? current?.title ?? "").trim();
  const category = String(body.category ?? body.expense_category ?? "");
  const expenseDate = dateOf(body.expense_date ?? "");
  const dueDate = body.due_date ? dateOf(body.due_date) : String(current?.due_date || "");
  if (!title) return { error: "Expense title is required" };
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "Select an expense category" };
  if (!expenseDate) return { error: "Enter a valid expense date" };
  if (body.due_date && !dueDate) return { error: "Enter a valid due date" };
  if (dueDate && dueDate < expenseDate) return { error: "Due date cannot be before the expense date" };
  const amount = money(body.amount);
  if (amount == null || amount <= 0) return { error: "Expense amount must be greater than zero" };
  return {
    title: title.slice(0, 255),
    category,
    detail: String(body.description ?? current?.detail ?? "").trim(),
    expenseDate,
    dueDate,
    amount,
    vendor: String(body.vendor_name ?? "").trim().slice(0, 255),
    reference: String(body.receipt_reference ?? "").trim().slice(0, 100),
  };
}

function paymentFrom(body: any, balance: number) {
  const amount = money(body.amount ?? body.amount_paid);
  if (amount == null || amount <= 0) return { error: "Payment amount must be greater than zero" };
  if (amount > balance + 0.001) return { error: "Payment cannot exceed the outstanding balance" };
  const method = String(body.payment_method || "");
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  const paymentDate = dateOf(body.payment_date || businessToday());
  if (!paymentDate) return { error: "Enter a valid payment date" };
  const reference = String(body.transaction_reference || "").trim().slice(0, 100);
  return {
    payment: {
      id: crypto.randomUUID(),
      payment_date: paymentDate,
      amount,
      payment_method: method,
      transaction_reference: reference,
      notes: String(body.notes || "").trim(),
      status: "Completed",
    } satisfies ExpensePayment,
  };
}

async function namesFor(admin: any, rows: any[]) {
  const ids = [...new Set(rows.map((row) => row.recorded_by).filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from("profiles").select("id, full_name").in("id", ids);
  return new Map<string, string>((data || []).map((profile: any) => [profile.id, profile.full_name || ""]));
}

export async function listExpenseRecords(admin: any, buId: string) {
  const directory = await load(admin, buId);
  return {
    expenses: records(directory),
    properties: directory.properties.map((property: any) => ({
      id: property.id,
      name: property.name,
      status: property.status || "",
      address: [property.street_address, property.ward, property.district, property.region].filter(Boolean).join(", "),
    })),
    units: directory.units.map((unit: any) => ({ id: unit.id, property_id: unit.property_id, name: unit.unit_name || unit.unit_code })),
    bookings: directory.bookings,
    income: directory.propertyIncome,
  };
}

export async function createExpense(admin: any, buId: string, body: any, actorId: string | null): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const linked = links(directory, body);
  if ("error" in linked) return { error: linked.error || "Select a property from this business" };
  const info = details(body);
  if ("error" in info) return { error: info.error || "Check the expense details" };
  const paidNow = money(body.amount_paid ?? 0);
  if (paidNow == null) return { error: "Payment amount must be a valid number" };
  if (paidNow > info.amount) return { error: "Payment cannot exceed the expense amount" };
  const payments: ExpensePayment[] = [];
  if (paidNow > 0) {
    const payment = paymentFrom({ ...body, amount: paidNow }, info.amount);
    if ("error" in payment) return { error: payment.error || "Check the payment" };
    payments.push(payment.payment);
  }
  const number = nextSerial(directory.expenses.map((row: any) => readExpenseMeta(row.notes).expense_number), "EXP", 1);
  const meta: ExpenseMeta = {
    expense_number: number,
    title: info.title,
    due_date: info.dueDate,
    booking_id: linked.bookingId,
    record_status: "Active",
    cancel_reason: "",
    detail: info.detail,
    payments,
  };
  const payload = {
    business_unit_id: buId,
    property_id: linked.propertyId,
    unit_id: linked.unitId,
    expense_category: info.category,
    description: info.title,
    amount: info.amount,
    expense_date: info.expenseDate,
    payment_method: payments[0]?.payment_method || "",
    vendor_name: info.vendor,
    receipt_reference: info.reference,
    notes: writeExpenseMeta(meta),
    recorded_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
  let inserted = await admin.from("property_expenses").insert(payload).select(COLUMNS).single();
  if (inserted.error && actorId) {
    inserted = await admin.from("property_expenses").insert({ ...payload, recorded_by: null }).select(COLUMNS).single();
  }
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Expense could not be saved" };
  directory.expenses = [inserted.data, ...directory.expenses.filter((row: any) => row.id !== inserted.data.id)];
  const twins = directory.expenses.filter((row: any) => readExpenseMeta(row.notes).expense_number.toUpperCase() === number.toUpperCase());
  if (twins.length > 1) {
    const next = nextSerial(directory.expenses.map((row: any) => readExpenseMeta(row.notes).expense_number), "EXP", 1);
    meta.expense_number = next;
    const repaired = await admin.from("property_expenses").update({ notes: writeExpenseMeta(meta), updated_at: new Date().toISOString() }).eq("id", inserted.data.id).eq("business_unit_id", buId).select(COLUMNS).single();
    if (repaired.data) inserted.data = repaired.data;
  }
  directory.names = await namesFor(admin, directory.expenses);
  return { data: one({ ...directory, expenses: directory.expenses.map((row: any) => row.id === inserted.data.id ? inserted.data : row) }, inserted.data.id) };
}

export async function updateExpense(admin: any, buId: string, id: string, body: any): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const row = directory.expenses.find((item: any) => item.id === id);
  if (!row) return { error: "Expense not found" };
  const current = readExpenseMeta(row.notes, row.description || "");
  if (current.record_status === "Cancelled") return { error: "A cancelled expense cannot be edited" };
  const linked = links(directory, body);
  if ("error" in linked) return { error: linked.error || "Select a property from this business" };
  const info = details(body, current);
  if ("error" in info) return { error: info.error || "Check the expense details" };
  const paid = paidOf(current.payments);
  if (paid > 0 && Math.abs(info.amount - Number(row.amount || 0)) > 0.001) return { error: "The amount cannot change after a payment has been recorded" };
  const meta: ExpenseMeta = {
    ...current,
    title: info.title,
    due_date: info.dueDate,
    booking_id: linked.bookingId,
    detail: info.detail,
  };
  const updated = await admin.from("property_expenses").update({
    property_id: linked.propertyId,
    unit_id: linked.unitId,
    expense_category: info.category,
    description: info.title,
    amount: info.amount,
    expense_date: info.expenseDate,
    vendor_name: info.vendor,
    receipt_reference: info.reference,
    notes: writeExpenseMeta(meta),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).eq("notes", row.notes).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: "This expense changed. Refresh and try again." };
  directory.expenses = directory.expenses.map((item: any) => item.id === id ? updated.data : item);
  return { data: one(directory, id) };
}

export async function recordExpensePayment(admin: any, buId: string, id: string, body: any): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const row = directory.expenses.find((item: any) => item.id === id);
  if (!row) return { error: "Expense not found" };
  const current = readExpenseMeta(row.notes, row.description || "");
  if (current.record_status === "Cancelled") return { error: "A cancelled expense cannot take a payment" };
  const balance = Math.round((Number(row.amount || 0) - paidOf(current.payments)) * 100) / 100;
  const payment = paymentFrom(body, balance);
  if ("error" in payment) return { error: payment.error || "Check the payment" };
  const reference = payment.payment.transaction_reference;
  if (reference && current.payments.some((item) => item.status === "Completed" && item.transaction_reference === reference)) {
    return { error: "A payment with this reference is already recorded" };
  }
  const meta: ExpenseMeta = { ...current, payments: [...current.payments, payment.payment] };
  const updated = await admin.from("property_expenses").update({
    notes: writeExpenseMeta(meta),
    payment_method: payment.payment.payment_method,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).eq("notes", row.notes).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: "Payment could not be applied. Refresh and try again." };
  directory.expenses = directory.expenses.map((item: any) => item.id === id ? updated.data : item);
  return { data: one(directory, id) };
}

export async function cancelExpense(admin: any, buId: string, id: string, body: any): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const row = directory.expenses.find((item: any) => item.id === id);
  if (!row) return { error: "Expense not found" };
  const current = readExpenseMeta(row.notes, row.description || "");
  if (current.record_status === "Cancelled") return { error: "This expense is already cancelled" };
  if (paidOf(current.payments) > 0) return { error: "An expense with recorded payments cannot be cancelled" };
  const reason = String(body.reason || "").trim();
  if (!reason) return { error: "A cancellation reason is required" };
  const meta: ExpenseMeta = { ...current, record_status: "Cancelled", cancel_reason: reason };
  const updated = await admin.from("property_expenses").update({
    notes: writeExpenseMeta(meta),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).eq("notes", row.notes).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: "This expense changed. Refresh and try again." };
  directory.expenses = directory.expenses.map((item: any) => item.id === id ? updated.data : item);
  return { data: one(directory, id) };
}
