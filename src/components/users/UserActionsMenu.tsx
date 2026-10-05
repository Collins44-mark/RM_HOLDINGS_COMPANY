"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export function UserActionsMenu({
  onView,
  onCustomize,
  customizeDisabled,
}: {
  onView: () => void;
  onCustomize: () => void;
  customizeDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="User actions"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-[#f4f7fb] hover:text-navy"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[148px] overflow-hidden rounded-[14px] border border-white/80 bg-white/95 py-1 shadow-[0_12px_30px_rgba(20,40,70,0.12)] backdrop-blur-md">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb]"
            onClick={() => {
              setOpen(false);
              onView();
            }}
          >
            View
          </button>
          <button
            type="button"
            disabled={customizeDisabled}
            className="block w-full px-3 py-2 text-left text-[13px] font-medium text-navy hover:bg-[#f4f7fb] disabled:text-slate-400"
            onClick={() => {
              if (customizeDisabled) return;
              setOpen(false);
              onCustomize();
            }}
          >
            Customize
          </button>
        </div>
      ) : null}
    </div>
  );
}
