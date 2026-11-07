import { isUniqueConflict } from "@/lib/data/conflict";
import { nextSerial } from "@/lib/property/serial";
import { herdCounts, parseTraits, readEggCount, readEggSale, readHouse, rebalanceComposition, traysFor, withEggCount, writeEggSale, writeHouse, writeMeta, type CompositionRow, type EggSaleRecord, type HouseEgg, type TraitRow } from "@/lib/livestock/traits";

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
  if (action === "composition") return saveComposition(admin, buId, typeId, body);
  if (action === "opening") {
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.quantity), "in");
    if ("error" in notes) return notes;
    return call(admin, "ls_opening", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_notes: notes.notes });
  }
  if (action === "purchase") {
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.quantity), "in");
    if ("error" in notes) return notes;
    return call(admin, "ls_purchase", {
      p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date),
      p_unit: body.unit_price === "" || body.unit_price == null ? null : Number(body.unit_price),
      p_total: body.total_cost === "" || body.total_cost == null ? null : Number(body.total_cost),
      p_seller: String(body.seller_name || ""), p_notes: notes.notes,
      p_paid: Number(body.amount_paid || 0), p_pay_date: day(body.payment_date) || day(body.date),
      p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || ""),
    });
  }
  if (action === "purchase-cancel") return call(admin, "ls_purchase_cancel", { p_bu: buId, p_id: body.id, p_user: userId || null });
  if (action === "pregnancy") return call(admin, "ls_pregnancy", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date) || null, p_expected: day(body.expected_date) || null, p_notes: String(body.notes || "") });
  if (action === "pregnancy-cancel") return call(admin, "ls_pregnancy_cancel", { p_bu: buId, p_id: body.id });
  if (action === "birth") {
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.offspring), "birth");
    if ("error" in notes) return notes;
    return call(admin, "ls_birth", { p_bu: buId, p_user: userId || null, p_type: typeId, p_mothers: Number(body.mothers), p_offspring: Number(body.offspring), p_date: day(body.date), p_notes: notes.notes });
  }
  if (action === "birth-cancel") return call(admin, "ls_birth_cancel", { p_bu: buId, p_id: body.id, p_user: userId || null });
  if (action === "death") {
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.quantity), "out");
    if ("error" in notes) return notes;
    return call(admin, "ls_death", { p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_reason: String(body.reason || ""), p_notes: notes.notes });
  }
  if (action === "adjustment") {
    const direction = String(body.direction || "");
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.quantity), direction === "Decrease" ? "out" : "in");
    if ("error" in notes) return notes;
    return call(admin, "ls_adjustment", { p_bu: buId, p_user: userId || null, p_type: typeId, p_direction: direction, p_qty: Number(body.quantity), p_date: day(body.date), p_reason: String(body.reason || ""), p_notes: notes.notes });
  }
  if (action === "sale") {
    if (await isEggType(admin, buId, typeId)) return { error: "Sell eggs from the poultry house page" };
    const notes = await traitNotes(admin, buId, typeId, body, Number(body.quantity), "out");
    if ("error" in notes) return notes;
    return call(admin, "ls_sale", {
      p_bu: buId, p_user: userId || null, p_type: typeId, p_qty: Number(body.quantity), p_date: day(body.date), p_unit: Number(body.unit_price),
      p_buyer: String(body.buyer_name || ""), p_notes: notes.notes, p_paid: Number(body.amount_paid || 0),
      p_pay_date: day(body.payment_date) || day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || ""),
    });
  }
  if (action === "sale-payment") return call(admin, "ls_sale_pay", { p_bu: buId, p_user: userId || null, p_sale: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "sale-cancel") return cancelSale(admin, buId, userId, String(body.id || ""));
  if (action === "expense-payment") return call(admin, "ls_expense_pay", { p_bu: buId, p_user: userId || null, p_expense: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "rental-payment") return call(admin, "ls_rental_pay", { p_bu: buId, p_user: userId || null, p_rental: body.id, p_amount: Number(body.amount), p_date: day(body.date), p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") });
  if (action === "house") return saveHouse(admin, buId, userId, body);
  if (action === "house-update") return updateHouse(admin, buId, body);
  if (action === "rental-start") return startRental(admin, buId, userId, body);
  if (action === "rental-end") return endRental(admin, buId, body);
  if (action === "eggs") return saveEggs(admin, buId, userId, body);
  if (action === "egg-sale") return saveEggSale(admin, buId, userId, body);
  if (action === "egg-sale-pay") return payEggSale(admin, buId, userId, body);
  if (action === "egg-sale-cancel") return cancelEggSale(admin, buId, String(body.id || ""));
  if (action === "egg-rule") return saveEggRule(admin, buId, body);
  if (action === "expense") return saveExpense(admin, buId, userId, body);
  if (action === "expense-cancel") return cancelExpense(admin, buId, String(body.id || ""));
  return { error: "Unknown livestock action" };
}

async function saveHouse(admin: any, buId: string, userId: string, body: any) {
  const name = String(body.house_name || "").trim();
  const ownership = body.ownership === "Company" ? "Company" : "Rental";
  const status = String(body.status || (ownership === "Company" ? "Active" : "Available"));
  if (!name) return { error: "House name is required" };
  if (ownership === "Company" && !["Active", "Maintenance"].includes(status)) return { error: "Select a house status" };
  if (ownership === "Rental" && !["Available", "Maintenance"].includes(status)) return { error: "Select a house status" };
  const rent = ownership === "Company" ? 0 : Number(body.monthly_rent || 0);
  if (!Number.isFinite(rent) || rent < 0) return { error: "Monthly rent must be a valid amount" };
  const inserted = await admin.from("ls_houses").insert({
    business_unit_id: buId, house_name: name, location: String(body.location || "").trim(),
    capacity: body.capacity === "" || body.capacity == null ? null : Number(body.capacity),
    status, monthly_rent: rent, notes: writeHouse(String(body.notes || ""), ownership, []), created_by: userId || null,
  }).select("id").single();
  if (inserted.error) return { error: isUniqueConflict(inserted.error) ? "A poultry house with this name already exists" : message(inserted.error) };
  await rememberOwnership(admin, inserted.data.id, ownership);
  return { id: inserted.data.id };
}

async function updateHouse(admin: any, buId: string, body: any) {
  const existing = await admin.from("ls_houses").select("id, status, notes").eq("id", body.id).eq("business_unit_id", buId).maybeSingle();
  if (!existing.data) return { error: "Poultry house not found" };
  const previous = readHouse(existing.data.notes || "");
  const ownership = body.ownership === "Company" ? "Company" : body.ownership === "Rental" ? "Rental" : previous.ownership;
  if (existing.data.status === "Rented" && ownership === "Company") return { error: "End the rental before this house can belong to the company" };
  const status = String(body.status || existing.data.status);
  if (existing.data.status === "Rented" && status !== "Rented") return { error: "End the rental before changing this house" };
  if (status === "Rented") return { error: "Assign a tenant to rent this house" };
  if (ownership === "Company" && !["Active", "Maintenance"].includes(status)) return { error: "Select a house status" };
  if (ownership === "Rental" && !["Available", "Maintenance"].includes(status)) return { error: "Select a house status" };
  const updated = await admin.from("ls_houses").update({
    location: String(body.location || "").trim(),
    capacity: body.capacity === "" || body.capacity == null ? null : Number(body.capacity),
    status, monthly_rent: ownership === "Company" ? 0 : Number(body.monthly_rent || 0),
    notes: writeHouse(String(body.notes || ""), ownership, previous.eggs), updated_at: new Date().toISOString(),
  }).eq("id", body.id).eq("business_unit_id", buId);
  if (updated.error) return { error: message(updated.error) };
  await rememberOwnership(admin, body.id, ownership);
  return { id: body.id };
}

async function nextCode(admin: any, buId: string, prefix: string, table: string, field: string) {
  const existing = await admin.from(table).select(field).eq("business_unit_id", buId);
  return nextSerial((existing.data || []).map((row: any) => row[field]), prefix, 1);
}

async function startRental(admin: any, buId: string, userId: string, body: any) {
  const house = await admin.from("ls_houses").select("id, status, monthly_rent, notes").eq("id", body.house_id).eq("business_unit_id", buId).maybeSingle();
  if (!house.data) return { error: "Poultry house not found" };
  if (await isCompanyHouse(admin, house.data)) return { error: "A house owned by the company is not rented out" };
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

const CATEGORIES = ["Livestock Purchase", "Animal Feeds", "Veterinary Services", "Vaccination", "Breeding & Reproduction", "Labour", "Transportation", "Farm Maintenance", "Water Supply", "Poultry House Maintenance", "Poultry Eggs", "Other"];

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

async function saveComposition(admin: any, buId: string, typeId: string, body: any) {
  if (!typeId) return { error: "Select an animal type" };
  const males = count(body.males);
  const females = count(body.females);
  const adults = count(body.adults);
  const young = count(body.young);
  if (males == null || females == null || adults == null || young == null) return { error: "Males, females, adults, and young must be whole numbers" };
  const weight = body.weight_kg == null || String(body.weight_kg).trim() === "" ? null : Number(body.weight_kg);
  if (weight != null && (!Number.isFinite(weight) || weight < 0)) return { error: "Weight must be a valid number of kilograms" };
  const rows = await compositionRows(admin, buId, typeId);
  const next = rebalanceComposition(rows, { males, females, adults, young, weight: weight == null ? null : Math.round(weight * 100) / 100 });
  if ("error" in next) return next;
  for (const row of next) {
    const updated = await admin.from(row.table).update({ notes: row.notes }).eq("id", row.id).eq("business_unit_id", buId);
    if (updated.error) return { error: message(updated.error) };
  }
  return { id: typeId };
}

function count(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

async function compositionRows(admin: any, buId: string, typeId: string): Promise<CompositionRow[]> {
  const loaded = await Promise.all([
    admin.from("ls_openings").select("id, animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_purchases").select("id, animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_births").select("id, animal_type_id, offspring, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_deaths").select("id, animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_adjustments").select("id, animal_type_id, quantity, direction, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_sales").select("id, animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
  ]);
  const [openings, purchases, births, deaths, adjustments, sales] = loaded;
  const rows: CompositionRow[] = [];
  for (const row of openings.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_openings", animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of purchases.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_purchases", animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of births.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_births", animal_type_id: row.animal_type_id, quantity: row.offspring, direction: "in", notes: row.notes || "", forceYoung: true });
  for (const row of deaths.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_deaths", animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  for (const row of adjustments.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_adjustments", animal_type_id: row.animal_type_id, quantity: row.quantity, direction: row.direction === "Decrease" ? "out" : "in", notes: row.notes || "" });
  for (const row of sales.data || []) if (row.status !== "Cancelled") rows.push({ id: row.id, table: "ls_sales", animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  return rows;
}

async function traitNotes(admin: any, buId: string, typeId: string, body: any, quantity: number, mode: "in" | "out" | "birth") {
  if (!typeId) return { error: "Select an animal type" };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "Quantity must be greater than zero" };
  const stock = herdCounts(await traitRows(admin, buId, typeId), typeId);
  const parsed = parseTraits(body, quantity, mode, mode === "out" ? stock : undefined);
  if ("error" in parsed) return parsed;
  return { notes: writeMeta(String(body.notes || ""), parsed) };
}

async function traitRows(admin: any, buId: string, typeId: string): Promise<TraitRow[]> {
  const [openings, purchases, births, deaths, adjustments, sales] = await Promise.all([
    admin.from("ls_openings").select("animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_purchases").select("animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_births").select("animal_type_id, offspring, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_deaths").select("animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_adjustments").select("animal_type_id, quantity, direction, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
    admin.from("ls_sales").select("animal_type_id, quantity, notes, status").eq("business_unit_id", buId).eq("animal_type_id", typeId),
  ]);
  const rows: TraitRow[] = [];
  for (const row of openings.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of purchases.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of births.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.offspring, direction: "in", notes: row.notes || "", forceYoung: true });
  for (const row of deaths.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  for (const row of adjustments.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: row.direction === "Decrease" ? "out" : "in", notes: row.notes || "" });
  for (const row of sales.data || []) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  return rows;
}

async function rememberOwnership(admin: any, id: string, ownership: "Company" | "Rental") {
  const updated = await admin.from("ls_houses").update({ ownership }).eq("id", id);
  if (updated.error && !/ownership|schema cache|column/i.test(updated.error.message || "")) return updated.error;
  return null;
}

async function isCompanyHouse(admin: any, house: { id: string; notes?: string }) {
  if (readHouse(house.notes || "").ownership === "Company") return true;
  const column = await admin.from("ls_houses").select("ownership").eq("id", house.id).maybeSingle();
  return !column.error && column.data?.ownership === "Company";
}

async function chickensOnHand(admin: any, buId: string) {
  const types = await admin.from("ls_animal_types").select("id, name").eq("business_unit_id", buId);
  const chicken = (types.data || []).find((type: { name?: string }) => String(type.name || "").toLowerCase() === "chicken");
  if (!chicken) return { error: "Chicken is not on this farm yet" };
  const counts = herdCounts(await traitRows(admin, buId, chicken.id), chicken.id);
  return { id: chicken.id as string, current: counts.males + counts.females + counts.genderUnknown };
}

async function traySize(admin: any, buId: string) {
  const houses = await admin.from("ls_houses").select("notes").eq("business_unit_id", buId);
  for (const house of houses.data || []) {
    const size = readHouse(house.notes || "").eggsPerTray;
    if (size) return size;
  }
  return 30;
}

async function saveEggRule(admin: any, buId: string, body: any) {
  const size = Number(body.eggs_per_tray);
  if (!Number.isInteger(size) || size <= 0) return { error: "Eggs per tray must be a whole number greater than zero" };
  const houses = await admin.from("ls_houses").select("id, notes").eq("business_unit_id", buId);
  if (!houses.data?.length) return { error: "Add a poultry house before setting how many eggs make one tray" };
  for (const house of houses.data) {
    const previous = readHouse(house.notes || "");
    const saved = await admin.from("ls_houses").update({
      notes: writeHouse(house.notes || "", previous.ownership, previous.eggs, { eggSales: previous.eggSales, eggsPerTray: size }),
      updated_at: new Date().toISOString(),
    }).eq("id", house.id).eq("business_unit_id", buId);
    if (saved.error) return { error: message(saved.error) };
  }
  return { id: buId };
}

async function saveEggs(admin: any, buId: string, userId: string, body: any) {
  const flock = await chickensOnHand(admin, buId);
  if ("error" in flock) return flock;
  if (flock.current <= 0) return { error: "Record eggs from chickens that are on hand. Add chickens in Livestock Management first." };
  const house = await admin.from("ls_houses").select("id, notes").eq("id", body.house_id).eq("business_unit_id", buId).maybeSingle();
  if (!house.data) return { error: "Poultry house not found" };
  if (!(await isCompanyHouse(admin, house.data))) return { error: "Record eggs on a house owned by the company" };
  const date = day(body.date);
  const eggs = Number(body.eggs);
  if (!date) return { error: "Collection date is required" };
  if (!Number.isInteger(eggs) || eggs <= 0) return { error: "Number of eggs must be a whole number greater than zero" };
  const trays = traysFor(eggs, await traySize(admin, buId));
  const eggNotes = withEggCount(String(body.notes || "").trim(), eggs);
  const inserted = await admin.from("ls_egg_collections").insert({
    business_unit_id: buId, house_id: house.data.id, collection_date: date, trays, notes: eggNotes, created_by: userId || null,
  }).select("id").single();
  if (!inserted.error) return { id: inserted.data.id };
  if (!/does not exist|schema cache|ls_egg_collections/i.test(inserted.error.message || "")) return { error: message(inserted.error) };
  const previous = readHouse(house.data.notes || "");
  const egg: HouseEgg = { id: crypto.randomUUID(), date, trays, eggs, notes: readEggCount(eggNotes).text };
  const saved = await admin.from("ls_houses").update({
    notes: writeHouse(house.data.notes || "", "Company", [...previous.eggs, egg]), updated_at: new Date().toISOString(),
  }).eq("id", house.data.id);
  if (saved.error) return { error: message(saved.error) };
  return { id: egg.id };
}

async function eggBooks(admin: any, buId: string) {
  await syncEggSales(admin, buId);
  const houses = await admin.from("ls_houses").select("id, notes, house_name").eq("business_unit_id", buId);
  const rows = houses.data || [];
  const collections = await admin.from("ls_egg_collections").select("id, house_id, trays, notes, collection_date").eq("business_unit_id", buId);
  const posted = await admin.from("ls_sales").select("quantity, notes, status").eq("business_unit_id", buId);
  const per = await traySize(admin, buId);
  let collected = 0;
  if (!collections.error) {
    for (const row of collections.data || []) {
      const counted = readEggCount(row.notes || "").eggs;
      collected += counted ?? Math.round(Number(row.trays || 0) * per);
    }
  }
  const postedLegacy = new Set<string>();
  let sold = 0;
  for (const sale of posted.data || []) {
    const egg = readEggSale(sale.notes || "");
    if (!egg) continue;
    if (egg.legacy) postedLegacy.add(egg.legacy);
    if (sale.status !== "Cancelled") sold += Number(sale.quantity || 0);
  }
  for (const house of rows) {
    const stored = readHouse(house.notes || "");
    if (collections.error) collected += stored.eggs.reduce((sum, egg) => sum + (egg.eggs || Math.round(egg.trays * per)), 0);
    sold += stored.eggSales.filter((sale) => sale.status !== "Cancelled" && !postedLegacy.has(sale.id)).reduce((sum, sale) => sum + Number(sale.eggs || 0), 0);
  }
  return { houses: rows, collected, sold, per };
}

async function isEggType(admin: any, buId: string, typeId: string) {
  if (!typeId) return false;
  const type = await admin.from("ls_animal_types").select("name").eq("id", typeId).eq("business_unit_id", buId).maybeSingle();
  return String(type.data?.name || "").toLowerCase() === "eggs";
}

async function eggTypeId(admin: any, buId: string) {
  const existing = await admin.from("ls_animal_types").select("id").eq("business_unit_id", buId).eq("name", "Eggs").maybeSingle();
  if (existing.data?.id) return existing.data.id as string;
  const inserted = await admin.from("ls_animal_types").insert({ business_unit_id: buId, name: "Eggs", active: false }).select("id").single();
  return inserted.data?.id as string || "";
}

async function postEggSale(admin: any, buId: string, userId: string | null, sale: { houseId: string; date: string; eggs: number; trays: number; buyer: string; unitPrice: number; total: number; paid: number; notes: string; legacy?: string; requestKey?: string }) {
  const typeId = await eggTypeId(admin, buId);
  if (!typeId) return { error: "Eggs could not be added to sales" };
  const code = await admin.rpc("ls_next_code", { p_bu: buId, p_prefix: "SALE" });
  if (code.error || !code.data) return { error: message(code.error) };
  const status = sale.paid <= 0 ? "Unpaid" : sale.paid + 0.001 < sale.total ? "Partially Paid" : "Paid";
  const inserted = await admin.from("ls_sales").insert({
    business_unit_id: buId,
    animal_type_id: typeId,
    sale_code: code.data,
    quantity: sale.eggs,
    sale_date: sale.date,
    unit_price: sale.unitPrice,
    total_amount: sale.total,
    buyer_name: sale.buyer,
    notes: writeEggSale(sale.notes, sale.houseId, sale.trays, sale.legacy || ""),
    status,
    created_by: userId,
  }).select("id").single();
  if (inserted.error) return { error: message(inserted.error) };
  if (sale.paid > 0) {
    const payment = await admin.from("ls_sale_payments").insert({
      business_unit_id: buId,
      sale_id: inserted.data.id,
      amount: sale.paid,
      payment_date: sale.date,
      payment_method: "Cash",
      request_key: sale.requestKey || `egg:${sale.legacy || inserted.data.id}`,
      status: "Completed",
      created_by: userId,
    });
    if (payment.error && !isUniqueConflict(payment.error)) return { error: message(payment.error) };
  }
  return { id: inserted.data.id as string };
}

export async function syncEggSales(admin: any, buId: string) {
  const houses = await admin.from("ls_houses").select("id, notes").eq("business_unit_id", buId);
  const sales = await admin.from("ls_sales").select("notes").eq("business_unit_id", buId);
  if (houses.error || sales.error) return;
  const posted = new Set((sales.data || []).map((row: { notes?: string }) => readEggSale(row.notes || "")?.legacy).filter(Boolean));
  for (const house of houses.data || []) {
    const stored = readHouse(house.notes || "");
    const pending = stored.eggSales.filter((sale) => sale.status !== "Cancelled" && !posted.has(sale.id));
    const moved = new Set<string>();
    for (const sale of pending) {
      const date = String(sale.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(Number(sale.eggs)) || Number(sale.eggs) <= 0) continue;
      const saved = await postEggSale(admin, buId, null, {
        houseId: house.id,
        date: String(sale.date || "").slice(0, 10),
        eggs: Number(sale.eggs || 0),
        trays: Number(sale.trays || 0),
        buyer: sale.buyer || "",
        unitPrice: Number(sale.unitPrice || 0),
        total: Number(sale.total || 0),
        paid: Number(sale.paid || 0),
        notes: sale.notes || "",
        legacy: sale.id,
        requestKey: `egg:${sale.id}`,
      });
      if ("id" in saved) {
        posted.add(sale.id);
        moved.add(sale.id);
      }
    }
    const remaining = stored.eggSales.filter((sale) => sale.status !== "Cancelled" && !posted.has(sale.id) && !moved.has(sale.id));
    if (remaining.length === stored.eggSales.length) continue;
    await admin.from("ls_houses").update({
      notes: writeHouse(house.notes || "", stored.ownership, stored.eggs, { eggSales: remaining, eggsPerTray: stored.eggsPerTray }),
      updated_at: new Date().toISOString(),
    }).eq("id", house.id);
  }
}

async function saveEggSale(admin: any, buId: string, userId: string, body: any) {
  const house = await admin.from("ls_houses").select("id, notes").eq("id", body.house_id).eq("business_unit_id", buId).maybeSingle();
  if (!house.data) return { error: "Poultry house not found" };
  if (!(await isCompanyHouse(admin, house.data))) return { error: "Sell eggs from a house owned by the company" };
  const date = day(body.date);
  const eggs = Number(body.eggs);
  const price = Number(body.unit_price);
  const paid = Number(body.amount_paid || 0);
  if (!date) return { error: "Sale date is required" };
  if (!Number.isInteger(eggs) || eggs <= 0) return { error: "Eggs sold must be a whole number greater than zero" };
  if (!Number.isFinite(price) || price < 0) return { error: "Unit price must be a valid amount" };
  const books = await eggBooks(admin, buId);
  if (eggs > books.collected - books.sold) return { error: `Only ${books.collected - books.sold} eggs are available to sell` };
  const total = Math.round(eggs * price * 100) / 100;
  if (!Number.isFinite(paid) || paid < 0 || paid > total + 0.001) return { error: "Payment cannot exceed the sale total" };
  return postEggSale(admin, buId, userId || null, {
    houseId: house.data.id,
    date,
    eggs,
    trays: traysFor(eggs, books.per),
    buyer: String(body.buyer_name || "").trim(),
    unitPrice: price,
    total,
    paid,
    notes: String(body.notes || "").trim(),
    requestKey: String(body.request_key || "") || crypto.randomUUID(),
  });
}

async function cancelSale(admin: any, buId: string, userId: string, id: string) {
  const sale = await admin.from("ls_sales").select("id, notes, status").eq("id", id).eq("business_unit_id", buId).maybeSingle();
  if (sale.data && readEggSale(sale.data.notes || "")) return cancelPostedEggSale(admin, sale.data);
  return call(admin, "ls_sale_cancel", { p_bu: buId, p_id: id, p_user: userId || null });
}

async function cancelPostedEggSale(admin: any, sale: { id: string; status: string }) {
  if (sale.status === "Cancelled") return { error: "This sale is already cancelled" };
  const updated = await admin.from("ls_sales").update({ status: "Cancelled" }).eq("id", sale.id);
  if (updated.error) return { error: message(updated.error) };
  await admin.from("ls_sale_payments").update({ status: "Reversed" }).eq("sale_id", sale.id).eq("status", "Completed");
  return { id: sale.id };
}

async function payEggSale(admin: any, buId: string, userId: string, body: any) {
  const id = String(body.id || "");
  const sale = await admin.from("ls_sales").select("id, notes, status").eq("id", id).eq("business_unit_id", buId).maybeSingle();
  if (sale.data && readEggSale(sale.data.notes || "")) {
    return call(admin, "ls_sale_pay", {
      p_bu: buId, p_user: userId || null, p_sale: id, p_amount: Number(body.amount), p_date: day(body.date),
      p_method: String(body.payment_method || "Cash"), p_request: String(body.request_key || "") || crypto.randomUUID(),
    });
  }
  return { error: "Egg sale not found" };
}

async function cancelEggSale(admin: any, buId: string, id: string) {
  const sale = await admin.from("ls_sales").select("id, notes, status").eq("id", id).eq("business_unit_id", buId).maybeSingle();
  if (!sale.data || !readEggSale(sale.data.notes || "")) return { error: "Egg sale not found" };
  return cancelPostedEggSale(admin, sale.data);
}
