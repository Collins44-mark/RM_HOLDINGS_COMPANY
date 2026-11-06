"use client";

import type { ReactNode } from "react";

export const fieldClass = "mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300";
export const overlayClass = "fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]";

export function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function statusClass(status: string) {
  if (status === "Active" || status === "Paid" || status === "Valid" || status === "Premium") return "bg-emerald-50 text-emerald-700";
  if (status === "Partially Paid" || status === "Maintenance" || status === "Good") return "bg-amber-50 text-amber-700";
  if (status === "Cancelled" || status === "Inactive" || status === "Archived") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold ${state === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
      {state === "saving" ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : state === "saved" ? "Saved" : label}
    </button>
  );
}

export function placeActionMenu(rect: DOMRect, itemCount: number) {
  const width = 176;
  const height = itemCount * 36 + 8;
  const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
  return { top, left: Math.max(8, rect.right - width) };
}

export function ActionMenu({ top, left, onClose, children }: { top: number; left: number; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute w-44 rounded-2xl border border-slate-100 bg-white py-1 text-sm shadow-xl" style={{ top, left }} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ActionMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onClick}>{label}</button>;
}

export async function saveJson(url: string, method: "POST" | "PATCH", body: unknown) {
  const { saveModuleJson } = await import("@/lib/offline/module-save");
  const result = await saveModuleJson(url, method, body);
  if (!result.ok) throw new Error(result.error);
  if (result.queued) return { queued: true as const };
  return result.data as { queued?: false; directory: any };
}
