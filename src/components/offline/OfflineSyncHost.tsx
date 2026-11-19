"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/lib/auth/types";
import { bindOfflineSession, configureBrowserOfflineEngine, publishOfflineIdentity } from "@/lib/offline";

export function OfflineSyncHost({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const session = { userId: user.id, authUid: user.authUid };
  bindOfflineSession(session);
  publishOfflineIdentity(user.id);
  useEffect(() => configureBrowserOfflineEngine(session), [session.userId, session.authUid]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancel = false;
    void navigator.serviceWorker.ready.then(() => {
      if (cancel || navigator.onLine === false) return;
      const href = `${window.location.pathname}${window.location.search}`;
      void fetch(href, { credentials: "same-origin", cache: "no-store" }).catch(() => undefined);
    });
    return () => {
      cancel = true;
    };
  }, [pathname, user.id]);
  return null;
}
