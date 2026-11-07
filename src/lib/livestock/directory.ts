import { identityFromUser } from "@/lib/auth/types";
import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveLivestockUnit } from "@/lib/livestock/access";
import { scopeLivestockDirectory, type LivestockAccess } from "@/lib/livestock/scope";
import { movementTotals, onHand, pregnantCount, rentalMonths } from "@/lib/livestock/stock";
import { syncEggSales } from "@/lib/livestock/actions";
import { herdCounts, herdWeight, readEggCount, readEggSale, readHouse, readMeta, type TraitRow } from "@/lib/livestock/traits";

const missing = "Livestock tables are not installed yet. Apply supabase/migrations/20261105_livestock_module.sql and 20261105_livestock_commands.sql.";

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function day(value: unknown) {
  return String(value || "").slice(0, 10);
}

function payStatus(due: number, paid: number, overdue = false) {
  if (due <= 0 && paid <= 0) return "Unpaid";
  if (paid + 0.001 >= due && due > 0) return "Paid";
  if (paid > 0) return overdue ? "Overdue" : "Partially Paid";
  return overdue ? "Overdue" : "Unpaid";
}

export async function listLivestockDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return emptyDirectory("Admin not configured");
  const resolved = await resolveLivestockUnit(user, admin);
  if ("error" in resolved) return emptyDirectory(String(resolved.error));
  return scopeLivestockDirectory(await loadLivestockDirectory(admin, resolved.buId), identityFromUser(user));
}

