import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { roundKg, roundMoney } from "@/lib/beekeeping/constants";
import { resolveBeekeepingUnit } from "@/lib/beekeeping/access";

export type BeeHive = {
  id: string;
  hive_code: string;
  hive_name: string;
  location: string;
  hive_type: string;
  installation_date: string;
  status: string;
  notes: string;
  total_harvested: number;
  harvest_count: number;
  last_harvest: string;
  created_at: string;
};

export type BeeHarvest = {
  id: string;
  harvest_code: string;
  hive_id: string;
  hive_code: string;
  hive_name: string;
  location: string;
  hive_type: string;
  harvest_date: string;
  quantity_kg: number;
  quality: string;
  status: string;
  notes: string;
  allocated_kg: number;
  created_by: string;
  created_at: string;
};

export type BeePayment = {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  transaction_reference: string;
  status: string;
  notes: string;
};

export type BeeAllocation = {
  id: string;
  harvest_id: string;
  harvest_code: string;
  quantity_kg: number;
  status: string;
};

export type BeeSale = {
  id: string;
  sale_code: string;
  sale_date: string;
  customer_name: string;
  phone: string;
  quantity_kg: number;
  price_per_kg: number;
  total_amount: number;
  amount_received: number;
  balance: number;
  status: string;
  notes: string;
  created_at: string;
  payments: BeePayment[];
  allocations: BeeAllocation[];
};

export type BeeExpense = {
  id: string;
  expense_code: string;
  expense_date: string;
  due_date: string;
  category: string;
  description: string;
  location: string;
  hive_id: string;
  hive_code: string;
  vendor_name: string;
  amount: number;
  amount_paid: number;
  balance: number;
  status: string;
  notes: string;
  created_at: string;
  payments: BeePayment[];
};

export type BeeDirectory = {
  hives: BeeHive[];
  harvests: BeeHarvest[];
  sales: BeeSale[];
  expenses: BeeExpense[];
  stock: { harvested: number; sold: number; available: number };
  activities: { id: string; action: string; description: string; created_at: string }[];
};

const empty: BeeDirectory = { hives: [], harvests: [], sales: [], expenses: [], stock: { harvested: 0, sold: 0, available: 0 }, activities: [] };

function day(value: unknown) {
  return String(value || "").slice(0, 10);
}

function paymentStatus(total: number, paid: number, stored: string) {
  if (stored === "Cancelled") return "Cancelled";
  if (paid <= 0) return "Unpaid";
  if (paid + 0.001 < total) return "Partially Paid";
  return "Paid";
}

