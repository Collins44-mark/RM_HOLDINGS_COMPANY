"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function AppDialog({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  tone = "primary",
  pending = false,
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
  hideCancel?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b2244]/40 backdrop-blur-[3px]"
        aria-label={hideCancel ? "Close" : "Cancel"}
        onClick={() => {
          if (!pending) onCancel();
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
              disabled={pending}
              className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600 ring-1 ring-black/10 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              tone === "danger"
                ? "h-11 rounded-[14px] bg-[#b42318] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                : "h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white disabled:opacity-60"
            }
          >
            {pending ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
