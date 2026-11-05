import { nextSerial } from "@/lib/property/serial";
import { EXPENSE_CATEGORIES, HARVEST_QUALITIES, HIVE_STATUSES, HIVE_TYPES, PAYMENT_METHODS, roundKg, roundMoney } from "@/lib/beekeeping/constants";
import { presentDirectory, type BeeDirectory } from "@/lib/beekeeping/directory";

const missing = "Beekeeping tables are not installed yet. Apply supabase/migrations/20261105_beekeeping_module.sql.";

function day(value: unknown) {
  return String(value || "").slice(0, 10);
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return roundMoney(amount);
}

async function loadRaw(admin: any, buId: string): Promise<{ error: string } | { hives: any[]; harvests: any[]; sales: any[]; allocations: any[]; salePayments: any[]; expenses: any[]; expensePayments: any[]; activities: any[] }> {
  const [hives, harvests, sales, allocations, salePayments, expenses, expensePayments] = await Promise.all([
    admin.from("bee_hives").select("*").eq("business_unit_id", buId),
    admin.from("bee_harvests").select("*").eq("business_unit_id", buId),
    admin.from("bee_sales").select("*").eq("business_unit_id", buId),
    admin.from("bee_stock_allocations").select("*").eq("business_unit_id", buId),
    admin.from("bee_sale_payments").select("*").eq("business_unit_id", buId),
    admin.from("bee_expenses").select("*").eq("business_unit_id", buId),
    admin.from("bee_expense_payments").select("*").eq("business_unit_id", buId),
  ]);
  if (hives.error) return { error: /does not exist|schema cache/i.test(hives.error.message) ? missing : hives.error.message };
  return {
    hives: hives.data || [],
    harvests: harvests.data || [],
    sales: sales.data || [],
    allocations: allocations.data || [],
    salePayments: salePayments.data || [],
    expenses: expenses.data || [],
    expensePayments: expensePayments.data || [],
    activities: [] as any[],
  };
}

async function directory(admin: any, buId: string): Promise<{ error: string } | BeeDirectory> {
  const raw = await loadRaw(admin, buId);
  if ("error" in raw) return raw;
  return presentDirectory(raw);
}

function eligibleHive(hive: any) {
  return hive && hive.status !== "Archived" && hive.status !== "Inactive";
}

