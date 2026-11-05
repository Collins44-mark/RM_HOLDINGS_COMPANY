import assert from "node:assert/strict";
import test from "node:test";
import { ALREADY_SAVED, isUniqueConflict, losesToEarlier, writeError } from "./conflict";

test("unique database errors are conflicts", () => {
  assert.equal(isUniqueConflict({ code: "23505", message: "duplicate key value violates unique constraint" }), true);
  assert.equal(isUniqueConflict({ message: "duplicate key value violates unique constraint \"bee_sales_sale_code_key\"" }), true);
  assert.equal(isUniqueConflict({ message: "Not enough honey stock" }), false);
});

test("a unique failure becomes a clear saved message", () => {
  assert.equal(writeError({ code: "23505", message: "duplicate key" }), ALREADY_SAVED);
  assert.equal(writeError({ message: "Select a hive type" }), "Select a hive type");
});

test("the earlier saved row wins when two copies arrive together", () => {
  const first = { id: "a", created_at: "2026-11-05T10:00:00.000Z" };
  const second = { id: "b", created_at: "2026-11-05T10:00:01.000Z" };
  assert.equal(losesToEarlier(second, [first]), true);
  assert.equal(losesToEarlier(first, [second]), false);
});