export async function loadLivestockDirectory(admin: any, buId: string) {
  await syncEggSales(admin, buId);
  await admin.from("ls_animal_types").upsert(
    ["Cattle", "Goats", "Sheep", "Chicken"].map((name) => ({ business_unit_id: buId, name, active: true })),
    { onConflict: "business_unit_id,name", ignoreDuplicates: true },
  );
  const [types, movements, openings, purchases, pregnancies, births, deaths, adjustments, sales, salePayments, houses, rentals, rentalPayments, expenses, expensePayments, audits, eggRows] = await Promise.all([
    admin.from("ls_animal_types").select("*").eq("business_unit_id", buId).order("name"),
    admin.from("ls_movements").select("*").eq("business_unit_id", buId).order("movement_date", { ascending: false }),
    admin.from("ls_openings").select("*").eq("business_unit_id", buId),
    admin.from("ls_purchases").select("*").eq("business_unit_id", buId).order("purchase_date", { ascending: false }),
    admin.from("ls_pregnancies").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("ls_births").select("*").eq("business_unit_id", buId).order("birth_date", { ascending: false }),
    admin.from("ls_deaths").select("*").eq("business_unit_id", buId).order("death_date", { ascending: false }),
    admin.from("ls_adjustments").select("*").eq("business_unit_id", buId).order("adjustment_date", { ascending: false }),
    admin.from("ls_sales").select("*").eq("business_unit_id", buId).order("sale_date", { ascending: false }),
    admin.from("ls_sale_payments").select("*").eq("business_unit_id", buId),
    admin.from("ls_houses").select("*").eq("business_unit_id", buId).order("house_name"),
    admin.from("ls_rentals").select("*").eq("business_unit_id", buId).order("start_date", { ascending: false }),
    admin.from("ls_rental_payments").select("*").eq("business_unit_id", buId),
    admin.from("ls_expenses").select("*").eq("business_unit_id", buId).order("expense_date", { ascending: false }),
    admin.from("ls_expense_payments").select("*").eq("business_unit_id", buId),
    admin.from("audit_logs").select("id, action, description, created_at, actor_name").eq("module", "livestock").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(12),
    admin.from("ls_egg_collections").select("*").eq("business_unit_id", buId).order("collection_date", { ascending: false }),
  ]);
  if (types.error && /does not exist|schema cache/i.test(types.error.message || "")) return emptyDirectory(missing);
  if (types.error) return emptyDirectory(types.error.message);
  const typeName = new Map((types.data || []).map((row: any) => [row.id, row.name]));
  const traitRows = traitSources(openings.data || [], purchases.data || [], births.data || [], deaths.data || [], adjustments.data || [], sales.data || []);
  const today = new Date().toISOString().slice(0, 10);
  const stock = (types.data || []).map((type: any) => {
    const totals = movementTotals(movements.data || [], type.id);
    const current = onHand(movements.data || [], type.id);
    const split = herdCounts(traitRows, type.id);
    const pregnant = pregnantCount(pregnancies.data || [], births.data || [], type.id);
    const last = (movements.data || []).find((row: any) => row.animal_type_id === type.id);
    return {
      id: type.id,
      name: type.name,
      active: type.active,
      current,
      males: split.males,
      females: split.females,
      adults: split.adults,
      young: split.young,
      weight: herdWeight(traitRows, type.id),
      genderUnknown: split.genderUnknown,
      ageUnknown: split.ageUnknown,
      pregnant,
      purchased: totals.purchased,
      born: totals.born,
      sold: totals.sold,
      deaths: totals.deaths,
      opening: totals.opening,
      adjustments: totals.adjustments,
      updated_at: last?.created_at || type.created_at,
    };
  });
  const presentedSales = (sales.data || []).map((sale: any) => {
    const payments = (salePayments.data || []).filter((payment: any) => payment.sale_id === sale.id);
    const received = money(payments.filter((payment: any) => payment.status === "Completed").reduce((sum: number, payment: any) => sum + Number(payment.amount), 0));
    const total = money(sale.total_amount);
    const egg = readEggSale(sale.notes || "");
    return {
      ...sale,
      animal_type: typeName.get(sale.animal_type_id) || "",
      notes: egg ? egg.text : readMeta(sale.notes || "").text,
      weight: readMeta(sale.notes || "").meta?.weight ?? null,
      trays: egg ? egg.trays : null,
      house_id: egg?.houseId || "",
      amount_received: received,
      balance: sale.status === "Cancelled" ? 0 : money(total - received),
      payments,
    };
  });
  const presentedExpenses = (expenses.data || []).map((expense: any) => {
    const payments = (expensePayments.data || []).filter((payment: any) => payment.expense_id === expense.id);
    const paid = money(payments.filter((payment: any) => payment.status === "Completed").reduce((sum: number, payment: any) => sum + Number(payment.amount), 0));
    return {
      ...expense,
      animal_type: typeName.get(expense.animal_type_id) || "",
      house_name: (houses.data || []).find((house: any) => house.id === expense.house_id)?.house_name || "",
      amount_paid: paid,
      balance: expense.status === "Cancelled" ? 0 : money(Number(expense.amount) - paid),
      payments,
    };
  });
  const presentedRentals = (rentals.data || []).map((rental: any) => {
    const payments = (rentalPayments.data || []).filter((payment: any) => payment.rental_id === rental.id && payment.status === "Completed");
    const paid = money(payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0));
    const months = rentalMonths(day(rental.start_date), rental.end_date ? day(rental.end_date) : null, today);
    const due = money(Number(rental.monthly_rent) * months);
    const dayOfMonth = Number(today.slice(8, 10));
    const overdue = due > paid + 0.001 && dayOfMonth > Number(rental.due_day || 1);
    return {
      ...rental,
      house_name: (houses.data || []).find((house: any) => house.id === rental.house_id)?.house_name || "",
      rent_due: due,
      amount_paid: paid,
      balance: money(Math.max(0, due - paid)),
      payment_status: payStatus(due, paid, overdue),
      payments,
    };
  });
  const activeRentals = presentedRentals.filter((rental: any) => rental.status === "Active");
  return {
    error: "",
    types: types.data || [],
    stock,
    movements: (movements.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "", notes: readMeta(row.notes || "").text })),
    openings: openings.data || [],
    purchases: (purchases.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "", weight: readMeta(row.notes || "").meta?.weight ?? null, expense: presentedExpenses.find((expense: any) => expense.purchase_id === row.id) || null })),
    pregnancies: (pregnancies.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "" })),
    births: (births.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "" })),
    deaths: deaths.data || [],
    adjustments: adjustments.data || [],
    sales: presentedSales,
    houses: (houses.data || []).map((house: any) => {
      const current = activeRentals.find((rental: any) => rental.house_id === house.id);
      const stored = readHouse(house.notes || "");
      const ownership = house.ownership === "Company" || stored.ownership === "Company" ? "Company" : "Rental";
      return { ...house, notes: stored.text, ownership, tenant_name: current?.tenant_name || "", rental_id: current?.id || "" };
    }),
    eggs: eggList(eggRows.error ? [] : eggRows.data || [], houses.data || []),
    eggSales: eggSaleList(houses.data || []),
    eggsPerTray: traySetting(houses.data || []),
    rentals: presentedRentals,
    expenses: presentedExpenses,
    activities: audits.error ? [] : audits.data || [],
    access: { herd: true, purchases: true, reproduction: true, movements: true, sales: true, houses: true, expenses: true } satisfies LivestockAccess,
    summary: {
      animals: stock.filter((row: any) => row.active && String(row.name).toLowerCase() !== "eggs").reduce((sum: number, row: any) => sum + row.current, 0),
      types: stock.filter((row: any) => row.active && String(row.name).toLowerCase() !== "eggs").length,
      pregnant: stock.reduce((sum: number, row: any) => sum + row.pregnant, 0),
      houses: (houses.data || []).length,
      company: (houses.data || []).filter((house: any) => house.ownership === "Company" || readHouse(house.notes || "").ownership === "Company").length,
      rented: (houses.data || []).filter((house: any) => house.status === "Rented").length,
      available: (houses.data || []).filter((house: any) => house.status === "Available").length,
      maintenance: (houses.data || []).filter((house: any) => house.status === "Maintenance").length,
      eggTrays: eggList(eggRows.error ? [] : eggRows.data || [], houses.data || []).reduce((sum, egg) => sum + egg.trays, 0),
    },
  } as LivestockDirectory;
}

