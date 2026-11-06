"use client";

import { enqueueOperation, syncPendingOperations } from "@/lib/offline";
import { isLikelyOffline, isTransportError } from "@/lib/offline/errors";
import { moduleWriteAllowed, moduleWriteOnlineOnly } from "@/lib/offline/module-write-policy";

export type ModuleSaveResult =
  | { ok: true; queued: false; data: Record<string, unknown> }
  | { ok: true; queued: true }
  | { ok: false; error: string };

const ONLINE_ONLY = "This step needs an internet connection. It was not saved.";

function moduleCode(path: string) {
  if (path.startsWith("/api/property")) return "property";
  if (path.startsWith("/api/livestock")) return "livestock";
  if (path.startsWith("/api/beekeeping")) return "beekeeping";
  return "";
}

async function queueSave(path: string, method: "POST" | "PATCH", body: unknown) {
  const code = moduleCode(path);
  if (!code || !moduleWriteAllowed(path, method, body)) {
    return { ok: false as const, error: ONLINE_ONLY };
  }
  const requestId = crypto.randomUUID();
  const type = `${code}.sync` as "property.sync" | "livestock.sync" | "beekeeping.sync";
  await enqueueOperation({
    id: requestId,
    type,
    businessUnitCode: code,
    payload: { requestId, method, path, body: body ?? {} },
  });
  void syncPendingOperations();
  return { ok: true as const, queued: true as const };
}

export async function saveModuleJson(path: string, method: "POST" | "PATCH", body: unknown): Promise<ModuleSaveResult> {
  if (moduleWriteOnlineOnly(path, body) && isLikelyOffline()) {
    return { ok: false, error: ONLINE_ONLY };
  }
  if (isLikelyOffline()) return queueSave(path, method, body);
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = typeof data.error === "string" ? data.error : "Save failed";
      return { ok: false, error };
    }
    return { ok: true, queued: false, data };
  } catch (error) {
    if (isTransportError(error)) return queueSave(path, method, body);
    return { ok: false, error: error instanceof Error ? error.message : "Save failed" };
  }
}
