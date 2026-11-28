import assert from "node:assert/strict";
import test from "node:test";
import { farmOpeningWindow, farmSearchNeedle } from "./history-window";

test("farm pages open on the imported history through today", () => {
  const window = farmOpeningWindow({}, new Date(2026, 10, 28));
  assert.equal(window.redirect, true);
  assert.equal(window.period, "custom");
  assert.equal(window.from, "2025-12-01");
  assert.equal(window.to, "2026-11-28");
});

test("an explicit period is left unchanged", () => {
  const window = farmOpeningWindow({ period: "this-month" }, new Date(2026, 10, 28));
  assert.equal(window.redirect, false);
  assert.equal(window.period, "this-month");
  assert.equal(window.from, "");
});

test("search text drops filter wildcards", () => {
  assert.equal(farmSearchNeedle(" FEX-0001 "), "FEX-0001");
  assert.equal(farmSearchNeedle("100%_a,b"), "100 a b");
});