function traitSources(openings: any[], purchases: any[], births: any[], deaths: any[], adjustments: any[], sales: any[]): TraitRow[] {
  const rows: TraitRow[] = [];
  for (const row of openings) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of purchases) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "in", notes: row.notes || "" });
  for (const row of births) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.offspring, direction: "in", notes: row.notes || "", forceYoung: true });
  for (const row of deaths) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  for (const row of adjustments) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: row.direction === "Decrease" ? "out" : "in", notes: row.notes || "" });
  for (const row of sales) if (row.status !== "Cancelled") rows.push({ animal_type_id: row.animal_type_id, quantity: row.quantity, direction: "out", notes: row.notes || "" });
  return rows;
}

function traySetting(houses: any[]) {
  for (const house of houses) {
    const size = readHouse(house.notes || "").eggsPerTray;
    if (size) return size;
  }
  return 30;
}

function eggsCollected(notes: string, trays: number, per: number) {
  return readEggCount(notes).eggs ?? Math.round(Number(trays || 0) * per);
}

function eggList(tableRows: any[], houses: any[]) {
  const per = traySetting(houses);
  const names = new Map(houses.map((house) => [house.id, house.house_name]));
  const fromTable = tableRows.map((row) => ({
    id: row.id,
    house_id: row.house_id,
    house_name: names.get(row.house_id) || "",
    collection_date: String(row.collection_date || "").slice(0, 10),
    trays: Number(row.trays || 0),
    eggs: eggsCollected(row.notes || "", row.trays, per),
    notes: readEggCount(row.notes || "").text,
  }));
  const seen = new Set(fromTable.map((row) => row.id));
  const fromNotes = houses.flatMap((house) => readHouse(house.notes || "").eggs.map((egg) => ({
    id: egg.id,
    house_id: house.id,
    house_name: house.house_name,
    collection_date: egg.date,
    trays: Number(egg.trays || 0),
    eggs: egg.eggs || eggsCollected("", egg.trays, per),
    notes: egg.notes || "",
  }))).filter((egg) => !seen.has(egg.id));
  return [...fromTable, ...fromNotes].sort((a, b) => b.collection_date.localeCompare(a.collection_date));
}

