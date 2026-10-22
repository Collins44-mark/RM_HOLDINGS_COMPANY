import { backoffMs } from "./errors";
import {
  bindOfflineSession,
  currentOfflineSession,
  currentOfflineStore,
  getSyncStatus,
  resetStuckSyncing,
} from "./outbox";
import type { OperationDispatcher, QueuedOperation, SyncStatusSnapshot } from "./types";

const listeners = new Set<(status: SyncStatusSnapshot) => void>();
let inflight: Promise<SyncStatusSnapshot> | null = null;
let dispatcher: OperationDispatcher | null = null;
let started = false;
const unsubscribers: Array<() => void> = [];

export function setOfflineDispatcher(next: OperationDispatcher | null) {
  dispatcher = next;
}

export function subscribeToSyncStatus(listener: (status: SyncStatusSnapshot) => void) {
  listeners.add(listener);
  void getSyncStatus().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function emit() {
  const snapshot = await getSyncStatus();
  for (const listener of listeners) listener(snapshot);
  return snapshot;
}

function ready(op: QueuedOperation, byId: Map<string, QueuedOperation>, now: number) {
  if (op.status !== "pending") return false;
  if ((op.nextRetryAt ?? 0) > now) return false;
  return op.dependsOn.every((id) => byId.get(id)?.status === "synced");
}

async function processOne(op: QueuedOperation, dispatch: OperationDispatcher) {
  const store = currentOfflineStore();
  const session = currentOfflineSession();
  if (!session || op.userId !== session.userId) {
    return;
  }
  if (op.authUid && session.authUid && op.authUid !== session.authUid) {
    await store.put({ ...op, lastError: "Queued work belongs to a different sign-in." });
    return;
  }

  const claimed: QueuedOperation = { ...op, status: "syncing" };
  await store.put(claimed);

  const result = await dispatch(claimed);
  const latest = (await store.get(op.id)) ?? claimed;

  if (result.ok) {
    await store.put({
      ...latest,
      status: "synced",
      syncedAt: Date.now(),
      lastError: undefined,
      serverResult: result.result ?? { duplicate: result.duplicate },
    });
    return;
  }

  if (result.code === "AUTH" || result.code === "FORBIDDEN") {
    await store.put({
      ...latest,
      status: "pending",
      lastError: result.error,
      nextRetryAt: Date.now() + 15_000,
    });
    return;
  }

  if (result.code === "CONFLICT") {
    await store.put({ ...latest, status: "conflict", lastError: result.error });
    return;
  }

  if (result.code === "VALIDATION") {
    await store.put({ ...latest, status: "failed", lastError: result.error });
    return;
  }

  const retryCount = latest.retryCount + 1;
  await store.put({
    ...latest,
    status: "pending",
    retryCount,
    lastError: result.error,
    nextRetryAt: Date.now() + backoffMs(retryCount),
  });
}

export async function syncPendingOperations(now = Date.now()): Promise<SyncStatusSnapshot> {
  if (inflight) return inflight;
  inflight = (async () => {
    await resetStuckSyncing();
    const dispatch = dispatcher;
    if (!dispatch || !currentOfflineSession()) return emit();
    const store = currentOfflineStore();
    const rows = (await store.list()).sort((a, b) => a.createdAt - b.createdAt);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const op of rows) {
      const fresh = (await store.get(op.id)) ?? op;
      byId.set(fresh.id, fresh);
      if (!ready(fresh, byId, now)) continue;
      await processOne(fresh, dispatch);
      const updated = await store.get(op.id);
      if (updated) byId.set(updated.id, updated);
    }
    return emit();
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function startOfflineCoordinator() {
  if (started) return () => {};
  started = true;
  void syncPendingOperations();

  if (typeof window !== "undefined") {
    const onOnline = () => void syncPendingOperations();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncPendingOperations();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    unsubscribers.push(() => window.removeEventListener("online", onOnline));
    unsubscribers.push(() => document.removeEventListener("visibilitychange", onVisible));
  }

  return () => {
    started = false;
    while (unsubscribers.length) unsubscribers.pop()?.();
  };
}

export { bindOfflineSession, emit as emitSyncStatus };
