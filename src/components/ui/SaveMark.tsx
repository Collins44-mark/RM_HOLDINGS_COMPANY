"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

export function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SaveLabel({ busy, failed = false, label }: { busy: boolean; failed?: boolean; label: ReactNode }) {
  const [tick, setTick] = useState(false);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setTick(false);
      return;
    }
    if (!wasBusy.current || failed) {
      wasBusy.current = false;
      return;
    }
    wasBusy.current = false;
    setTick(true);
    const timer = window.setTimeout(() => setTick(false), 700);
    return () => window.clearTimeout(timer);
  }, [busy, failed]);

  if (busy) return <Spinner />;
  if (tick) return <Tick />;
  return <>{label}</>;
}
