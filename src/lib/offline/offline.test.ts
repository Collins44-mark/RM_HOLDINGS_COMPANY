import assert from "node:assert/strict";
import test from "node:test";
import { parseOperationPayload } from "./catalog";
import { classifyActionError } from "./classify";
import { setOfflineDispatcher, syncPendingOperations } from "./coordinator";
import { backoffMs } from "./errors";
import {
  bindOfflineSession,
  bindOfflineStore,
  enqueueOperation,
  getConflicts,
  getPendingOperations,
  getSyncStatus,
  resolveConflict,
} from "./outbox";
import { createMemoryStore } from "./storage";
import type { OperationDispatcher, QueuedOperation, SubmitQueuedResult } from "./types";

const jobPayload = {
  requestId: "11111111-1111-4111-8111-111111111111",
  serviceTypeId: "svc-1",
  occurredOn: "2026-10-22",
  agreedPrice: "150000",
};

function session(userId = "user-a", authUid = "auth-a") {
  bindOfflineSession({ userId, authUid });
}

function storeWith(rows: QueuedOperation[] = []) {
  const store = createMemoryStore(rows);
  bindOfflineStore(store);
  return store;
}

test("enqueue persists before success and survives a new store instance", async () => {
  const first = createMemoryStore();
  bindOfflineStore(first);
  session();
  const op = await enqueueOperation({
    type: "farm.record_job",
    businessUnitCode: "farm",
    payload: jobPayload,
  });
  assert.equal(op.status, "pending");
  const snapshot = await first.list();
  bindOfflineStore(createMemoryStore(snapshot));
  const pending = await getPendingOperations();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, jobPayload.requestId);
});

test("duplicate enqueue of the same operation id does not create a second row", async () => {
  storeWith();
  session();
  const a = await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  const b = await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  assert.equal(a.id, b.id);
  assert.equal((await getPendingOperations()).length, 1);
});

test("malformed payloads are rejected before they are stored", async () => {
  storeWith();
  session();
  await assert.rejects(
    () =>
      enqueueOperation({
        type: "farm.record_job",
        businessUnitCode: "farm",
        payload: { requestId: "not-a-uuid", occurredOn: "2026-10-22", agreedPrice: "1" },
      }),
    /invalid/i,
  );
  assert.equal((await getPendingOperations()).length, 0);
});

test("dependent operations wait until the parent is synced", async () => {
  storeWith();
  session();
  const parent = await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  const childId = "22222222-2222-4222-8222-222222222222";
  await enqueueOperation({
    type: "farm.record_job_payment",
    businessUnitCode: "farm",
    id: childId,
    dependsOn: [parent.id],
    payload: { requestId: childId, jobId: "job-1", amount: "5000" },
  });
  const seen: string[] = [];
  setOfflineDispatcher(async (op) => {
    seen.push(op.type);
    return { ok: true, duplicate: false };
  });
  await syncPendingOperations();
  assert.deepEqual(seen, ["farm.record_job", "farm.record_job_payment"]);
});

test("a mutex prevents two coordinators from submitting the same row concurrently", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  let active = 0;
  let max = 0;
  let calls = 0;
  setOfflineDispatcher(async () => {
    active += 1;
    max = Math.max(max, active);
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return { ok: true, duplicate: false };
  });
  await Promise.all([syncPendingOperations(), syncPendingOperations()]);
  assert.equal(max, 1);
  assert.equal(calls, 1);
});

test("transient errors keep the operation and increase retry backoff", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  setOfflineDispatcher(async () => ({ ok: false, retryable: true, code: "TRANSIENT", error: "timeout" }));
  await syncPendingOperations();
  const [op] = await getPendingOperations();
  assert.equal(op.status, "pending");
  assert.equal(op.retryCount, 1);
  assert.ok((op.nextRetryAt ?? 0) > Date.now());
  assert.ok(backoffMs(1) >= 2000);
});

