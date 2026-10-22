import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseOperationPayload } from "../offline/catalog";
import { setOfflineDispatcher, syncPendingOperations } from "../offline/coordinator";
import {
  bindOfflineSession,
  bindOfflineStore,
  enqueueOperation,
  getConflicts,
  getPendingOperations,
} from "../offline/outbox";
import { createMemoryStore } from "../offline/storage";
import {
  buildPosSaleRpcArgs,
  posCheckoutFallbackAllowed,
  posIdempotencyRpcMissing,
  recoverPosUniqueViolation,
} from "./pos-idempotency";

const MIGRATION = "supabase/migrations/20261022120000_sm_complete_sale_request_id.sql";

function session() {
  bindOfflineSession({ userId: "user-a", authUid: "auth-a" });
}

function posPayload() {
  return {
    requestId: "99999999-9999-4999-8999-999999999999",
    customerName: "Walk-in Customer",
    discount: 0,
    items: [{ productId: "prod-1", quantity: 1, unitPrice: 1000 }],
    payments: [{ method: "CASH", amount: 1000 }],
  };
}

test("the unapplied POS migration is additive, unique, and transactional", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  assert.match(sql, /add column if not exists create_request_id uuid/);
  assert.match(sql, /sm_sales_bu_request_uidx/);
  assert.match(sql, /where create_request_id is not null/);
  assert.match(sql, /p_request_id uuid default null/);
  assert.match(sql, /drop function if exists public\.sm_complete_sale\(jsonb, jsonb, text, numeric, numeric, text\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /when unique_violation then/);
  assert.match(sql, /awaiting explicit approval/i);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /revoke all on function public\.sm_complete_sale\(jsonb, jsonb, text, numeric, numeric, text, uuid\) from public, anon/);
  assert.match(sql, /NOT lossless for sales/i);
  assert.ok(sql.indexOf("if p_request_id is not null") < sql.indexOf("insert into public.sm_sales"));
  assert.ok(sql.indexOf("return v_existing") < sql.indexOf("sm_next_document_number"));
});

test("live checkout without a request id may use the current six-argument RPC", () => {
  const args = buildPosSaleRpcArgs({
    items: [{ productId: "p1", quantity: 1 }],
    payments: [{ method: "CASH", amount: 1 }],
  });
  assert.equal("p_request_id" in args, false);
  assert.equal(posCheckoutFallbackAllowed(false), true);
});

test("a queued POS checkout must not fall back to the non-idempotent RPC", () => {
  const args = buildPosSaleRpcArgs({
    requestId: posPayload().requestId,
    items: [{ productId: "p1", quantity: 2, unitPrice: 500 }],
    payments: [{ method: "CASH", amount: 1000 }],
  });
  assert.equal(args.p_request_id, posPayload().requestId);
  assert.equal(posCheckoutFallbackAllowed(true), false);
  assert.equal(posIdempotencyRpcMissing("Could not find the function public.sm_complete_sale"), true);
});

test("unique_violation recovery returns the original sale and never a new id", () => {
  const first = recoverPosUniqueViolation({ requestId: posPayload().requestId, existingSaleId: "sale-1" });
  assert.equal(first.recovered, true);
  if (first.recovered) {
    assert.equal(first.saleId, "sale-1");
    assert.equal(first.duplicate, true);
  }
  const missing = recoverPosUniqueViolation({ requestId: posPayload().requestId, existingSaleId: null });
  assert.equal(missing.recovered, false);
  const online = recoverPosUniqueViolation({ requestId: null, existingSaleId: "sale-2" });
  assert.equal(online.recovered, false);
});

test("POS catalog payload is accepted and first sync then duplicate replay apply once", async () => {
  bindOfflineStore(createMemoryStore());
  session();
  await enqueueOperation({
    type: "supermarket.complete_sale",
    businessUnitCode: "supermarket",
    payload: posPayload(),
  });
  let applies = 0;
  setOfflineDispatcher(async () => {
    applies += 1;
    return { ok: true, duplicate: applies > 1, result: { id: "sale-1" } };
  });
  await syncPendingOperations();
  await syncPendingOperations();
  assert.equal(applies, 1);
  assert.equal((await getPendingOperations()).length, 0);
});

test("timeout after a committed POS sale recovers as a duplicate on retry", async () => {
  bindOfflineStore(createMemoryStore());
  session();
  await enqueueOperation({
    type: "supermarket.complete_sale",
    businessUnitCode: "supermarket",
    payload: posPayload(),
  });
  let applies = 0;
  setOfflineDispatcher(async () => {
    applies += 1;
    if (applies === 1) return { ok: false, retryable: true, code: "TRANSIENT", error: "timeout" };
    return { ok: true, duplicate: true, result: { id: "sale-1" } };
  });
  await syncPendingOperations();
  assert.equal((await getPendingOperations()).length, 1);
  await syncPendingOperations(Date.now() + 120_000);
  assert.equal(applies, 2);
  assert.equal((await getPendingOperations()).length, 0);
});

test("a failed POS transaction stays queued and does not mark the sale synced", async () => {
  bindOfflineStore(createMemoryStore());
  session();
  await enqueueOperation({
    type: "supermarket.complete_sale",
    businessUnitCode: "supermarket",
    payload: posPayload(),
  });
  setOfflineDispatcher(async () => ({
    ok: false,
    retryable: false,
    code: "VALIDATION",
    error: "Insufficient stock for Rice (available 0, requested 1)",
  }));
  await syncPendingOperations();
  assert.equal((await getPendingOperations()).length, 0);
  assert.equal((await getConflicts())[0]?.status, "failed");
});

test("concurrent coordinator ticks still submit a POS row once", async () => {
  bindOfflineStore(createMemoryStore());
  session();
  await enqueueOperation({
    type: "supermarket.complete_sale",
    businessUnitCode: "supermarket",
    payload: posPayload(),
  });
  let active = 0;
  let max = 0;
  let calls = 0;
  setOfflineDispatcher(async () => {
    active += 1;
    max = Math.max(max, active);
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return { ok: true, duplicate: false };
  });
  await Promise.all([syncPendingOperations(), syncPendingOperations()]);
  assert.equal(max, 1);
  assert.equal(calls, 1);
});

test("malformed POS carts are rejected before they are stored", () => {
  const parsed = parseOperationPayload("supermarket.complete_sale", {
    requestId: "not-a-uuid",
    items: [],
    payments: [],
  });
  assert.equal(parsed.ok, false);
});
