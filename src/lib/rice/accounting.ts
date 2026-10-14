import type { RiceFinanceSummary, RiceItemKind } from "@/lib/rice/types";

export type RiceLedgerPurchase = {
  id: string;
  occurredOn: string;
  itemId: string;
  qtyKg: number;
  total: number;
  paid: number;
  isActive: boolean;
};

export type RiceLedgerMovement = {
  id: string;
  itemId: string;
  sourceType: "PURCHASE" | "MILL_IN" | "MILL_OUT" | "SALE" | "ADJUST";
  sourceId: string;
  qtyKg: number;
  occurredOn: string;
  isActive: boolean;
};

export type RiceLedgerBatch = {
  id: string;
  producedOn: string;
  wastageKg: number;
  isActive: boolean;
};

export type RiceLedgerMillOutput = {
  batchId: string;
  itemId: string;
  qtyKg: number;
};

export type RiceLedgerSale = {
  id: string;
  occurredOn: string;
  total: number;
  paid: number;
  isActive: boolean;
  lines: { itemId: string; qtyKg: number }[];
};

export type RiceLedgerAmount = {
  occurredOn: string;
  amount: number;
  isActive: boolean;
};

export type RiceInventoryPosition = {
  itemId: string;
  qtyKg: number;
  value: number;
};

