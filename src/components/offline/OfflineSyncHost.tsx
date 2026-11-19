"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth/types";
import { bindOfflineSession, configureBrowserOfflineEngine, publishOfflineIdentity } from "@/lib/offline";
import { warmOfflineShell } from "@/lib/offline/shell-warm";

export function OfflineSyncHost({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = { userId: user.id, authUid: user.authUid };
  bindOfflineSession(session);
  publishOfflineIdentity(user.id);
  useEffect(() => configureBrowserOfflineEngine(session), [session.userId, session.authUid]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancel = false;
    const warm = () => {
      if (cancel || navigator.onLine === false) return;
      const href = `${window.location.pathname}${window.location.search}`;
      void warmOfflineShell(href);
    };
    void navigator.serviceWorker.ready.then(warm);
    const onOnline = () => {
      warm();
      router.refresh();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancel = true;
      window.removeEventListener("online", onOnline);
    };
  }, [pathname, router, user.id]);
  return null;
}
