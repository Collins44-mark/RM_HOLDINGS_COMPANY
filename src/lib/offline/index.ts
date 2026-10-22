import { defaultOfflineDispatcher } from "./dispatch";
import { isLikelyOffline, isTransportError } from "./errors";
import {
  bindOfflineSession,
  bindOfflineStore,
  enqueueOperation,
  getConflicts,
  getPendingOperations,
  getSyncStatus,
  resolveConflict,
} from "./outbox";
import { setOfflineDispatcher, startOfflineCoordinator, subscribeToSyncStatus, syncPendingOperations } from "./coordinator";
import type { EnqueueInput, OfflineSession } from "./types";

export {
  enqueueOperation,
  getConflicts,
  getPendingOperations,
  getSyncStatus,
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
export type {
  EnqueueInput,
  OfflineOperationType,
  OfflineStatus,
  QueuedOperation,
  SyncStatusSnapshot,
} from "./types";

export function configureBrowserOfflineEngine(session: OfflineSession) {
  bindOfflineSession(session);
  setOfflineDispatcher(defaultOfflineDispatcher);
  return startOfflineCoordinator();
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
