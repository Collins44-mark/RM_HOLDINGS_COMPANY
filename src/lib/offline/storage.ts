import {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  type OfflineStore,
  type QueuedOperation,
} from "./types";

const OPS = "operations";
const META = "meta";

export function createMemoryStore(seed: QueuedOperation[] = []): OfflineStore {
  const ops = new Map(seed.map((row) => [row.id, structuredClone(row)]));
  const meta = new Map<string, string>();
  return {
    async get(id) {
      const row = ops.get(id);
      return row ? structuredClone(row) : undefined;
    },
    async put(op) {
      ops.set(op.id, structuredClone(op));
    },
    async delete(id) {
      ops.delete(id);
    },
    async list() {
      return [...ops.values()].map((row) => structuredClone(row));
    },
    async getMeta(key) {
      return meta.get(key);
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPS)) {
        db.createObjectStore(OPS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open offline storage."));
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Offline storage write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline storage write aborted."));
  });
}

export function createIndexedDbStore(): OfflineStore {
  return {
    async get(id) {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(OPS, "readonly").objectStore(OPS).get(id);
          request.onsuccess = () => resolve(request.result as QueuedOperation | undefined);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    async put(op) {
      const db = await openDb();
      try {
        const tx = db.transaction(OPS, "readwrite");
        tx.objectStore(OPS).put(op);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
    async delete(id) {
      const db = await openDb();
      try {
        const tx = db.transaction(OPS, "readwrite");
        tx.objectStore(OPS).delete(id);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
    async list() {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(OPS, "readonly").objectStore(OPS).getAll();
          request.onsuccess = () => resolve((request.result ?? []) as QueuedOperation[]);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    async getMeta(key) {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(META, "readonly").objectStore(META).get(key);
          request.onsuccess = () => resolve(request.result as string | undefined);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    async setMeta(key, value) {
      const db = await openDb();
      try {
        const tx = db.transaction(META, "readwrite");
        tx.objectStore(META).put(value, key);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
  };
}

export function defaultOfflineStore(): OfflineStore {
  if (typeof indexedDB === "undefined") return createMemoryStore();
  return createIndexedDbStore();
}
