"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getMyAvatarAction } from "@/actions/profile";

type AvatarState = {
  userId: string | null;
  status: "idle" | "ready";
  url: string | null;
};

let state: AvatarState = { userId: null, status: "idle", url: null };
const listeners = new Set<() => void>();
let load: Promise<void> | null = null;

function emit(next: AvatarState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function storageKey(userId: string) {
  return `rm-profile-avatar:${userId}`;
}

function readStored(userId: string) {
  try {
    return sessionStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function publishProfileAvatar(userId: string, url: string | null) {
  try {
    sessionStorage.setItem(storageKey(userId), url ?? "");
  } catch {
    // The header still updates for this page view.
  }
  load = null;
  emit({ userId, status: "ready", url });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ensureAvatar(userId: string) {
  if (state.status === "ready" && state.userId === userId) return;
  const stored = readStored(userId);
  if (stored !== null) {
    emit({ userId, status: "ready", url: stored || null });
    return;
  }
  if (load) return;
  load = getMyAvatarAction().then((result) => {
    const url = result.ok ? result.avatarUrl : null;
    try {
      sessionStorage.setItem(storageKey(userId), url ?? "");
    } catch {
      // Ignore storage failures and keep the in-memory photo.
    }
    emit({ userId, status: "ready", url });
  });
}

export function useProfileAvatar(userId: string | null | undefined) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  useEffect(() => {
    if (!userId) return;
    ensureAvatar(userId);
  }, [userId]);

  const ready = Boolean(userId && snapshot.userId === userId && snapshot.status === "ready");
  return { ready, url: ready ? snapshot.url : null };
}
