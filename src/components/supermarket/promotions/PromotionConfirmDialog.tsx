"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

export function PromotionConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/30 px-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={onCancel} />
      <div className="relative z-[91] w-full max-w-[400px] rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_24px_60px_rgba(15,35,64,0.18)]">
        <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={cn(secondaryButton, "w-full sm:w-auto")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              primaryButton,
              "w-full sm:w-auto",
              tone === "danger" && "bg-[#c45b66] shadow-[0_10px_22px_rgba(196,91,102,0.22)] hover:bg-[#b44f59]",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