export async function createHive(admin: any, buId: string, userId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const location = String(body.location || "").trim();
  const hiveType = String(body.hive_type || "");
  const status = String(body.status || "Empty");
  const installed = day(body.installation_date);
  if (!location) return { error: "Location is required" };
  if (!HIVE_TYPES.includes(hiveType as (typeof HIVE_TYPES)[number])) return { error: "Select a hive type" };
  if (!HIVE_STATUSES.includes(status as (typeof HIVE_STATUSES)[number])) return { error: "Select a hive status" };
  if (!installed) return { error: "Installation date is required" };
  const hive_code = nextSerial(current.hives.map((hive) => hive.hive_code), "HIVE", 1);
  const inserted = await admin.from("bee_hives").insert({
    business_unit_id: buId,
    hive_code,
    hive_name: String(body.hive_name || "").trim(),
    location,
    hive_type: hiveType,
    installation_date: installed,
    status,
    notes: String(body.notes || "").trim(),
    created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: inserted.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.hives.find((hive) => hive.id === inserted.data.id), directory: next };
}

export async function updateHive(admin: any, buId: string, id: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.hives.find((hive) => hive.id === id);
  if (!existing) return { error: "Hive not found" };
  if (existing.status === "Archived") return { error: "An archived hive cannot be edited" };
  const location = String(body.location || "").trim();
  const hiveType = String(body.hive_type || "");
  const status = String(body.status || existing.status);
  const installed = day(body.installation_date);
  if (!location) return { error: "Location is required" };
  if (!HIVE_TYPES.includes(hiveType as (typeof HIVE_TYPES)[number])) return { error: "Select a hive type" };
  if (!HIVE_STATUSES.includes(status as (typeof HIVE_STATUSES)[number])) return { error: "Select a hive status" };
  if (!installed) return { error: "Installation date is required" };
  const updated = await admin.from("bee_hives").update({
    hive_name: String(body.hive_name || "").trim(),
    location,
    hive_type: hiveType,
    installation_date: installed,
    status,
    notes: String(body.notes || "").trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.hives.find((hive) => hive.id === id), directory: next, previousStatus: existing.status };
}

export async function archiveHive(admin: any, buId: string, id: string) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.hives.find((hive) => hive.id === id);
  if (!existing) return { error: "Hive not found" };
  const updated = await admin.from("bee_hives").update({ status: "Archived", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.hives.find((hive) => hive.id === id), directory: next };
}

export async function createHarvest(admin: any, buId: string, userId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const hive = current.hives.find((item) => item.id === body.hive_id);
  if (!eligibleHive(hive)) return { error: "Select an eligible beehive" };
  const date = day(body.harvest_date);
  const quantity = Number(body.quantity_kg);
  const quality = String(body.quality || "Not Graded");
  if (!date) return { error: "Harvest date is required" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Honey quantity must be greater than zero" };
  if (!HARVEST_QUALITIES.includes(quality as (typeof HARVEST_QUALITIES)[number])) return { error: "Select a honey quality" };
  const harvest_code = nextSerial(current.harvests.map((harvest) => harvest.harvest_code), "HARV", 1);
  const inserted = await admin.from("bee_harvests").insert({
    business_unit_id: buId,
    hive_id: hive!.id,
    harvest_code,
    harvest_date: date,
    quantity_kg: roundKg(quantity),
    quality,
    status: "Valid",
    notes: String(body.notes || "").trim(),
    created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: inserted.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.harvests.find((harvest) => harvest.id === inserted.data.id), directory: next };
}

export async function updateHarvest(admin: any, buId: string, id: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.harvests.find((harvest) => harvest.id === id);
  if (!existing || existing.status !== "Valid") return { error: "Harvest not found" };
  const quantity = Number(body.quantity_kg);
  const quality = String(body.quality || existing.quality);
  const date = day(body.harvest_date);
  if (!date) return { error: "Harvest date is required" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Honey quantity must be greater than zero" };
  if (roundKg(quantity) + 0.0001 < existing.allocated_kg) return { error: "Quantity cannot drop below honey already sold from this harvest" };
  if (!HARVEST_QUALITIES.includes(quality as (typeof HARVEST_QUALITIES)[number])) return { error: "Select a honey quality" };
  const updated = await admin.from("bee_harvests").update({
    harvest_date: date,
    quantity_kg: roundKg(quantity),
    quality,
    notes: String(body.notes || "").trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).eq("status", "Valid");
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.harvests.find((harvest) => harvest.id === id), directory: next };
}

export async function cancelHarvest(admin: any, buId: string, id: string) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.harvests.find((harvest) => harvest.id === id);
  if (!existing || existing.status !== "Valid") return { error: "Harvest not found" };
  if (existing.allocated_kg > 0) return { error: "This harvest has already been sold. Cancel the sale before changing it." };
  const updated = await admin.from("bee_harvests").update({ status: "Cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.harvests.find((harvest) => harvest.id === id), directory: next };
}

export async function createSale(admin: any, buId: string, userId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const quantity = Number(body.quantity_kg);
  const price = money(body.price_per_kg);
  const date = day(body.sale_date);
  if (!date) return { error: "Sale date is required" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Honey quantity must be greater than zero" };
  if (price == null) return { error: "Price per kg must be a valid amount" };
  if (roundKg(quantity) > current.stock.available + 0.0001) return { error: "Not enough honey stock" };
  const sale_code = nextSerial(current.sales.map((sale) => sale.sale_code), "SALE", 1);
  const created = await admin.rpc("bee_create_sale", {
    p_business_unit_id: buId,
    p_created_by: userId || null,
    p_sale_code: sale_code,
    p_sale_date: date,
    p_quantity_kg: roundKg(quantity),
    p_price_per_kg: price,
    p_customer_name: String(body.customer_name || "").trim(),
    p_phone: String(body.phone || "").trim(),
    p_notes: String(body.notes || "").trim(),
  });
  if (created.error) return { error: created.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  const id = created.data?.id;
  return { data: next.sales.find((sale) => sale.id === id), directory: next };
}

export async function updateSale(admin: any, buId: string, id: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.sales.find((sale) => sale.id === id);
  if (!existing || existing.status === "Cancelled") return { error: "Sale not found" };
  if (existing.amount_received > 0) return { error: "A sale with payments can only be cancelled, not edited" };
  const price = money(body.price_per_kg ?? existing.price_per_kg);
  if (price == null) return { error: "Price per kg must be a valid amount" };
  const updated = await admin.from("bee_sales").update({
    customer_name: String(body.customer_name ?? existing.customer_name).trim(),
    phone: String(body.phone ?? existing.phone).trim(),
    notes: String(body.notes ?? existing.notes).trim(),
    price_per_kg: price,
    total_amount: roundMoney(existing.quantity_kg * price),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.sales.find((sale) => sale.id === id), directory: next };
}

export async function recordSalePayment(admin: any, buId: string, userId: string, saleId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const sale = current.sales.find((item) => item.id === saleId);
  if (!sale || sale.status === "Cancelled") return { error: "Sale not found" };
  const amount = money(body.amount);
  const method = String(body.payment_method || "Cash");
  const date = day(body.payment_date);
  const requestKey = String(body.request_key || "").trim();
  if (!requestKey) return { error: "Payment could not be identified" };
  if (amount == null || amount <= 0) return { error: "Payment amount must be greater than zero" };
  if (amount > sale.balance + 0.001) return { error: "Payment cannot exceed the outstanding balance" };
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  if (!date) return { error: "Payment date is required" };
  const existingKey = await admin.from("bee_sale_payments").select("id, sale_id").eq("request_key", requestKey).maybeSingle();
  if (existingKey.data?.sale_id === saleId) {
    const next = await directory(admin, buId);
    if ("error" in next) return next;
    return { data: next.sales.find((item) => item.id === saleId), directory: next };
  }
  const inserted = await admin.from("bee_sale_payments").insert({
    business_unit_id: buId,
    sale_id: saleId,
    amount,
    payment_date: date,
    payment_method: method,
    transaction_reference: String(body.transaction_reference || "").trim(),
    request_key: requestKey,
    status: "Completed",
    notes: String(body.notes || "").trim(),
    created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: /duplicate|unique/i.test(inserted.error.message) ? "This payment was already recorded" : inserted.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  const saved = next.sales.find((item) => item.id === saleId);
  const received = saved?.amount_received || 0;
  const status = !saved ? "Unpaid" : received <= 0 ? "Unpaid" : received + 0.001 < saved.total_amount ? "Partially Paid" : "Paid";
  await admin.from("bee_sales").update({ status, updated_at: new Date().toISOString() }).eq("id", saleId).eq("business_unit_id", buId);
  const refreshed = await directory(admin, buId);
  if ("error" in refreshed) return refreshed;
  return { data: refreshed.sales.find((item) => item.id === saleId), directory: refreshed, paymentId: inserted.data.id };
}

export async function cancelSale(admin: any, buId: string, id: string) {
  const cancelled = await admin.rpc("bee_cancel_sale", { p_business_unit_id: buId, p_sale_id: id });
  if (cancelled.error) return { error: cancelled.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.sales.find((sale) => sale.id === id), directory: next };
}

export async function createExpense(admin: any, buId: string, userId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const category = String(body.category || "");
  const description = String(body.description || "").trim();
  const amount = money(body.amount);
  const date = day(body.expense_date);
  const hiveId = String(body.hive_id || "").trim();
  if (!EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])) return { error: "Select an expense category" };
  if (!description) return { error: "Description is required" };
  if (amount == null || amount <= 0) return { error: "Amount must be greater than zero" };
  if (!date) return { error: "Expense date is required" };
  if (hiveId && !current.hives.some((hive) => hive.id === hiveId)) return { error: "Select a hive from this business" };
  const expense_code = nextSerial(current.expenses.map((expense) => expense.expense_code), "BEX", 1);
  const inserted = await admin.from("bee_expenses").insert({
    business_unit_id: buId,
    hive_id: hiveId || null,
    expense_code,
    expense_date: date,
    due_date: day(body.due_date) || null,
    category,
    description,
    location: String(body.location || "").trim(),
    vendor_name: String(body.vendor_name || "").trim(),
    amount,
    status: "Unpaid",
    notes: String(body.notes || "").trim(),
    created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: inserted.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.expenses.find((expense) => expense.id === inserted.data.id), directory: next };
}

export async function updateExpense(admin: any, buId: string, id: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.expenses.find((expense) => expense.id === id);
  if (!existing || existing.status === "Cancelled") return { error: "Expense not found" };
  if (existing.amount_paid > 0) return { error: "An expense with payments cannot change its amount" };
  const category = String(body.category || existing.category);
  const description = String(body.description || "").trim();
  const amount = money(body.amount);
  const date = day(body.expense_date);
  const hiveId = String(body.hive_id || "").trim();
  if (!EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])) return { error: "Select an expense category" };
  if (!description) return { error: "Description is required" };
  if (amount == null || amount <= 0) return { error: "Amount must be greater than zero" };
  if (!date) return { error: "Expense date is required" };
  if (hiveId && !current.hives.some((hive) => hive.id === hiveId)) return { error: "Select a hive from this business" };
  const updated = await admin.from("bee_expenses").update({
    hive_id: hiveId || null,
    expense_date: date,
    due_date: day(body.due_date) || null,
    category,
    description,
    location: String(body.location || "").trim(),
    vendor_name: String(body.vendor_name || "").trim(),
    amount,
    notes: String(body.notes || "").trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.expenses.find((expense) => expense.id === id), directory: next };
}

export async function recordExpensePayment(admin: any, buId: string, userId: string, expenseId: string, body: any) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const expense = current.expenses.find((item) => item.id === expenseId);
  if (!expense || expense.status === "Cancelled") return { error: "Expense not found" };
  const amount = money(body.amount);
  const method = String(body.payment_method || "Cash");
  const date = day(body.payment_date);
  const requestKey = String(body.request_key || "").trim();
  if (!requestKey) return { error: "Payment could not be identified" };
  if (amount == null || amount <= 0) return { error: "Payment amount must be greater than zero" };
  if (amount > expense.balance + 0.001) return { error: "Payment cannot exceed the outstanding balance" };
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  if (!date) return { error: "Payment date is required" };
  const existingKey = await admin.from("bee_expense_payments").select("id, expense_id").eq("request_key", requestKey).maybeSingle();
  if (existingKey.data?.expense_id === expenseId) {
    const next = await directory(admin, buId);
    if ("error" in next) return next;
    return { data: next.expenses.find((item) => item.id === expenseId), directory: next };
  }
  const inserted = await admin.from("bee_expense_payments").insert({
    business_unit_id: buId,
    expense_id: expenseId,
    amount,
    payment_date: date,
    payment_method: method,
    transaction_reference: String(body.transaction_reference || "").trim(),
    request_key: requestKey,
    status: "Completed",
    notes: String(body.notes || "").trim(),
    created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: /duplicate|unique/i.test(inserted.error.message) ? "This payment was already recorded" : inserted.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  const saved = next.expenses.find((item) => item.id === expenseId);
  const paid = saved?.amount_paid || 0;
  const status = !saved ? "Unpaid" : paid <= 0 ? "Unpaid" : paid + 0.001 < saved.amount ? "Partially Paid" : "Paid";
  await admin.from("bee_expenses").update({ status, updated_at: new Date().toISOString() }).eq("id", expenseId).eq("business_unit_id", buId);
  const refreshed = await directory(admin, buId);
  if ("error" in refreshed) return refreshed;
  return { data: refreshed.expenses.find((item) => item.id === expenseId), directory: refreshed, paymentId: inserted.data.id };
}

export async function cancelExpense(admin: any, buId: string, id: string) {
  const current = await directory(admin, buId);
  if ("error" in current) return current;
  const existing = current.expenses.find((expense) => expense.id === id);
  if (!existing || existing.status === "Cancelled") return { error: "Expense not found" };
  await admin.from("bee_expense_payments").update({ status: "Reversed" }).eq("expense_id", id).eq("business_unit_id", buId).eq("status", "Completed");
  const updated = await admin.from("bee_expenses").update({ status: "Cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId);
  if (updated.error) return { error: updated.error.message };
  const next = await directory(admin, buId);
  if ("error" in next) return next;
  return { data: next.expenses.find((expense) => expense.id === id), directory: next };
}
