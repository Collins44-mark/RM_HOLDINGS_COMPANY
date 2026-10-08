"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

export function SchoolIconWell({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-navy/[0.045] text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function SchoolWorkflowButton({
  className,
  busy,
  disabled,
  idleLabel,
  busyLabel,
  confirmed,
  confirmedLabel = "Saved ✓",
  onClick,
}: {
  className: string;
  busy: boolean;
  disabled?: boolean;
  idleLabel: string;
  busyLabel?: string;
  confirmed?: boolean;
  confirmedLabel?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} className={cn(className, "relative min-w-[8.75rem]")}>
      <span className={cn("inline-flex items-center justify-center gap-2", busy && !busyLabel && "invisible")}>
        {busy && busyLabel ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
            {busyLabel}
          </>
        ) : confirmed ? (
          confirmedLabel
        ) : (
          idleLabel
        )}
      </span>
      {busy && !busyLabel ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
        </span>
      ) : null}
    </button>
  );
}

export function SchoolGlassModal({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/25 px-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={onClose} />
      <div className="relative z-[91] w-full max-w-[440px] rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)] backdrop-blur-xl">
        <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
        {subtitle ? <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p> : null}
        <div className="mt-4 space-y-3">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SchoolConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b2244]/30 px-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Dismiss" onClick={onCancel} />
      <div className="relative z-[91] w-full max-w-[400px] rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_24px_60px_rgba(15,35,64,0.18)]">
        <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className={cn(secondaryButton, "w-full sm:w-auto")}>
            Cancel
          </button>
          <SchoolWorkflowButton className={primaryButton} busy={Boolean(busy)} idleLabel={confirmLabel} onClick={onConfirm} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SchoolField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
