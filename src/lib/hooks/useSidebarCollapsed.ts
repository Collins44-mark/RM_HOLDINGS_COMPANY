"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "@/lib/config/app";

const SIDEBAR_EVENT = "rm-holdings-sidebar-collapsed";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!getSnapshot()));
      window.dispatchEvent(new Event(SIDEBAR_EVENT));
    } catch {
      // Ignore storage write errors
    }
  }, []);

  return { collapsed, toggle };
}
