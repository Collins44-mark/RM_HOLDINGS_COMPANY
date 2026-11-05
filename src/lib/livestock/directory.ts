import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveLivestockUnit } from "@/lib/livestock/access";
import { movementTotals, onHand, pregnantCount, rentalMonths } from "@/lib/livestock/stock";

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
  return loadLivestockDirectory(admin, resolved.buId);
}

export async function loadLivestockDirectory(admin: any, buId: string) {
  await admin.from("ls_animal_types").upsert(
    ["Cattle", "Goats", "Sheep"].map((name) => ({ business_unit_id: buId, name, active: true })),
    { onConflict: "business_unit_id,name", ignoreDuplicates: true },
  );
  const [types, movements, openings, purchases, pregnancies, births, deaths, adjustments, sales, salePayments, houses, rentals, rentalPayments, expenses, expensePayments, audits] = await Promise.all([
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
  ]);
  if (types.error && /does not exist|schema cache/i.test(types.error.message || "")) return emptyDirectory(missing);
  if (types.error) return emptyDirectory(types.error.message);
  const typeName = new Map((types.data || []).map((row: any) => [row.id, row.name]));
  const today = new Date().toISOString().slice(0, 10);
  const stock = (types.data || []).map((type: any) => {
    const totals = movementTotals(movements.data || [], type.id);
    const current = onHand(movements.data || [], type.id);
    const pregnant = pregnantCount(pregnancies.data || [], births.data || [], type.id);
    const last = (movements.data || []).find((row: any) => row.animal_type_id === type.id);
    return {
      id: type.id,
      name: type.name,
      active: type.active,
      current,
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
    return {
      ...sale,
      animal_type: typeName.get(sale.animal_type_id) || "",
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
    movements: (movements.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "" })),
    openings: openings.data || [],
    purchases: (purchases.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "", expense: presentedExpenses.find((expense: any) => expense.purchase_id === row.id) || null })),
    pregnancies: (pregnancies.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "" })),
    births: (births.data || []).map((row: any) => ({ ...row, animal_type: typeName.get(row.animal_type_id) || "" })),
    deaths: deaths.data || [],
    adjustments: adjustments.data || [],
    sales: presentedSales,
    houses: (houses.data || []).map((house: any) => {
      const current = activeRentals.find((rental: any) => rental.house_id === house.id);
      return { ...house, tenant_name: current?.tenant_name || "", rental_id: current?.id || "" };
    }),
    rentals: presentedRentals,
    expenses: presentedExpenses,
    activities: audits.error ? [] : audits.data || [],
    summary: {
      animals: stock.filter((row: any) => row.active).reduce((sum: number, row: any) => sum + row.current, 0),
      types: stock.filter((row: any) => row.active).length,
      pregnant: stock.reduce((sum: number, row: any) => sum + row.pregnant, 0),
      houses: (houses.data || []).length,
      rented: (houses.data || []).filter((house: any) => house.status === "Rented").length,
      available: (houses.data || []).filter((house: any) => house.status === "Available").length,
      maintenance: (houses.data || []).filter((house: any) => house.status === "Maintenance").length,
    },
  } as LivestockDirectory;
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
    rentals: [],
    expenses: [],
    activities: [],
    summary: { animals: 0, types: 0, pregnant: 0, houses: 0, rented: 0, available: 0, maintenance: 0 },
  };
}

export type LivestockDirectory = {
  error: string;
  types: Array<{ id: string; name: string; active: boolean }>;
  stock: Array<{ id: string; name: string; active: boolean; current: number; pregnant: number; purchased: number; born: number; sold: number; deaths: number; opening: number; adjustments: number; updated_at: string }>;
  movements: Array<{ id: string; animal_type_id: string; animal_type: string; movement_date: string; movement_type: string; quantity_in: number; quantity_out: number; notes: string }>;
  openings: unknown[];
  purchases: Array<{ id: string; purchase_code: string; purchase_date: string; animal_type: string; quantity: number; total_cost: number; status: string }>;
  pregnancies: Array<{ id: string; animal_type: string; animal_type_id: string; quantity: number; pregnancy_date: string | null; expected_date: string | null; status: string }>;
  births: Array<{ id: string; animal_type: string; animal_type_id: string; mothers: number; offspring: number; birth_date: string; status: string }>;
  deaths: unknown[];
  adjustments: unknown[];
  sales: Array<{ id: string; sale_code: string; sale_date: string; animal_type: string; buyer_name: string; quantity: number; total_amount: number; amount_received: number; balance: number; status: string; payments: Array<{ id: string; payment_date: string; amount: number; status: string }> }>;
  houses: Array<{ id: string; house_name: string; location: string; capacity: number | null; status: string; monthly_rent: number; notes: string; tenant_name: string; rental_id: string }>;
  rentals: Array<{ id: string; house_id: string; house_name: string; tenant_name: string; start_date: string; status: string; monthly_rent: number; rent_due: number; amount_paid: number; balance: number; payment_status: string; payments: Array<{ id: string; payment_date: string; amount: number; status: string }> }>;
  expenses: Array<{ id: string; expense_code: string; expense_date: string; category: string; description: string; amount: number; amount_paid: number; balance: number; status: string; purchase_id: string | null; animal_type_id: string | null; house_id: string | null; payments: Array<{ payment_date: string; amount: number; status: string }> }>;
  activities: Array<{ id: string; description: string; created_at: string }>;
  summary: { animals: number; types: number; pregnant: number; houses: number; rented: number; available: number; maintenance: number };
};
