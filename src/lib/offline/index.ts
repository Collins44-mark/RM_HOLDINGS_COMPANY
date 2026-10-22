import { defaultOfflineDispatcher } from "./dispatch";
import { isLikelyOffline, isTransportError } from "./errors";
import { publishOfflineIdentity } from "./identity";
import {
  bindOfflineSession,
  bindOfflineStore,
  enqueueOperation,
  getConflicts,
  getPendingOperations,
  getSyncStatus,
  listUserOperations,
  resolveConflict,
} from "./outbox";
import { setOfflineDispatcher, startOfflineCoordinator, subscribeToSyncStatus, syncPendingOperations } from "./coordinator";
import type { EnqueueInput, OfflineSession } from "./types";

export {
  enqueueOperation,
  getConflicts,
  getPendingOperations,
  getSyncStatus,
  listUserOperations,
  resolveConflict,
  subscribeToSyncStatus,
  syncPendingOperations,
  bindOfflineSession,
  bindOfflineStore,
  setOfflineDispatcher,
  startOfflineCoordinator,
  isLikelyOffline,
  isTransportError,
};
export { writeOfflineSnapshot, readOfflineSnapshot, loadWorkspaceWithCache } from "./snapshots";
export { publishOfflineIdentity } from "./identity";
export type {
  EnqueueInput,
  OfflineOperationType,
  OfflineStatus,
  QueuedOperation,
  SyncStatusSnapshot,
} from "./types";

export function configureBrowserOfflineEngine(session: OfflineSession) {
  bindOfflineSession(session);
  publishOfflineIdentity(session.userId);
  setOfflineDispatcher(defaultOfflineDispatcher);
  const stop = startOfflineCoordinator();
  return () => {
    stop();
    publishOfflineIdentity(null);
    bindOfflineSession(null);
  };
}

export async function enqueueOrExecute<T extends { ok: boolean }>(
  input: EnqueueInput,
  execute: () => Promise<T>,
): Promise<{ queued: true; id: string } | ({ queued: false } & T)> {
  if (isLikelyOffline()) {
    const op = await enqueueOperation(input);
    void syncPendingOperations();
    return { queued: true, id: op.id };
  }
  try {
    const result = await execute();
    return { queued: false, ...result };
  } catch (error) {
    if (!isTransportError(error)) throw error;
    const op = await enqueueOperation(input);
    void syncPendingOperations();
    return { queued: true, id: op.id };
  }
}

export async function saveWithOutbox(
  input: EnqueueInput,
  execute: () => Promise<{ ok: true; id?: string; duplicate?: boolean } | { ok: false; error: string }>,
): Promise<{ queued: boolean; error?: string }> {
  try {
    const result = await enqueueOrExecute(input, execute);
    if (result.queued) return { queued: true };
    if (!result.ok) return { queued: false, error: result.error };
    return { queued: false };
  } catch (error) {
    return { queued: false, error: error instanceof Error ? error.message : "Couldn't save." };
  }
}
