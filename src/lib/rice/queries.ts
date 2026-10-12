import type { RiceContext } from "@/lib/rice/access";
import { isRiceMissingRelation, riceHasPermission, RiceError } from "@/lib/rice/access";
import type {
  RiceCaps,
  RiceExpense,
  RiceFinanceSummary,
  RiceItem,
  RiceMillBatch,
  RiceParty,
  RicePurchase,
  RiceSale,
  RiceServiceIncome,
  RiceStockMovement,
  RiceStorageAccount,
  RiceStorageMovement,
} from "@/lib/rice/types";
import type { AuthUser } from "@/lib/auth/types";

const n = (value: unknown) => Number(value ?? 0) || 0;
const s = (value: unknown) => String(value ?? "");

export function riceCaps(user: AuthUser): RiceCaps {
  return {
    canPurchase: riceHasPermission(user, "rice.purchases.create"),
    canMill: riceHasPermission(user, "rice.milling.create"),
    canWarehouse: riceHasPermission(user, "rice.warehouse.view") || riceHasPermission(user, "rice.stock.view"),
    canAdjust: riceHasPermission(user, "rice.stock.edit") || riceHasPermission(user, "rice.warehouse.edit"),
    canStorage: riceHasPermission(user, "rice.storage.create") || riceHasPermission(user, "rice.warehouse.receive"),
    canSell: riceHasPermission(user, "rice.sales.create"),
    canFinance: riceHasPermission(user, "rice.finance.view") || riceHasPermission(user, "rice.payments.view") || riceHasPermission(user, "rice.payments.create"),
    canExpense: riceHasPermission(user, "rice.expenses.create"),
    canReports: riceHasPermission(user, "rice.reports.view") || riceHasPermission(user, "rice.sales.view"),
    canSettings: riceHasPermission(user, "rice.settings.manage"),
  };
}

export async function loadRiceItems(ctx: RiceContext, includeInactive = false): Promise<RiceItem[]> {
  let query = ctx.supabase
    .from("rice_items")
    .select("id, code, name, kind, sort_order, is_active")
    .eq("business_unit_id", ctx.businessUnitId)
    .order("sort_order")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    if (isRiceMissingRelation(error)) throw new RiceError("Rice mill ledgers are not in the live database yet.", "NOT_CONFIGURED");
    throw new RiceError("Couldn't load rice items.", "DATABASE");
  }
  const { data: stock } = await ctx.supabase
    .from("rice_v_stock")
    .select("item_id, qty_kg")
    .eq("business_unit_id", ctx.businessUnitId);
  const qty = new Map((stock ?? []).map((row) => [s(row.item_id), n(row.qty_kg)]));
  return (data ?? []).map((row) => ({
    id: s(row.id),
    code: s(row.code),
    name: s(row.name),
    kind: row.kind as RiceItem["kind"],
    sortOrder: n(row.sort_order),
    isActive: Boolean(row.is_active),
    qtyKg: qty.get(s(row.id)) ?? 0,
  }));
}

export async function loadRiceParties(ctx: RiceContext): Promise<RiceParty[]> {
  const { data, error } = await ctx.supabase
    .from("rice_parties")
    .select("id, party_number, kind, name, phone")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("name")
    .limit(400);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load parties.", "DATABASE");
  }
  return (data ?? []).map((row) => ({
    id: s(row.id),
    partyNumber: s(row.party_number),
    kind: row.kind as RiceParty["kind"],
    name: s(row.name),
    phone: row.phone ? s(row.phone) : null,
  }));
}

export async function loadRicePurchases(ctx: RiceContext, from: string, to: string): Promise<RicePurchase[]> {
  const { data, error } = await ctx.supabase
    .from("rice_purchases")
    .select("id, purchase_number, occurred_on, bags, qty_kg, unit_price, total_amount, amount_paid, payment_method, payment_reference, notes, rice_parties(name), rice_items(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .limit(300);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load purchases.", "DATABASE");
  }
  return (data ?? []).map((row) => {
    const total = n(row.total_amount);
    const paid = n(row.amount_paid);
    const party = row.rice_parties as { name?: string } | { name?: string }[] | null;
    const item = row.rice_items as { name?: string } | { name?: string }[] | null;
    const partyName = Array.isArray(party) ? party[0]?.name : party?.name;
    const itemName = Array.isArray(item) ? item[0]?.name : item?.name;
    return {
      id: s(row.id),
      number: s(row.purchase_number),
      occurredOn: s(row.occurred_on),
      partyName: s(partyName),
      itemName: s(itemName),
      bags: row.bags == null ? null : n(row.bags),
      qtyKg: n(row.qty_kg),
      unitPrice: n(row.unit_price),
      total,
      paid,
      balance: Math.max(0, total - paid),
      method: row.payment_method ? s(row.payment_method) : null,
      reference: row.payment_reference ? s(row.payment_reference) : null,
      notes: row.notes ? s(row.notes) : null,
    };
  });
}

