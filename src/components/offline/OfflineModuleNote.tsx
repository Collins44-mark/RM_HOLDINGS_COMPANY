"use client";

import { useEffect, useState } from "react";
import { isLikelyOffline } from "@/lib/offline";

export function OfflineModuleNote({ children }: { children: string }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function sync() {
      setOffline(isLikelyOffline());
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return <p className="rounded-[14px] border border-navy/10 bg-white px-3 py-2 text-[13px] leading-5 text-slate-600">{children}</p>;
}
