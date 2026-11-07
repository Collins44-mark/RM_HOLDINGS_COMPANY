import assert from "node:assert/strict";
import test from "node:test";
import { herdCounts, herdWeight, parseTraits, readEggSale, readHouse, readMeta, rebalanceComposition, traysFor, writeEggSale, writeHouse, writeMeta, type CompositionRow } from "./traits";

test("gender and age are optional until one side is filled", () => {
  const open = parseTraits({ males: "", females: "" }, 5, "in");
  assert.equal("error" in open, false);
  if ("error" in open) return;
  assert.equal(open.genderRecorded, false);
  const bad = parseTraits({ males: "2", females: "1" }, 5, "in");
  assert.deepEqual(bad, { error: "Males and females must add up to 5" });
  const good = parseTraits({ males: "2", females: "3", adults: "4", young: "1", weight_kg: "18.5" }, 5, "in");
  assert.equal("error" in good, false);
});

test("births count as young and keep an optional gender split", () => {
  const birth = parseTraits({ males: "1", females: "2" }, 3, "birth");
  assert.equal("error" in birth, false);
  if ("error" in birth) return;
  assert.equal(birth.young, 3);
  assert.equal(birth.ageRecorded, true);
  const notes = writeMeta("First calves", birth);
  assert.equal(readMeta(notes).text, "First calves");
  assert.equal(readMeta(notes).meta?.females, 2);
});

test("a sale cannot take more recorded males than the herd has", () => {
  const rows = [
    { animal_type_id: "goat", quantity: 4, direction: "in" as const, notes: writeMeta("", { males: 1, females: 3, adults: 4, young: 0, genderRecorded: true, ageRecorded: true, weight: null }) },
  ];
  const stock = herdCounts(rows, "goat");
  const sale = parseTraits({ males: "2", females: "0", adults: "2", young: "0" }, 2, "out", stock);
  assert.deepEqual(sale, { error: "Only 1 male and 3 females are recorded." });
  const openSale = parseTraits({ males: "", females: "", adults: "", young: "" }, 2, "out", stock);
  assert.equal("error" in openSale, false);
  if ("error" in openSale) return;
  assert.equal(openSale.males, 1);
  assert.equal(openSale.females, 1);
  assert.equal(openSale.adults, 2);
  assert.equal(openSale.young, 0);
});

test("editing the herd rewrites males, females, adults, young, and weight", () => {
  const rows: CompositionRow[] = [
    { id: "open", table: "ls_openings", animal_type_id: "cattle", quantity: 10, direction: "in", notes: "bought" },
    { id: "born", table: "ls_births", animal_type_id: "cattle", quantity: 3, direction: "in", notes: "", forceYoung: true },
  ];
  const next = rebalanceComposition(rows, { males: 4, females: 9, adults: 8, young: 5, weight: 240 });
  assert.equal("error" in next, false);
  if ("error" in next) return;
  assert.equal(readMeta(next[0].notes).text, "bought");
  assert.deepEqual(herdCounts(next, "cattle"), { males: 4, females: 9, adults: 8, young: 5, genderUnknown: 0, ageUnknown: 0 });
  assert.equal(herdWeight(next, "cattle"), 240);
  const tooYoung = rebalanceComposition(rows, { males: 4, females: 9, adults: 12, young: 1, weight: null });
  assert.deepEqual(tooYoung, { error: "At least 3 animals are young because they were born on this farm" });
});

test("an egg sale note keeps the house and trays beside the readable note", () => {
  const notes = writeEggSale("Market sale", "house-1", 2, "legacy-1");
  const read = readEggSale(notes);
  assert.equal(read?.text, "Market sale");
  assert.equal(read?.houseId, "house-1");
  assert.equal(read?.trays, 2);
  assert.equal(read?.legacy, "legacy-1");
});

test("company houses keep egg trays beside the readable notes", () => {
  const notes = writeHouse("Near the gate", "Company", [{ id: "1", date: "2026-11-07", trays: 4, eggs: 120, notes: "" }]);
  const house = readHouse(notes);
  assert.equal(house.text, "Near the gate");
  assert.equal(house.ownership, "Company");
  assert.equal(house.eggs[0].trays, 4);
  assert.equal(traysFor(45, 30), 1.5);
  const kept = writeHouse(notes, "Company", house.eggs, { eggsPerTray: 30 });
  assert.equal(readHouse(kept).eggsPerTray, 30);
  assert.equal(readHouse(kept).eggs[0].eggs, 120);
});
