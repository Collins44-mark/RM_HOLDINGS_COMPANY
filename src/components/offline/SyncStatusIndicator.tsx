"use client";

import { useEffect, useState } from "react";
import { CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { useT } from "@/components/i18n/LocaleProvider";
import { subscribeToSyncStatus, syncPendingOperations, type SyncStatusSnapshot } from "@/lib/offline";
import { cn } from "@/lib/cn";

export function SyncStatusIndicator() {
  const t = useT();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);

  useEffect(() => subscribeToSyncStatus(setStatus), []);

  if (!status || status.phase === "idle" || status.phase === "synced") return null;

  const pending = status.pending + status.syncing;
  const label =
    status.phase === "syncing"
      ? t("offline.syncing")
      : status.phase === "queued"
        ? t("offline.queued", { count: pending })
        : status.phase === "attention"
          ? t("offline.attention", { count: status.conflicts + status.failed })
          : t("offline.synced");

  const Icon = status.phase === "syncing" ? LoaderCircle : status.phase === "attention" ? TriangleAlert : CloudOff;

  return (
    <button
      type="button"
      onClick={() => void syncPendingOperations()}
      title={status.lastError || label}
      aria-label={label}
      className={cn(
        "hidden h-10 max-w-[11rem] items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 text-[12px] font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,35,64,0.04)] sm:inline-flex sm:h-11",
        status.phase === "attention" ? "text-[#b42318]" : "hover:text-navy",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", status.phase === "syncing" && "animate-spin")} strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </button>
  );
}
