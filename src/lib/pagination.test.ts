import assert from "node:assert/strict";
import test from "node:test";
import { pageMeta, pageRange, parsePageSize } from "./pagination";

test("page range is stable and zero-based for the database", () => {
  assert.deepEqual(pageRange(1, 10), { page: 1, from: 0, to: 9, pageSize: 10 });
  assert.deepEqual(pageRange(3, 10), { page: 3, from: 20, to: 29, pageSize: 10 });
});

test("page meta reports database totals not the current slice", () => {
  const meta = pageMeta(2, 47, 10);
  assert.equal(meta.page, 2);
  assert.equal(meta.from, 11);
  assert.equal(meta.to, 20);
  assert.equal(meta.total, 47);
  assert.equal(meta.totalPages, 5);
});

test("page size only accepts supported options", () => {
  assert.equal(parsePageSize(20), 20);
  assert.equal(parsePageSize(7), 10);
});
