import { isLikelyOffline, isTransportError } from "./errors";
import { snapshotStorageKey } from "./shell-policy";
import { currentOfflineSession } from "./outbox";
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from "./types";

export type OfflineWorkspaceSnapshot = {
  key: string;
  userId: string;
  businessUnitCode: string;
  kind: string;
  savedAt: number;
  payload: unknown;
};

const SNAPS = "snapshots";

let memory = new Map<string, OfflineWorkspaceSnapshot>();

export function bindSnapshotMemory(seed: OfflineWorkspaceSnapshot[] = []) {
  memory = new Map(seed.map((row) => [row.key, structuredClone(row)]));
}

function openDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("operations")) db.createObjectStore("operations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains(SNAPS)) db.createObjectStore(SNAPS, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open offline snapshots."));
  });
}

export async function writeOfflineSnapshot(input: {
  kind: string;
  businessUnitCode: string;
  payload: unknown;
}) {
  const session = currentOfflineSession();
  if (!session) return;
  const row: OfflineWorkspaceSnapshot = {
    key: snapshotStorageKey({ userId: session.userId, businessUnitCode: input.businessUnitCode, kind: input.kind }),
    userId: session.userId,
    businessUnitCode: input.businessUnitCode,
    kind: input.kind,
    savedAt: Date.now(),
    payload: structuredClone(input.payload),
  };
  const dbPromise = openDb();
  if (!dbPromise) {
    memory.set(row.key, row);
    return;
  }
  const db = await dbPromise;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPS, "readwrite");
      tx.objectStore(SNAPS).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function readOfflineSnapshot<T>(kind: string, businessUnitCode: string): Promise<T | null> {
  const session = currentOfflineSession();
  if (!session) return null;
  const key = snapshotStorageKey({ userId: session.userId, businessUnitCode, kind });
  const dbPromise = openDb();
  let row: OfflineWorkspaceSnapshot | undefined;
  if (!dbPromise) {
    row = memory.get(key);
  } else {
    const db = await dbPromise;
    try {
      row = await new Promise((resolve, reject) => {
        const request = db.transaction(SNAPS, "readonly").objectStore(SNAPS).get(key);
        request.onsuccess = () => resolve(request.result as OfflineWorkspaceSnapshot | undefined);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }
  if (!row) return null;
  if (row.userId !== session.userId) return null;
  if (row.businessUnitCode !== businessUnitCode) return null;
  if (row.kind !== kind) return null;
  return structuredClone(row.payload) as T;
}

export async function loadWorkspaceWithCache<T>(input: {
  kind: string;
  businessUnitCode: string;
  load: () => Promise<{ ok: true; workspace: T } | { ok: false; error: string }>;
}): Promise<{ ok: true; workspace: T } | { ok: false; error: string }> {
  try {
    const next = await input.load();
    if (next.ok) {
      await writeOfflineSnapshot({
        kind: input.kind,
        businessUnitCode: input.businessUnitCode,
        payload: next.workspace,
      });
      return next;
    }
    if (isLikelyOffline() || isTransportError(next.error)) {
      const cached = await readOfflineSnapshot<T>(input.kind, input.businessUnitCode);
      if (cached) return { ok: true, workspace: cached };
    }
    return next;
  } catch (error) {
    if (isLikelyOffline() || isTransportError(error)) {
      const cached = await readOfflineSnapshot<T>(input.kind, input.businessUnitCode);
      if (cached) return { ok: true, workspace: cached };
    }
    throw error;
  }
}
