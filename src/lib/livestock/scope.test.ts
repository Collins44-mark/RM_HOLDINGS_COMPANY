import assert from "node:assert/strict";
import test from "node:test";
import type { LivestockDirectory } from "./directory";
import { scopeLivestockDirectory } from "./scope";

function directory(): LivestockDirectory {
  return {
    error: "",
    types: [{ id: "cattle", name: "Cattle", active: true }, { id: "chicken", name: "Chicken", active: true }],
    stock: [
      { id: "cattle", name: "Cattle", active: true, current: 100, males: 0, females: 0, adults: 0, young: 0, weight: null, genderUnknown: 100, ageUnknown: 100, pregnant: 0, purchased: 0, born: 0, sold: 0, deaths: 0, opening: 100, adjustments: 0, updated_at: "" },
      { id: "chicken", name: "Chicken", active: true, current: 12, males: 2, females: 10, adults: 12, young: 0, weight: null, genderUnknown: 0, ageUnknown: 0, pregnant: 0, purchased: 0, born: 0, sold: 0, deaths: 0, opening: 12, adjustments: 0, updated_at: "" },
    ],
    movements: [],
    openings: [],
    purchases: [{ id: "p", purchase_code: "PUR-001", purchase_date: "2026-11-07", animal_type: "Cattle", quantity: 1, total_cost: 10, status: "Valid", weight: null }],
    pregnancies: [],
    births: [],
    deaths: [],
    adjustments: [],
    sales: [
      { id: "s1", sale_code: "SALE-001", sale_date: "2026-11-07", animal_type: "Cattle", buyer_name: "Herd buyer", quantity: 1, total_amount: 20, weight: null, trays: null, house_id: "", amount_received: 20, balance: 0, status: "Paid", payments: [] },
      { id: "s2", sale_code: "SALE-002", sale_date: "2026-11-07", animal_type: "Eggs", buyer_name: "Egg buyer", quantity: 30, total_amount: 15, weight: null, trays: 1, house_id: "h", amount_received: 15, balance: 0, status: "Paid", payments: [] },
    ],
    houses: [],
    eggs: [],
    eggSales: [],
    eggsPerTray: 30,
    rentals: [],
    expenses: [{ id: "e", expense_code: "EXP-001", expense_date: "2026-11-07", category: "Feed", description: "Feed", amount: 5, amount_paid: 0, balance: 5, status: "Unpaid", purchase_id: null, animal_type_id: null, house_id: null, payments: [] }],
    activities: [{ id: "a", description: "Recorded a livestock sale.", created_at: "" }],
    access: { herd: true, purchases: true, reproduction: true, movements: true, sales: true, houses: true, expenses: true },
    summary: { animals: 112, types: 2, pregnant: 0, houses: 1, company: 1, rented: 0, available: 0, maintenance: 0, eggTrays: 4 },
  };
}

test("a poultry house role does not receive the cattle sales book or expenses", () => {
  const scoped = scopeLivestockDirectory(directory(), { role: "STAFF", modules: ["livestock"], permissions: ["livestock.houses.manage"] });
  assert.deepEqual(scoped.sales.map((row) => row.animal_type), ["Eggs"]);
  assert.equal(scoped.expenses.length, 0);
  assert.equal(scoped.purchases.length, 0);
  assert.deepEqual(scoped.stock.map((row) => row.name), ["Chicken"]);
  assert.equal(scoped.summary.animals, 12);
  assert.equal(scoped.access.sales, false);
});

test("a sales role keeps the sales book and not the expense book", () => {
  const scoped = scopeLivestockDirectory(directory(), { role: "STAFF", modules: ["livestock"], permissions: ["livestock.sales.manage"] });
  assert.equal(scoped.sales.length, 2);
  assert.equal(scoped.expenses.length, 0);
  assert.equal(scoped.access.sales, true);
});