function eggSaleList(houses: any[]) {
  return houses.flatMap((house) => readHouse(house.notes || "").eggSales.map((sale) => ({
    ...sale,
    house_id: house.id,
    house_name: house.house_name,
    date: String(sale.date || "").slice(0, 10),
  }))).sort((a, b) => b.date.localeCompare(a.date));
}

function emptyDirectory(error: string): LivestockDirectory {
  return {
    error,
    types: [],
    stock: [],
    movements: [],
    openings: [],
    purchases: [],
    pregnancies: [],
    births: [],
    deaths: [],
    adjustments: [],
    sales: [],
    houses: [],
    eggs: [],
    eggSales: [],
    eggsPerTray: 30,
    rentals: [],
    expenses: [],
    activities: [],
    access: { herd: false, purchases: false, reproduction: false, movements: false, sales: false, houses: false, expenses: false },
    summary: { animals: 0, types: 0, pregnant: 0, houses: 0, company: 0, rented: 0, available: 0, maintenance: 0, eggTrays: 0 },
  };
}

export type LivestockDirectory = {
  error: string;
  types: Array<{ id: string; name: string; active: boolean }>;
  stock: Array<{ id: string; name: string; active: boolean; current: number; males: number; females: number; adults: number; young: number; weight: number | null; genderUnknown: number; ageUnknown: number; pregnant: number; purchased: number; born: number; sold: number; deaths: number; opening: number; adjustments: number; updated_at: string }>;
  movements: Array<{ id: string; animal_type_id: string; animal_type: string; movement_date: string; movement_type: string; quantity_in: number; quantity_out: number; notes: string }>;
  openings: unknown[];
  purchases: Array<{ id: string; purchase_code: string; purchase_date: string; animal_type: string; quantity: number; total_cost: number; status: string; weight: number | null }>;
  pregnancies: Array<{ id: string; animal_type: string; animal_type_id: string; quantity: number; pregnancy_date: string | null; expected_date: string | null; status: string }>;
  births: Array<{ id: string; animal_type: string; animal_type_id: string; mothers: number; offspring: number; birth_date: string; status: string }>;
  deaths: unknown[];
  adjustments: unknown[];
  sales: Array<{ id: string; sale_code: string; sale_date: string; animal_type: string; buyer_name: string; quantity: number; total_amount: number; weight: number | null; trays: number | null; house_id: string; amount_received: number; balance: number; status: string; payments: Array<{ id: string; payment_date: string; amount: number; status: string }> }>;
  houses: Array<{ id: string; house_name: string; location: string; capacity: number | null; status: string; ownership: "Company" | "Rental"; monthly_rent: number; notes: string; tenant_name: string; rental_id: string }>;
  eggs: Array<{ id: string; house_id: string; house_name: string; collection_date: string; trays: number; eggs: number; notes: string }>;
  eggSales: Array<{ id: string; house_id: string; house_name: string; date: string; eggs: number; trays: number; buyer: string; unitPrice: number; total: number; paid: number; status: string; notes: string }>;
  eggsPerTray: number;
  rentals: Array<{ id: string; house_id: string; house_name: string; tenant_name: string; start_date: string; status: string; monthly_rent: number; rent_due: number; amount_paid: number; balance: number; payment_status: string; payments: Array<{ id: string; payment_date: string; amount: number; status: string }> }>;
  expenses: Array<{ id: string; expense_code: string; expense_date: string; category: string; description: string; amount: number; amount_paid: number; balance: number; status: string; purchase_id: string | null; animal_type_id: string | null; house_id: string | null; payments: Array<{ payment_date: string; amount: number; status: string }> }>;
  activities: Array<{ id: string; description: string; created_at: string }>;
  access: LivestockAccess;
  summary: { animals: number; types: number; pregnant: number; houses: number; company: number; rented: number; available: number; maintenance: number; eggTrays: number };
};
