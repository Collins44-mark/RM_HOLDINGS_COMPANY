"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function AccessModal({
  title,
  subtitle,
  onClose,
  footer,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/25 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[100vh] w-full flex-col overflow-hidden border border-white/70 bg-white/90 shadow-[0_18px_50px_rgba(15,35,64,0.16)] backdrop-blur-xl",
          "rounded-t-[24px] sm:max-h-[calc(100vh-48px)] sm:rounded-[24px]",
          wide ? "sm:max-w-[920px]" : "sm:max-w-[780px]",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/[0.04] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
            {subtitle ? <div className="mt-1 text-[13px] text-slate-500">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition duration-200 hover:bg-[#f4f7fb] hover:text-navy"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.04] bg-white/80 px-5 py-3 backdrop-blur-xl sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PermissionSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-10 rounded-[14px] bg-[#eef3f8]" />
      <div className="h-10 rounded-[14px] bg-[#eef3f8]" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-9 rounded-full bg-[#eef3f8]" />
        <div className="h-9 rounded-full bg-[#eef3f8]" />
        <div className="h-9 rounded-full bg-[#eef3f8]" />
        <div className="h-9 rounded-full bg-[#eef3f8]" />
      </div>
    </div>
  );
}