export async function loadRiceBatches(ctx: RiceContext, from: string, to: string): Promise<RiceMillBatch[]> {
  const { data, error } = await ctx.supabase
    .from("rice_mill_batches")
    .select("id, batch_number, produced_on, machine, shift, input_qty_kg, wastage_kg, processing_cost, notes")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .gte("produced_on", from)
    .lte("produced_on", to)
    .order("produced_on", { ascending: false })
    .limit(200);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load milling batches.", "DATABASE");
  }
  const ids = (data ?? []).map((row) => s(row.id));
  const { data: outputs } = ids.length
    ? await ctx.supabase.from("rice_mill_outputs").select("batch_id, qty_kg, rice_items(id, name)").in("batch_id", ids)
    : { data: [] };
  const byBatch = new Map<string, RiceMillBatch["outputs"]>();
  for (const row of outputs ?? []) {
    const item = row.rice_items as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    const rec = Array.isArray(item) ? item[0] : item;
    const list = byBatch.get(s(row.batch_id)) ?? [];
    list.push({ itemId: s(rec?.id), itemName: s(rec?.name), qtyKg: n(row.qty_kg) });
    byBatch.set(s(row.batch_id), list);
  }
  return (data ?? []).map((row) => ({
    id: s(row.id),
    number: s(row.batch_number),
    producedOn: s(row.produced_on),
    machine: row.machine ? s(row.machine) : null,
    shift: row.shift ? s(row.shift) : null,
    inputQtyKg: n(row.input_qty_kg),
    wastageKg: n(row.wastage_kg),
    processingCost: n(row.processing_cost),
    notes: row.notes ? s(row.notes) : null,
    outputs: byBatch.get(s(row.id)) ?? [],
  }));
}

export async function loadRiceMovements(ctx: RiceContext, limit = 120): Promise<RiceStockMovement[]> {
  const { data, error } = await ctx.supabase
    .from("rice_stock_movements")
    .select("id, occurred_on, source_type, qty_kg, notes, rice_items(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load stock movements.", "DATABASE");
  }
  return (data ?? []).map((row) => {
    const item = row.rice_items as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(item) ? item[0]?.name : item?.name;
    return {
      id: s(row.id),
      occurredOn: s(row.occurred_on),
      itemName: s(name),
      sourceType: s(row.source_type),
      qtyKg: n(row.qty_kg),
      notes: row.notes ? s(row.notes) : null,
    };
  });
}

export async function loadRiceSales(ctx: RiceContext, from: string, to: string): Promise<RiceSale[]> {
  const { data, error } = await ctx.supabase
    .from("rice_sales")
    .select("id, sale_number, occurred_on, total_amount, amount_paid, payment_method, dispatch_on, dispatch_qty_kg, notes, rice_parties(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .limit(200);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load sales.", "DATABASE");
  }
  const ids = (data ?? []).map((row) => s(row.id));
  const { data: lines } = ids.length
    ? await ctx.supabase.from("rice_sale_lines").select("sale_id, qty_kg, unit_price, line_total, rice_items(name)").in("sale_id", ids)
    : { data: [] };
  const bySale = new Map<string, RiceSale["lines"]>();
  for (const row of lines ?? []) {
    const item = row.rice_items as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(item) ? item[0]?.name : item?.name;
    const list = bySale.get(s(row.sale_id)) ?? [];
    list.push({ itemName: s(name), qtyKg: n(row.qty_kg), unitPrice: n(row.unit_price), lineTotal: n(row.line_total) });
    bySale.set(s(row.sale_id), list);
  }
  return (data ?? []).map((row) => {
    const total = n(row.total_amount);
    const paid = n(row.amount_paid);
    const party = row.rice_parties as { name?: string } | { name?: string }[] | null;
    const partyName = Array.isArray(party) ? party[0]?.name : party?.name;
    return {
      id: s(row.id),
      number: s(row.sale_number),
      occurredOn: s(row.occurred_on),
      partyName: s(partyName),
      total,
      paid,
      balance: Math.max(0, total - paid),
      method: row.payment_method ? s(row.payment_method) : null,
      dispatchOn: row.dispatch_on ? s(row.dispatch_on) : null,
      dispatchQtyKg: row.dispatch_qty_kg == null ? null : n(row.dispatch_qty_kg),
      notes: row.notes ? s(row.notes) : null,
      lines: bySale.get(s(row.id)) ?? [],
    };
  });
}

