import { parseOperationPayload, requestIdFromPayload } from "./catalog";
import { defaultOfflineStore } from "./storage";
import type { EnqueueInput, OfflineSession, OfflineStore, QueuedOperation, SyncStatusSnapshot } from "./types";

let store: OfflineStore = defaultOfflineStore();
let session: OfflineSession | null = null;

export function bindOfflineStore(next: OfflineStore) {
  store = next;
}

export function bindOfflineSession(next: OfflineSession | null) {
  session = next;
}

export function currentOfflineSession() {
  return session;
}

export function currentOfflineStore() {
  return store;
}

export async function enqueueOperation(input: EnqueueInput): Promise<QueuedOperation> {
  if (!session) throw new Error("Sign in before saving work offline.");
  const parsed = parseOperationPayload(input.type, input.payload);
  if (!parsed.ok) throw new Error(parsed.error);
  const id = input.id || requestIdFromPayload(parsed.payload) || crypto.randomUUID();
  const existing = await store.get(id);
  if (existing) return existing;
  const op: QueuedOperation = {
    id,
    type: input.type,
    entityId: input.entityId,
    dependsOn: input.dependsOn ?? [],
    userId: session.userId,
    authUid: session.authUid,
    businessUnitCode: input.businessUnitCode,
    createdAt: Date.now(),
    expectedVersion: input.expectedVersion,
    payload: parsed.payload,
    status: "pending",
    retryCount: 0,
  };
  await store.put(op);
  const written = await store.get(id);
  if (!written) throw new Error("Couldn't persist the offline operation.");
  return written;
}

export async function getPendingOperations(userId?: string) {
  const rows = await store.list();
  const uid = userId ?? session?.userId;
  return rows
    .filter((row) => row.status === "pending" || row.status === "syncing")
    .filter((row) => !uid || row.userId === uid)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getConflicts(userId?: string) {
  const rows = await store.list();
  const uid = userId ?? session?.userId;
  return rows.filter((row) => (row.status === "conflict" || row.status === "failed") && (!uid || row.userId === uid));
}

export async function resolveConflict(id: string, action: "retry" | "discard") {
  const op = await store.get(id);
  if (!op) return;
  if (action === "discard") {
    await store.put({ ...op, status: "failed", lastError: op.lastError ?? "Discarded locally." });
    return;
  }
  await store.put({ ...op, status: "pending", nextRetryAt: Date.now(), lastError: undefined });
}

export async function getSyncStatus(userId?: string): Promise<SyncStatusSnapshot> {
  const rows = await store.list();
  const uid = userId ?? session?.userId;
  const mine = rows.filter((row) => !uid || row.userId === uid);
  const foreign = uid ? rows.filter((row) => row.userId !== uid && row.status !== "synced") : [];
  const pending = mine.filter((row) => row.status === "pending").length;
  const syncing = mine.filter((row) => row.status === "syncing").length;
  const conflicts = mine.filter((row) => row.status === "conflict").length;
  const failed = mine.filter((row) => row.status === "failed").length;
  const lastSynced = mine.filter((row) => row.syncedAt).reduce((max, row) => Math.max(max, row.syncedAt ?? 0), 0);
  const lastError = mine.find((row) => row.lastError && row.status !== "synced")?.lastError ?? null;
  let phase: SyncStatusSnapshot["phase"] = "idle";
  if (syncing) phase = "syncing";
  else if (conflicts || failed) phase = "attention";
  else if (pending) phase = "queued";
  else if (lastSynced) phase = "synced";
  return {
    phase,
    pending,
    syncing,
    conflicts,
    failed,
    lastSyncedAt: lastSynced || null,
    lastError,
    foreignPending: foreign.length,
  };
}

export async function resetStuckSyncing() {
  const rows = await store.list();
  for (const row of rows) {
    if (row.status !== "syncing") continue;
    await store.put({ ...row, status: "pending" });
  }
}