export type RiceLedgerSummary = RiceFinanceSummary & {
  cogs: number;
  productionLoss: number;
  inventoryValue: number;
  inventory: RiceInventoryPosition[];
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function wac(qty: number, value: number) {
  if (qty <= 0) return 0;
  return value / qty;
}

function consume(layer: RiceInventoryPosition, qty: number) {
  const take = Math.min(qty, Math.max(layer.qtyKg, 0));
  const cost = money(take * wac(layer.qtyKg, layer.value));
  layer.qtyKg = money(layer.qtyKg - take);
  layer.value = money(Math.max(0, layer.value - cost));
  if (layer.qtyKg <= 0) {
    layer.qtyKg = 0;
    layer.value = 0;
  }
  return cost;
}

function rank(type: RiceLedgerMovement["sourceType"]) {
  if (type === "PURCHASE") return 0;
  if (type === "MILL_IN" || type === "MILL_OUT") return 1;
  if (type === "SALE") return 2;
  return 3;
}

export function reconcilePurchase(purchase: Pick<RiceLedgerPurchase, "total" | "paid">) {
  const total = money(purchase.total);
  const paid = money(Math.max(0, purchase.paid));
  return {
    total,
    paid: Math.min(paid, total),
    payable: money(Math.max(0, total - paid)),
    status: paid <= 0 ? "Unpaid" : paid >= total ? "Paid" : "Partial",
  };
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  const next = new Map<string, T>();
  for (const row of rows) next.set(row.id, row);
  return [...next.values()];
}

function uniqueMillOutputs(rows: RiceLedgerMillOutput[]) {
  const next = new Map<string, RiceLedgerMillOutput>();
  for (const row of rows) next.set(`${row.batchId}:${row.itemId}`, row);
  return [...next.values()];
}

export function summarizeRiceLedgers(input: {
  from: string;
  to: string;
  purchases: RiceLedgerPurchase[];
  movements: RiceLedgerMovement[];
  batches: RiceLedgerBatch[];
  millOutputs: RiceLedgerMillOutput[];
  sales: RiceLedgerSale[];
  services: RiceLedgerAmount[];
  expenses: RiceLedgerAmount[];
}): RiceLedgerSummary {
  const purchases = uniqueById(input.purchases.filter((row) => row.isActive));
  const purchaseById = new Map(purchases.map((row) => [row.id, row]));
  const batches = new Map(input.batches.filter((row) => row.isActive).map((row) => [row.id, row]));
  const outputsByBatch = new Map<string, RiceLedgerMillOutput[]>();
  for (const row of uniqueMillOutputs(input.millOutputs)) {
    const list = outputsByBatch.get(row.batchId) ?? [];
    list.push(row);
    outputsByBatch.set(row.batchId, list);
  }

  const layers = new Map<string, RiceInventoryPosition>();
  function layer(itemId: string) {
    const current = layers.get(itemId) ?? { itemId, qtyKg: 0, value: 0 };
    layers.set(itemId, current);
    return current;
  }

  let cogs = 0;
  let productionLoss = 0;
  const processedMills = new Set<string>();

  const movements = uniqueById(input.movements.filter((row) => row.isActive)).slice()
    .sort((a, b) => {
      const date = a.occurredOn.localeCompare(b.occurredOn);
      if (date) return date;
      return rank(a.sourceType) - rank(b.sourceType) || a.id.localeCompare(b.id);
    });

  function applyMill(batchId: string, on: string) {
    if (processedMills.has(batchId)) return;
    processedMills.add(batchId);
    const ins = movements.filter((row) => row.sourceType === "MILL_IN" && row.sourceId === batchId);
    let inputCost = 0;
    let inputQty = 0;
    for (const row of ins) {
      const qty = Math.abs(row.qtyKg);
      inputQty += qty;
      inputCost += consume(layer(row.itemId), qty);
    }
    const wastageKg = Math.max(0, batches.get(batchId)?.wastageKg ?? 0);
    const outs = outputsByBatch.get(batchId) ?? [];
    const outputQty = outs.reduce((sum, row) => sum + row.qtyKg, 0);
    const lossQty = Math.min(inputQty, wastageKg + Math.max(0, inputQty - wastageKg - outputQty));
    const lossCost = money(lossQty * wac(inputQty, inputCost));
    const remaining = money(Math.max(0, inputCost - lossCost));
    if (inRange(on, input.from, input.to)) productionLoss = money(productionLoss + lossCost);
    if (outputQty > 0) {
      for (const row of outs) {
        const share = remaining * (row.qtyKg / outputQty);
        const item = layer(row.itemId);
        item.qtyKg = money(item.qtyKg + row.qtyKg);
        item.value = money(item.value + share);
      }
    } else if (inRange(on, input.from, input.to)) {
      productionLoss = money(productionLoss + remaining);
    }
  }

  for (const row of movements) {
    if (row.sourceType === "PURCHASE") {
      const purchase = purchaseById.get(row.sourceId);
      const qty = Math.abs(row.qtyKg);
      const item = layer(row.itemId);
      item.qtyKg = money(item.qtyKg + qty);
      item.value = money(item.value + (purchase ? purchase.total : 0));
      continue;
    }
    if (row.sourceType === "MILL_IN" || row.sourceType === "MILL_OUT") {
      applyMill(row.sourceId, row.occurredOn);
      continue;
    }
    if (row.sourceType === "SALE") {
      const qty = Math.abs(row.qtyKg);
      const cost = consume(layer(row.itemId), qty);
      if (inRange(row.occurredOn, input.from, input.to)) cogs = money(cogs + cost);
      continue;
    }
    if (row.qtyKg > 0) {
      const item = layer(row.itemId);
      const addCost = money(row.qtyKg * wac(item.qtyKg, item.value));
      item.qtyKg = money(item.qtyKg + row.qtyKg);
      item.value = money(item.value + addCost);
      continue;
    }
    const qty = Math.abs(row.qtyKg);
    const cost = consume(layer(row.itemId), qty);
    if (inRange(row.occurredOn, input.from, input.to)) productionLoss = money(productionLoss + cost);
  }

  const periodPurchases = purchases.filter((row) => inRange(row.occurredOn, input.from, input.to));
  const purchasesTotal = money(periodPurchases.reduce((sum, row) => sum + row.total, 0));
  const purchasePaid = money(periodPurchases.reduce((sum, row) => sum + Math.min(row.paid, row.total), 0));
  const periodSales = uniqueById(input.sales).filter((row) => row.isActive && inRange(row.occurredOn, input.from, input.to));
  const salesTotal = money(periodSales.reduce((sum, row) => sum + row.total, 0));
  const salePaid = money(periodSales.reduce((sum, row) => sum + Math.min(row.paid, row.total), 0));
  const serviceIncome = money(
    input.services.filter((row) => row.isActive && inRange(row.occurredOn, input.from, input.to)).reduce((sum, row) => sum + row.amount, 0),
  );
  const expenses = money(
    input.expenses.filter((row) => row.isActive && inRange(row.occurredOn, input.from, input.to)).reduce((sum, row) => sum + row.amount, 0),
  );
  const inventory = [...layers.values()].filter((row) => row.qtyKg > 0 || row.value > 0);
  const inventoryValue = money(inventory.reduce((sum, row) => sum + row.value, 0));

  return {
    purchasesTotal,
    purchasePaid,
    payables: money(Math.max(0, purchasesTotal - purchasePaid)),
    salesTotal,
    salePaid,
    receivables: money(Math.max(0, salesTotal - salePaid)),
    serviceIncome,
    expenses,
    cogs,
    productionLoss,
    inventoryValue,
    inventory,
    netProfit: money(salesTotal + serviceIncome - cogs - productionLoss - expenses),
  };
}

export function itemKindQty(items: { kind: RiceItemKind; qtyKg: number }[], kinds: RiceItemKind[]) {
  return items.filter((row) => kinds.includes(row.kind)).reduce((sum, row) => sum + row.qtyKg, 0);
}
