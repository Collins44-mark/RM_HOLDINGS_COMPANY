"use client";

import { useEffect } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { configureBrowserOfflineEngine } from "@/lib/offline";

export function OfflineSyncHost({ user }: { user: AuthUser }) {
  useEffect(() => {
    return configureBrowserOfflineEngine({ userId: user.id, authUid: user.authUid });
  }, [user.id, user.authUid]);
  return null;
}