export async function loadRiceStorage(ctx: RiceContext): Promise<{ accounts: RiceStorageAccount[]; movements: RiceStorageMovement[] }> {
  const { data: accounts, error } = await ctx.supabase
    .from("rice_v_storage_balances")
    .select("account_id, account_number, party_id, party_name, phone, qty_kg")
    .eq("business_unit_id", ctx.businessUnitId)
    .order("party_name");
  if (error) {
    if (isRiceMissingRelation(error)) return { accounts: [], movements: [] };
    throw new RiceError("Couldn't load customer storage.", "DATABASE");
  }
  const mappedAccounts = (accounts ?? []).map((row) => ({
    id: s(row.account_id),
    accountNumber: s(row.account_number),
    partyId: s(row.party_id),
    partyName: s(row.party_name),
    phone: row.phone ? s(row.phone) : null,
    qtyKg: n(row.qty_kg),
  }));
  const accountMap = new Map(mappedAccounts.map((row) => [row.id, row]));
  const { data: moves } = await ctx.supabase
    .from("rice_storage_movements")
    .select("id, account_id, occurred_on, movement_type, bags, qty_kg, reference, notes")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("occurred_on", { ascending: false })
    .limit(200);
  return {
    accounts: mappedAccounts,
    movements: (moves ?? []).map((row) => {
      const account = accountMap.get(s(row.account_id));
      return {
        id: s(row.id),
        occurredOn: s(row.occurred_on),
        accountNumber: account?.accountNumber ?? "",
        partyName: account?.partyName ?? "",
        type: row.movement_type as "DEPOSIT" | "RELEASE",
        bags: row.bags == null ? null : n(row.bags),
        qtyKg: n(row.qty_kg),
        reference: row.reference ? s(row.reference) : null,
        notes: row.notes ? s(row.notes) : null,
      };
    }),
  };
}

export async function loadRiceServiceIncome(ctx: RiceContext, from: string, to: string): Promise<RiceServiceIncome[]> {
  const { data, error } = await ctx.supabase
    .from("rice_service_income")
    .select("id, income_number, occurred_on, kind, amount, notes, rice_parties(name)")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .limit(200);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load service income.", "DATABASE");
  }
  return (data ?? []).map((row) => {
    const party = row.rice_parties as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(party) ? party[0]?.name : party?.name;
    return {
      id: s(row.id),
      number: s(row.income_number),
      occurredOn: s(row.occurred_on),
      kind: s(row.kind),
      amount: n(row.amount),
      partyName: name ? s(name) : null,
      notes: row.notes ? s(row.notes) : null,
    };
  });
}

export async function loadRiceExpenses(ctx: RiceContext, from: string, to: string): Promise<RiceExpense[]> {
  const { data, error } = await ctx.supabase
    .from("rice_expenses")
    .select("id, expense_number, occurred_on, kind, amount, notes")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .limit(200);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load expenses.", "DATABASE");
  }
  return (data ?? []).map((row) => ({
    id: s(row.id),
    number: s(row.expense_number),
    occurredOn: s(row.occurred_on),
    kind: s(row.kind),
    amount: n(row.amount),
    notes: row.notes ? s(row.notes) : null,
  }));
}

export function riceFinanceSummary(
  purchases: RicePurchase[],
  sales: RiceSale[],
  services: RiceServiceIncome[],
  expenses: RiceExpense[],
): RiceFinanceSummary {
  const purchasesTotal = purchases.reduce((sum, row) => sum + row.total, 0);
  const purchasePaid = purchases.reduce((sum, row) => sum + row.paid, 0);
  const salesTotal = sales.reduce((sum, row) => sum + row.total, 0);
  const salePaid = sales.reduce((sum, row) => sum + row.paid, 0);
  const serviceIncome = services.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  return {
    purchasesTotal,
    purchasePaid,
    payables: Math.max(0, purchasesTotal - purchasePaid),
    salesTotal,
    salePaid,
    receivables: Math.max(0, salesTotal - salePaid),
    serviceIncome,
    expenses: expenseTotal,
    netProfit: salesTotal + serviceIncome - purchasesTotal - expenseTotal,
  };
}
