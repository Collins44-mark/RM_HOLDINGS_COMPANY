import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePurchase, summarizeRiceLedgers, type RiceLedgerPurchase } from "./accounting";

const PADDY = "paddy";
const RICE = "rice";
const RANGE = { from: "2026-10-01", to: "2026-10-31" };

function purchase(partial: Partial<RiceLedgerPurchase> & Pick<RiceLedgerPurchase, "id" | "paid">): RiceLedgerPurchase {
  return {
    occurredOn: "2026-10-10",
    itemId: PADDY,
    qtyKg: 4000,
    total: 18_000_000,
    isActive: true,
    ...partial,
  };
}

const postedPurchase = purchase({ id: "rcp-0001", paid: 8_900_000 });
const receipt = {
  id: "m1",
  itemId: PADDY,
  sourceType: "PURCHASE" as const,
  sourceId: "rcp-0001",
  qtyKg: 4000,
  occurredOn: "2026-10-10",
  isActive: true,
};

function ledger(extra: Parameters<typeof summarizeRiceLedgers>[0] extends infer T ? Partial<T> : never) {
  return summarizeRiceLedgers({
    ...RANGE,
    purchases: [postedPurchase],
    movements: [receipt],
    batches: [],
    millOutputs: [],
    sales: [],
    services: [],
    expenses: [],
    ...extra,
  });
}

test("partial paddy purchase increases inventory and payable without hitting profit", () => {
  const summary = ledger({});
  const posted = reconcilePurchase(postedPurchase);
  assert.equal(posted.total, 18_000_000);
  assert.equal(posted.paid, 8_900_000);
  assert.equal(posted.payable, 9_100_000);
  assert.equal(posted.status, "Partial");
  assert.equal(summary.purchasesTotal, 18_000_000);
  assert.equal(summary.purchasePaid, 8_900_000);
  assert.equal(summary.payables, 9_100_000);
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.qtyKg, 4000);
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.value, 18_000_000);
  assert.equal(summary.netProfit, 0);
  assert.equal(summary.cogs, 0);
});

test("fully paid inventory purchase clears payable and still does not expense the stock", () => {
  const paid = purchase({ id: "rcp-paid", paid: 18_000_000 });
  const summary = ledger({
    purchases: [paid],
    movements: [{ ...receipt, sourceId: "rcp-paid" }],
  });
  assert.equal(reconcilePurchase(paid).status, "Paid");
  assert.equal(summary.payables, 0);
  assert.equal(summary.purchasePaid, 18_000_000);
  assert.equal(summary.inventoryValue, 18_000_000);
  assert.equal(summary.netProfit, 0);
});

test("unpaid inventory purchase records the full supplier payable", () => {
  const unpaid = purchase({ id: "rcp-unpaid", paid: 0 });
  const summary = ledger({
    purchases: [unpaid],
    movements: [{ ...receipt, sourceId: "rcp-unpaid" }],
  });
  assert.equal(reconcilePurchase(unpaid).status, "Unpaid");
  assert.equal(summary.payables, 18_000_000);
  assert.equal(summary.purchasePaid, 0);
  assert.equal(summary.inventoryValue, 18_000_000);
  assert.equal(summary.netProfit, 0);
});

test("duplicate purchase id and refresh of the same stock movement are counted once", () => {
  const summary = ledger({
    purchases: [postedPurchase, postedPurchase],
    movements: [receipt, receipt],
  });
  assert.equal(summary.purchasesTotal, 18_000_000);
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.qtyKg, 4000);
  assert.equal(summary.payables, 9_100_000);
  assert.equal(summary.netProfit, 0);
});

test("duplicate mill output rows for the same batch and item are counted once", () => {
  const summary = ledger({
    batches: [{ id: "mil-1", producedOn: "2026-10-12", wastageKg: 500, isActive: true }],
    millOutputs: [
      { batchId: "mil-1", itemId: RICE, qtyKg: 3500 },
      { batchId: "mil-1", itemId: RICE, qtyKg: 3500 },
    ],
    movements: [
      receipt,
      { id: "in", itemId: PADDY, sourceType: "MILL_IN", sourceId: "mil-1", qtyKg: -4000, occurredOn: "2026-10-12", isActive: true },
      { id: "out", itemId: RICE, sourceType: "MILL_OUT", sourceId: "mil-1", qtyKg: 3500, occurredOn: "2026-10-12", isActive: true },
    ],
  });
  assert.equal(summary.inventory.find((row) => row.itemId === RICE)?.qtyKg, 3500);
  assert.equal(summary.inventory.find((row) => row.itemId === RICE)?.value, 15_750_000);
});

test("inactive or reversed rows are excluded from stock, payables, and profit", () => {
  const summary = ledger({
    purchases: [postedPurchase, { ...postedPurchase, id: "void", isActive: false, paid: 0 }],
    movements: [receipt, { ...receipt, id: "m-void", isActive: false, qtyKg: 4000, sourceId: "void" }],
  });
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.qtyKg, 4000);
  assert.equal(summary.payables, 9_100_000);
});

test("profit after milling and sale recognizes COGS and wastage instead of the original purchase", () => {
  const summary = ledger({
    batches: [{ id: "mil-1", producedOn: "2026-10-12", wastageKg: 500, isActive: true }],
    millOutputs: [{ batchId: "mil-1", itemId: RICE, qtyKg: 3500 }],
    movements: [
      receipt,
      { id: "in", itemId: PADDY, sourceType: "MILL_IN", sourceId: "mil-1", qtyKg: -4000, occurredOn: "2026-10-12", isActive: true },
      { id: "out", itemId: RICE, sourceType: "MILL_OUT", sourceId: "mil-1", qtyKg: 3500, occurredOn: "2026-10-12", isActive: true },
      { id: "sale-m", itemId: RICE, sourceType: "SALE", sourceId: "rsl-1", qtyKg: -1000, occurredOn: "2026-10-20", isActive: true },
    ],
    sales: [
      {
        id: "rsl-1",
        occurredOn: "2026-10-20",
        total: 6_000_000,
        paid: 6_000_000,
        isActive: true,
        lines: [{ itemId: RICE, qtyKg: 1000 }],
      },
    ],
  });
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.qtyKg ?? 0, 0);
  assert.equal(summary.inventory.find((row) => row.itemId === RICE)?.qtyKg, 2500);
  assert.equal(summary.cogs, 4_500_000);
  assert.equal(summary.productionLoss, 2_250_000);
  assert.equal(summary.salesTotal, 6_000_000);
  assert.equal(summary.netProfit, 6_000_000 - 4_500_000 - 2_250_000);
  assert.equal(summary.payables, 9_100_000);
});

test("operating expenses reduce profit; purchases still do not", () => {
  const summary = ledger({
    expenses: [{ occurredOn: "2026-10-15", amount: 200_000, isActive: true }],
    services: [{ occurredOn: "2026-10-16", amount: 50_000, isActive: true }],
  });
  assert.equal(summary.expenses, 200_000);
  assert.equal(summary.serviceIncome, 50_000);
  assert.equal(summary.netProfit, -150_000);
  assert.equal(summary.inventoryValue, 18_000_000);
});

test("overview, purchases, finance, and inventory fields come from the same ledger summary", () => {
  const summary = ledger({});
  assert.equal(summary.inventory.find((row) => row.itemId === PADDY)?.qtyKg, 4000);
  assert.equal(summary.payables, reconcilePurchase(postedPurchase).payable);
  assert.equal(summary.netProfit, 0);
  assert.equal(summary.salesTotal, 0);
});