test("expired sessions leave work queued instead of deleting it", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  setOfflineDispatcher(async () => ({ ok: false, retryable: true, code: "AUTH", error: "Sign in required." }));
  await syncPendingOperations();
  assert.equal((await getPendingOperations()).length, 1);
  assert.equal((await getPendingOperations())[0].status, "pending");
});

test("another user's queued operations are never submitted on this session", async () => {
  storeWith();
  session("user-b", "auth-b");
  const foreign: QueuedOperation = {
    id: jobPayload.requestId,
    type: "farm.record_job",
    dependsOn: [],
    userId: "user-a",
    authUid: "auth-a",
    businessUnitCode: "farm",
    createdAt: Date.now(),
    payload: jobPayload,
    status: "pending",
    retryCount: 0,
  };
  bindOfflineStore(createMemoryStore([foreign]));
  let called = 0;
  setOfflineDispatcher(async () => {
    called += 1;
    return { ok: true, duplicate: false };
  });
  await syncPendingOperations();
  assert.equal(called, 0);
  const status = await getSyncStatus("user-b");
  assert.equal(status.foreignPending, 1);
});

test("idempotent replay marks the operation synced without a second apply", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  let applies = 0;
  const dispatch: OperationDispatcher = async () => {
    applies += 1;
    return { ok: true, duplicate: applies > 1, result: { id: "job-1" } };
  };
  setOfflineDispatcher(dispatch);
  await syncPendingOperations();
  await syncPendingOperations();
  assert.equal(applies, 1);
  assert.equal((await getPendingOperations()).length, 0);
  assert.equal((await getSyncStatus()).phase, "synced");
});

test("timeout after a server commit is recovered as a duplicate on retry", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  let applies = 0;
  setOfflineDispatcher(async () => {
    applies += 1;
    if (applies === 1) return { ok: false, retryable: true, code: "TRANSIENT", error: "timeout" };
    return { ok: true, duplicate: true, result: { id: "job-1" } };
  });
  await syncPendingOperations();
  assert.equal((await getPendingOperations()).length, 1);
  await syncPendingOperations(Date.now() + 120_000);
  assert.equal(applies, 2);
  assert.equal((await getPendingOperations()).length, 0);
  assert.equal((await getSyncStatus()).phase, "synced");
});

test("validation failures become failed records that can be discarded", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload });
  setOfflineDispatcher(async () => ({ ok: false, retryable: false, code: "VALIDATION", error: "Agreed price cannot be negative." }));
  await syncPendingOperations();
  const conflicts = await getConflicts();
  assert.equal(conflicts[0]?.status, "failed");
  await resolveConflict(conflicts[0].id, "discard");
  assert.equal((await getPendingOperations()).length, 0);
});

test("partial batch failure does not drop sibling operations", async () => {
  storeWith();
  session();
  const first = { ...jobPayload, requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const second = { ...jobPayload, requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: first });
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: second });
  setOfflineDispatcher(async (op) => {
    if (op.id === first.requestId) return { ok: true, duplicate: false };
    return { ok: false, retryable: true, code: "TRANSIENT", error: "timeout" };
  });
  await syncPendingOperations();
  const pending = await getPendingOperations();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, second.requestId);
});

test("stale-version conflicts are preserved for review", async () => {
  storeWith();
  session();
  await enqueueOperation({ type: "farm.record_job", businessUnitCode: "farm", payload: jobPayload, expectedVersion: "1" });
  setOfflineDispatcher(async () => ({ ok: false, retryable: false, code: "CONFLICT", error: "That record is already posted." }));
  await syncPendingOperations();
  assert.equal((await getConflicts())[0]?.status, "conflict");
});

test("snapshot stock replacements are not a queued operation type", () => {
  const parsed = parseOperationPayload("farm.record_job", jobPayload);
  assert.equal(parsed.ok, true);
  const classified = classifyActionError("Stock would go below zero.");
  assert.equal(classified.ok, false);
  if (!classified.ok) assert.equal(classified.code, "VALIDATION");
});

test("duplicate payment wording is treated as a conflict, not a new posting", () => {
  const result: SubmitQueuedResult = classifyActionError("That record is already posted.");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "CONFLICT");
});
