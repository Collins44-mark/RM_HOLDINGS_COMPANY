"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";
import {
  listUserOperations,
  resolveConflict,
  syncPendingOperations,
  type QueuedOperation,
  type SyncStatusSnapshot,
} from "@/lib/offline";

function statusLabel(op: QueuedOperation, t: ReturnType<typeof useT>) {
  if (op.status === "pending") return t("offline.pending");
  if (op.status === "syncing") return t("offline.syncing");
  if (op.status === "synced") return t("offline.synced");
  if (op.status === "conflict") return t("offline.conflict");
  return t("offline.failed");
}

export function SyncCenterPanel({
  status,
  onClose,
}: {
  status: SyncStatusSnapshot;
  onClose: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<QueuedOperation[]>([]);
  const fingerprint = `${status.pending}:${status.syncing}:${status.conflicts}:${status.failed}:${status.lastSyncedAt ?? 0}`;

  async function refresh() {
    const next = await listUserOperations();
    setRows(next);
  }

  useEffect(() => {
    let cancelled = false;
    void listUserOperations().then((next) => {
      if (!cancelled) setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fingerprint]);

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-navy">{t("offline.center")}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-slate-500">{t("offline.storageWarning")}</p>
        </div>
        <button type="button" onClick={onClose} className="text-[12px] font-medium text-slate-500 hover:text-navy">
          {t("offline.close")}
        </button>
      </div>
      {status.foreignPending > 0 ? (
        <p className="border-t border-navy/5 px-4 py-2 text-[12px] text-[#b42318]">{t("offline.foreignQueue")}</p>
      ) : null}
      <div className="max-h-72 overflow-y-auto border-t border-navy/5">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("offline.empty")}</p>
        ) : (
          rows.slice(0, 40).map((op) => (
            <div key={op.id} className="border-t border-navy/5 px-4 py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-navy">{op.type}</p>
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {statusLabel(op, t)}
                </span>
              </div>
              {op.lastError ? <p className="mt-1 text-[12px] leading-4 text-[#b42318]">{op.lastError}</p> : null}
              {op.status === "conflict" || op.status === "failed" ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-[12px] font-medium text-navy"
                    onClick={async () => {
                      await resolveConflict(op.id, "retry");
                      await syncPendingOperations();
                      await refresh();
                    }}
                  >
                    {t("offline.retry")}
                  </button>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#b42318]"
                    onClick={async () => {
                      await resolveConflict(op.id, "discard");
                      await refresh();
                    }}
                  >
                    {t("offline.discard")}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-navy/5 px-4 py-3">
        <button
          type="button"
          onClick={() => void syncPendingOperations().then(() => refresh())}
          className="text-[13px] font-medium text-navy"
        >
          {t("offline.syncNow")}
        </button>
      </div>
    </div>
  );
}
