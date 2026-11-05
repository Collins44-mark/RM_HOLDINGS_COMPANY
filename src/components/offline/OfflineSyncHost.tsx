"use client";

import { useEffect } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { bindOfflineSession, configureBrowserOfflineEngine, publishOfflineIdentity } from "@/lib/offline";

export function OfflineSyncHost({ user }: { user: AuthUser }) {
  const session = { userId: user.id, authUid: user.authUid };
  bindOfflineSession(session);
  publishOfflineIdentity(user.id);
  useEffect(() => configureBrowserOfflineEngine(session), [session.userId, session.authUid]);
  return null;
}
