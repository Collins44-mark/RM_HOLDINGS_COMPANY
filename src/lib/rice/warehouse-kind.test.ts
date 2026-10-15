import assert from "node:assert/strict";
import test from "node:test";
import { parseRiceWarehouseKind, riceWarehouseKindSlug } from "./warehouse-kind";

test("warehouse category slugs map to ledger item kinds", () => {
  assert.equal(parseRiceWarehouseKind("paddy"), "PADDY");
  assert.equal(parseRiceWarehouseKind("rice"), "RICE");
  assert.equal(parseRiceWarehouseKind("broken"), "BROKEN");
  assert.equal(parseRiceWarehouseKind("by-products"), "BYPRODUCT");
  assert.equal(parseRiceWarehouseKind("unknown"), null);
});

test("item kinds map back to warehouse routes", () => {
  assert.equal(riceWarehouseKindSlug("PADDY"), "paddy");
  assert.equal(riceWarehouseKindSlug("BYPRODUCT"), "by-products");
});