export function presentDirectory(raw: {
  hives: any[];
  harvests: any[];
  sales: any[];
  allocations: any[];
  salePayments: any[];
  expenses: any[];
  expensePayments: any[];
  activities: any[];
}): BeeDirectory {
  const hiveById = new Map(raw.hives.map((hive) => [hive.id, hive]));
  const harvestById = new Map(raw.harvests.map((harvest) => [harvest.id, harvest]));
  const allocatedByHarvest = new Map<string, number>();
  for (const allocation of raw.allocations) {
    if (allocation.status !== "Active") continue;
    allocatedByHarvest.set(allocation.harvest_id, roundKg((allocatedByHarvest.get(allocation.harvest_id) || 0) + Number(allocation.quantity_kg || 0)));
  }
  const harvests: BeeHarvest[] = raw.harvests.map((harvest) => {
    const hive = hiveById.get(harvest.hive_id);
    return {
      id: harvest.id,
      harvest_code: harvest.harvest_code,
      hive_id: harvest.hive_id,
      hive_code: hive?.hive_code || "",
      hive_name: hive?.hive_name || "",
      location: hive?.location || "",
      hive_type: hive?.hive_type || "",
      harvest_date: day(harvest.harvest_date),
      quantity_kg: Number(harvest.quantity_kg || 0),
      quality: harvest.quality,
      status: harvest.status,
      notes: harvest.notes || "",
      allocated_kg: allocatedByHarvest.get(harvest.id) || 0,
      created_by: harvest.created_by || "",
      created_at: harvest.created_at,
    };
  });
  const byHive = new Map<string, BeeHarvest[]>();
  for (const harvest of harvests) {
    const list = byHive.get(harvest.hive_id) || [];
    list.push(harvest);
    byHive.set(harvest.hive_id, list);
  }
  const hives: BeeHive[] = raw.hives.map((hive) => {
    const rows = (byHive.get(hive.id) || []).filter((harvest) => harvest.status === "Valid");
    const last = [...rows].sort((a, b) => b.harvest_date.localeCompare(a.harvest_date))[0];
    return {
      id: hive.id,
      hive_code: hive.hive_code,
      hive_name: hive.hive_name || "",
      location: hive.location || "",
      hive_type: hive.hive_type,
      installation_date: day(hive.installation_date),
      status: hive.status,
      notes: hive.notes || "",
      total_harvested: roundKg(rows.reduce((sum, harvest) => sum + harvest.quantity_kg, 0)),
      harvest_count: rows.length,
      last_harvest: last?.harvest_date || "",
      created_at: hive.created_at,
    };
  });
  const paymentsBySale = new Map<string, BeePayment[]>();
  for (const payment of raw.salePayments) {
    const list = paymentsBySale.get(payment.sale_id) || [];
    list.push({
      id: payment.id,
      amount: Number(payment.amount || 0),
      payment_date: day(payment.payment_date),
      payment_method: payment.payment_method,
      transaction_reference: payment.transaction_reference || "",
      status: payment.status,
      notes: payment.notes || "",
    });
    paymentsBySale.set(payment.sale_id, list);
  }
  const allocationsBySale = new Map<string, BeeAllocation[]>();
  for (const allocation of raw.allocations) {
    const list = allocationsBySale.get(allocation.sale_id) || [];
    list.push({
      id: allocation.id,
      harvest_id: allocation.harvest_id,
      harvest_code: harvestById.get(allocation.harvest_id)?.harvest_code || "",
      quantity_kg: Number(allocation.quantity_kg || 0),
      status: allocation.status,
    });
    allocationsBySale.set(allocation.sale_id, list);
  }
  const sales: BeeSale[] = raw.sales.map((sale) => {
    const payments = paymentsBySale.get(sale.id) || [];
    const received = roundMoney(payments.filter((payment) => payment.status === "Completed").reduce((sum, payment) => sum + payment.amount, 0));
    const total = Number(sale.total_amount || 0);
    return {
      id: sale.id,
      sale_code: sale.sale_code,
      sale_date: day(sale.sale_date),
      customer_name: sale.customer_name || "",
      phone: sale.phone || "",
      quantity_kg: Number(sale.quantity_kg || 0),
      price_per_kg: Number(sale.price_per_kg || 0),
      total_amount: total,
      amount_received: received,
      balance: sale.status === "Cancelled" ? 0 : roundMoney(Math.max(0, total - received)),
      status: paymentStatus(total, received, sale.status),
      notes: sale.notes || "",
      created_at: sale.created_at,
      payments,
      allocations: allocationsBySale.get(sale.id) || [],
    };
  });
  const expensePayments = new Map<string, BeePayment[]>();
  for (const payment of raw.expensePayments) {
    const list = expensePayments.get(payment.expense_id) || [];
    list.push({
      id: payment.id,
      amount: Number(payment.amount || 0),
      payment_date: day(payment.payment_date),
      payment_method: payment.payment_method,
      transaction_reference: payment.transaction_reference || "",
      status: payment.status,
      notes: payment.notes || "",
    });
    expensePayments.set(payment.expense_id, list);
  }
  const expenses: BeeExpense[] = raw.expenses.map((expense) => {
    const hive = expense.hive_id ? hiveById.get(expense.hive_id) : null;
    const payments = expensePayments.get(expense.id) || [];
    const paid = roundMoney(payments.filter((payment) => payment.status === "Completed").reduce((sum, payment) => sum + payment.amount, 0));
    const amount = Number(expense.amount || 0);
    return {
      id: expense.id,
      expense_code: expense.expense_code,
      expense_date: day(expense.expense_date),
      due_date: day(expense.due_date),
      category: expense.category,
      description: expense.description || "",
      location: expense.location || hive?.location || "",
      hive_id: expense.hive_id || "",
      hive_code: hive?.hive_code || "",
      vendor_name: expense.vendor_name || "",
      amount,
      amount_paid: paid,
      balance: expense.status === "Cancelled" ? 0 : roundMoney(Math.max(0, amount - paid)),
      status: paymentStatus(amount, paid, expense.status),
      notes: expense.notes || "",
      created_at: expense.created_at,
      payments,
    };
  });
  const harvested = roundKg(harvests.filter((harvest) => harvest.status === "Valid").reduce((sum, harvest) => sum + harvest.quantity_kg, 0));
  const sold = roundKg(raw.allocations.filter((allocation) => allocation.status === "Active").reduce((sum, allocation) => sum + Number(allocation.quantity_kg || 0), 0));
  return {
    hives,
    harvests,
    sales,
    expenses,
    stock: { harvested, sold, available: roundKg(Math.max(0, harvested - sold)) },
    activities: raw.activities.map((event) => ({
      id: event.id,
      action: event.action,
      description: event.description,
      created_at: event.created_at,
    })),
  };
}

export async function listBeekeepingDirectory(): Promise<BeeDirectory> {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return empty;
  const resolved = await resolveBeekeepingUnit(user, admin);
  if ("error" in resolved) return empty;
  const buId = resolved.buId;
  const [hives, harvests, sales, allocations, salePayments, expenses, expensePayments, activities] = await Promise.all([
    admin.from("bee_hives").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("bee_harvests").select("*").eq("business_unit_id", buId).order("harvest_date", { ascending: false }),
    admin.from("bee_sales").select("*").eq("business_unit_id", buId).order("sale_date", { ascending: false }),
    admin.from("bee_stock_allocations").select("*").eq("business_unit_id", buId),
    admin.from("bee_sale_payments").select("*").eq("business_unit_id", buId).order("payment_date", { ascending: false }),
    admin.from("bee_expenses").select("*").eq("business_unit_id", buId).order("expense_date", { ascending: false }),
    admin.from("bee_expense_payments").select("*").eq("business_unit_id", buId).order("payment_date", { ascending: false }),
    admin.from("audit_logs").select("id, action, description, created_at").eq("module", "beekeeping").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(8),
  ]);
  if (hives.error) return empty;
  return presentDirectory({
    hives: hives.data || [],
    harvests: harvests.data || [],
    sales: sales.data || [],
    allocations: allocations.data || [],
    salePayments: salePayments.data || [],
    expenses: expenses.data || [],
    expensePayments: expensePayments.data || [],
    activities: activities.data || [],
  });
}
