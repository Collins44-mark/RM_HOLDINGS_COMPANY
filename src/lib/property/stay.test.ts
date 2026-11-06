import assert from "node:assert/strict";
import test from "node:test";
import { stayLength } from "./stay";

test("stay length counts whole years and months since arrival", () => {
  assert.equal(stayLength("2023-08-06", "2026-11-06"), "3 years 3 months");
  assert.equal(stayLength("2026-08-06", "2026-11-06"), "3 months");
  assert.equal(stayLength("2026-11-06", "2026-11-06"), "Arrived today");
});
