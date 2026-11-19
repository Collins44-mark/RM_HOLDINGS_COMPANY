"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function AppDialog({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  tone = "primary",
  pending = false,
  succeeded = false,
  hideCancel = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  succeeded?: boolean;
  hideCancel?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending && !succeeded) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending, succeeded]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b2244]/40 backdrop-blur-[3px]"
        aria-label={hideCancel ? "Close" : "Cancel"}
        onClick={() => {
          if (!pending && !succeeded) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="relative w-full max-w-[420px] rounded-[24px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,35,64,0.22)]"
      >
        <h2 id="app-dialog-title" className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-slate-500">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {hideCancel ? null : (
            <button
              type="button"
              onClick={onCancel}
              disabled={pending || succeeded}
              className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600 ring-1 ring-black/10 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || succeeded}
            className={cn(
              "inline-flex h-11 min-w-24 items-center justify-center rounded-[14px] px-4 text-[14px] font-semibold text-white disabled:opacity-100",
              succeeded ? "bg-emerald-600" : tone === "danger" ? "bg-[#b42318]" : "bg-navy",
            )}
          >
            {succeeded ? <AppleTick /> : pending ? <AppleSpinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AppleSpinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.4" opacity="0.28" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function AppleTick() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 12.5 10 16.5 18 8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="[stroke-dasharray:20] [stroke-dashoffset:0] [animation:app-dialog-tick_280ms_ease-out]"
      />
    </svg>
  );
}
