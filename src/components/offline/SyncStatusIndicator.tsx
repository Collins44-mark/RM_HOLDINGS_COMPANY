"use client";

import { useEffect, useState } from "react";
import { CloudOff, LoaderCircle, TriangleAlert, Wifi } from "lucide-react";
import { useT } from "@/components/i18n/LocaleProvider";
import { SyncCenterPanel } from "@/components/offline/SyncCenterPanel";
import { subscribeToSyncStatus, type SyncStatusSnapshot } from "@/lib/offline";
import { cn } from "@/lib/cn";

function formatSyncTime(value: number | null, locale: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function SyncStatusIndicator() {
  const t = useT();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeToSyncStatus(setStatus), []);

  if (!status) return null;

  const pending = status.pending + status.syncing;
  const offline = !status.reachable || !status.browserOnline;
  const attention = status.phase === "attention";
  const hideWhenQuiet = !offline && (status.phase === "idle" || status.phase === "synced") && !open;
  if (hideWhenQuiet) return null;

  const lastSync = formatSyncTime(status.lastSyncedAt, "en-GB");
  const label = offline
    ? lastSync
      ? t("offline.offlineSince", { time: lastSync })
      : t("offline.offline")
    : status.phase === "syncing"
      ? t("offline.syncing")
      : status.phase === "queued"
        ? t("offline.queued", { count: pending })
        : attention
          ? t("offline.attention", { count: status.conflicts + status.failed })
          : t("offline.synced");

  const Icon = status.phase === "syncing" ? LoaderCircle : attention ? TriangleAlert : offline ? CloudOff : Wifi;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={status.lastError || label}
        aria-label={label}
        className={cn(
          "inline-flex h-10 max-w-[12.5rem] items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 text-[12px] font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,35,64,0.04)] sm:h-11",
          attention ? "text-[#b42318]" : "hover:text-navy",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", status.phase === "syncing" && "animate-spin")} strokeWidth={1.75} />
        <span className="truncate">{label}</span>
      </button>
      {open ? <SyncCenterPanel status={status} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
