import { isUniqueConflict } from "@/lib/data/conflict";
import { nextSerial } from "@/lib/property/serial";

function day(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function message(error: { message?: string } | null) {
  const text = String(error?.message || "Save failed").replace(/^.*ERROR:\s*/i, "").split("\n")[0];
  if (isUniqueConflict(error)) return "This record was already saved. Refresh the list before entering it again.";
  return text || "Save failed";
}

async function call(admin: any, fn: string, args: Record<string, unknown>) {
  const result = await admin.rpc(fn, args);
  if (result.error) return { error: message(result.error) };
  return { id: result.data as string };
}

export async function runLivestockAction(admin: any, buId: string, userId: string, body: any) {
  const action = String(body.action || "");
  const typeId = String(body.animal_type_id || "");
  if (action === "type") {
    const name = String(body.name || "").trim();
    if (!name) return { error: "Animal type name is required" };
    const inserted = await admin.from("ls_animal_types").insert({ business_unit_id: buId, name, active: true }).select("id, name").single();
    if (inserted.error) return { error: isUniqueConflict(inserted.error) ? "That animal type already exists" : message(inserted.error) };
    return { id: inserted.data.id, name: inserted.data.name };
  }
  if (action === "opening") return call(admin, "ls_opening", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_notes: String(body.notes || "") });
  if (action === "purchase") {
    return call(admin, "ls_purchase", {
      p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date),
      p_unit: body.unit_price === "" || body.unit_price == null ? null : Number(body.unit_price),
      p_total: body.total_cost === "" || body.total_cost == null ? null : Number(body.total_cost),
      p_seller: String(body.seller_name || ""), p_notes: String(body.notes || ""),
      p_paid: Number(body.amount_paid || 0), p_pay_date: day(body.payment_date) || day(body.date),
      p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || ""),
    });
  }
  if (action === "purchase-cancel") return call(admin, "ls_purchase_cancel", { p_bu: buId, p_id: body.id, p_user: userId || null });
  if (action === "pregnancy") return call(admin, "ls_pregnancy", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date) || null, p_expected: day(body.expected_date) || null, p_notes: String(body.notes || "") });
  if (action === "pregnancy-cancel") return call(admin, "ls_pregnancy_cancel", { p_bu: buId, p_id: body.id });
  if (action === "birth") return call(admin, "ls_birth", { p_bu: buId, p_user: userId || null, p_type: typeId, p_mothers: Number(body.mothers), p_offspring: Number(body.offspring), p_date: day(body.date), p_notes: String(body.notes || "") });
  if (action === "birth-cancel") return call(admin, "ls_birth_cancel", { p_bu: buId, p_id: body.id, p_user: userId || null });
  if (action === "death") return call(admin, "ls_death", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_reason: String(body.reason || ""), p_notes: String(body.notes || "") });
  if (action === "adjustment") return call(admin, "ls_adjustment", { p_bu: buId, p_user: userId || null, p_type: typeId, p_direction: String(body.direction || ""), p_qty: Number(body.quantity), p_date: day(body.date), p_reason: String(body.reason || ""), p_notes: String(body.notes || "") });
  if (action === "sale") {
    return call(admin, "ls_sale", {
      p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_unit: Number(body.unit_price),
      p_buyer: String(body.buyer_name || ""), p_notes: String(body.notes || ""), p_paid: Number(body.amount_paid || 0),
      p_pay_date: day(body.payment_date) || day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || ""),
    });
  }
  if (action === "sale-payment") return call(admin, "ls_sale_pay", { p_bu: buId, p_user: userId || null, p_sale: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "sale-cancel") return call(admin, "ls_sale_cancel", { p_bu: buId, p_id: body.id, p_user: userId || null });
  if (action === "expense-payment") return call(admin, "ls_expense_pay", { p_bu: buId, p_user: userId || null, p_expense: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "rental-payment") return call(admin, "ls_rental_pay", { p_bu: buId, p_user: userId || null, p_rental: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "house") return saveHouse(admin, buId, userId, body);
  if (action === "house-update") return updateHouse(admin, buId, body);
  if (action === "rental-start") return startRental(admin, buId, userId, body);
  if (action === "rental-end") return endRental(admin, buId, body);
  if (action === "expense") return saveExpense(admin, buId, userId, body);
  if (action === "expense-cancel") return cancelExpense(admin, buId, String(body.id || ""));
  return { error: "Unknown livestock action" };
}

async function saveHouse(admin: any, buId: string, userId: string, body: any) {
  const name = String(body.house_name || "").trim();
  const status = String(body.status || "Available");
  if (!name) return { error: "House name is required" };
  if (!["Available", "Maintenance"].includes(status)) return { error: "Select a house status" };
  const rent = Number(body.monthly_rent || 0);
  if (!Number.isFinite(rent) || rent < 0) return { error: "Monthly rent must be a valid amount" };
  const inserted = await admin.from("ls_houses").insert({
    business_unit_id: buId, house_name: name, location: String(body.location || "").trim(),
    capacity: body.capacity === "" || body.capacity == null ? null : Number(body.capacity),
    status, monthly_rent: rent, notes: String(body.notes || "").trim(), created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: isUniqueConflict(inserted.error) ? "A poultry house with this name already exists" : message(inserted.error) };
  return { id: inserted.data.id };
}

async function updateHouse(admin: any, buId: string, body: any) {
  const existing = await admin.from("ls_houses").select("id, status").eq("id", body.id).eq("business_unit_id", buId).maybeSingle();
  if (!existing.data) return { error: "Poultry house not found" };
  const status = String(body.status || existing.data.status);
  if (existing.data.status === "Rented" && status !== "Rented") return { error: "End the rental before changing this house" };
  if (status === "Rented") return { error: "Assign a tenant to rent this house" };
  const updated = await admin.from("ls_houses").update({
    location: String(body.location || "").trim(),
    capacity: body.capacity === "" || body.capacity == null ? null : Number(body.capacity),
    status, monthly_rent: Number(body.monthly_rent || 0), notes: String(body.notes || "").trim(), updated_at: new Date().toISOString(),
  }).eq("id", body.id).eq("business_unit_id", buId);
  if (updated.error) return { error: message(updated.error) };
  return { id: body.id };
}

async function nextCode(admin: any, buId: string, prefix: string, table: string, field: string) {
  const existing = await admin.from(table).select(field).eq("business_unit_id", buId);
  return nextSerial((existing.data || []).map((row: any) => row[field]), prefix, 1);
}

async function startRental(admin: any, buId: string, userId: string, body: any) {
  const house = await admin.from("ls_houses").select("id, status, monthly_rent").eq("id", body.house_id).eq("business_unit_id", buId).maybeSingle();
  if (!house.data) return { error: "Poultry house not found" };
  if (house.data.status === "Maintenance") return { error: "A house under maintenance cannot be rented" };
  if (house.data.status === "Rented") return { error: "This house already has an active rental" };
  const tenant = String(body.tenant_name || "").trim();
  const start = day(body.start_date);
  if (!tenant || !start) return { error: "Tenant and start date are required" };
  const rent = Number(body.monthly_rent ?? house.data.monthly_rent);
  if (!Number.isFinite(rent) || rent < 0) return { error: "Monthly rent must be a valid amount" };
  const due = Number(body.due_day || 1);
  if (!Number.isInteger(due) || due < 1 || due > 28) return { error: "Due day must be between 1 and 28" };
  const inserted = await admin.from("ls_rentals").insert({
    business_unit_id: buId, house_id: house.data.id, rental_code: await nextCode(admin, buId, "RNT", "ls_rentals", "rental_code"),
    tenant_name: tenant, tenant_phone: String(body.tenant_phone || "").trim(), start_date: start, end_date: day(body.end_date) || null,
    monthly_rent: rent, due_day: due, notes: String(body.notes || "").trim(), status: "Active", created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: isUniqueConflict(inserted.error) ? "This house already has an active rental" : message(inserted.error) };
  await admin.from("ls_houses").update({ status: "Rented", monthly_rent: rent, updated_at: new Date().toISOString() }).eq("id", house.data.id);
  return { id: inserted.data.id };
}

async function endRental(admin: any, buId: string, body: any) {
  const rental = await admin.from("ls_rentals").select("id, house_id, status").eq("id", body.id).eq("business_unit_id", buId).maybeSingle();
  if (!rental.data || rental.data.status !== "Active") return { error: "Active rental not found" };
  const end = day(body.end_date) || new Date().toISOString().slice(0, 10);
  const updated = await admin.from("ls_rentals").update({ status: "Ended", end_date: end }).eq("id", rental.data.id).eq("status", "Active");
  if (updated.error) return { error: message(updated.error) };
  await admin.from("ls_houses").update({ status: "Available", updated_at: new Date().toISOString() }).eq("id", rental.data.house_id).eq("business_unit_id", buId);
  return { id: rental.data.id };
}

const CATEGORIES = ["Livestock Purchase", "Animal Feeds", "Veterinary Services", "Vaccination", "Breeding & Reproduction", "Labour", "Transportation", "Farm Maintenance", "Water Supply", "Poultry House Maintenance", "Other"];

async function saveExpense(admin: any, buId: string, userId: string, body: any) {
  const category = String(body.category || "");
  const description = String(body.description || "").trim();
  const date = day(body.date);
  const amount = Number(body.amount);
  if (!CATEGORIES.includes(category) || category === "Livestock Purchase") return { error: "Select an expense category. Livestock purchases are recorded from Purchases." };
  if (!description || !date) return { error: "Description and date are required" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be greater than zero" };
  const inserted = await admin.from("ls_expenses").insert({
    business_unit_id: buId, expense_code: await nextCode(admin, buId, "EXP", "ls_expenses", "expense_code"), expense_date: date, category, description, amount,
    animal_type_id: body.animal_type_id || null, house_id: body.house_id || null, vendor_name: String(body.vendor_name || "").trim(),
    due_date: day(body.due_date) || null, notes: String(body.notes || "").trim(), created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: isUniqueConflict(inserted.error) ? "This expense was already saved" : message(inserted.error) };
  return { id: inserted.data.id };
}

async function cancelExpense(admin: any, buId: string, id: string) {
  const expense = await admin.from("ls_expenses").select("id, purchase_id, status").eq("id", id).eq("business_unit_id", buId).maybeSingle();
  if (!expense.data) return { error: "Expense not found" };
  if (expense.data.purchase_id) return { error: "Cancel the livestock purchase to reverse this expense" };
  if (expense.data.status === "Cancelled") return { error: "This expense is already cancelled" };
  await admin.from("ls_expense_payments").update({ status: "Reversed" }).eq("expense_id", id).eq("status", "Completed");
  const updated = await admin.from("ls_expenses").update({ status: "Cancelled" }).eq("id", id);
  if (updated.error) return { error: message(updated.error) };
  return { id };
}

export const LIVESTOCK_EXPENSE_CATEGORIES = CATEGORIES;
