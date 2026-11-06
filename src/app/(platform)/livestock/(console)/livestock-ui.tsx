"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { saveModuleJson } from "@/lib/offline/module-save";

export const fieldClass = "mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ActionMark({ state }: { state: string }) {
  if (state === "saving") return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
  if (state === "saved") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  return null;
}

export function useLivestock(initial: LivestockDirectory) {
  const router = useRouter();
  const busy = useRef(false);
  const [data, setData] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [mark, setMark] = useState("");
  const [error, setError] = useState("");
  async function save(payload: Record<string, unknown>, options?: { close?: () => void; mark?: string }) {
    if (busy.current) return false;
    busy.current = true;
    setMark(options?.mark || "");
    setState("saving");
    setError("");
    try {
      const action = String(payload.action || "");
      const requestKey = typeof payload.request_key === "string" && payload.request_key ? payload.request_key : crypto.randomUUID();
      const body = action.includes("payment") ? { ...payload, request_key: requestKey } : payload;
      const result = await saveModuleJson("/api/livestock", "POST", body);
      if (!result.ok) {
        setError(result.error || "Save failed");
        setState("idle");
        setMark("");
        return false;
      }
      if (!result.queued) {
        setData((result.data.directory || data) as LivestockDirectory);
        router.refresh();
      }
      setState("saved");
      await wait(700);
      options?.close?.();
      setState("idle");
      setMark("");
      return true;
    } catch {
      setError("Network error");
      setState("idle");
      setMark("");
      return false;
    } finally {
      busy.current = false;
    }
  }
  return { data, state, mark, error, setError, save };
}

export function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold text-white ${state === "saved" ? "bg-emerald-600" : "bg-[#0b2244]"}`}>
      {state === "saving" ? <ActionMark state={state} /> : state === "saved" ? <span className="flex items-center gap-1.5"><ActionMark state={state} /> Saved</span> : label}
    </button>
  );
}

export function RowButton({ active, state, label, className, onClick }: { active: boolean; state: string; label: string; className: string; onClick: () => void }) {
  const show = active && state !== "idle";
  return (
    <button type="button" disabled={state === "saving"} onClick={onClick} className={`inline-flex min-w-16 items-center justify-center ${className} ${show && state === "saved" ? "text-emerald-600" : ""}`}>
      {show ? <ActionMark state={state} /> : label}
    </button>
  );
}

export function TypeSelect({ types, value, onChange }: { types: Array<{ id: string; name: string; active: boolean }>; value: string; onChange: (value: string) => void }) {
  return (
    <select required value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
      <option value="">Select animal type</option>
      {types.filter((type) => type.active).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
    </select>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mb-4 mr-4 mt-16 flex h-[calc(100vh-5rem)] w-full flex-col overflow-y-auto rounded-3xl border border-slate-100 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-md sm:mt-[88px] sm:h-[calc(100vh-6.5rem)] sm:w-[480px] lg:w-[520px]">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/90 px-8 pb-4 pt-8 backdrop-blur-md">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 px-8 py-6">{children}</div>
      </div>
    </div>
  );
}

export function Panel({ title, children, onClose, onSubmit }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <Drawer title={title} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">{children}</form>
    </Drawer>
  );
}

export function money(value: number) {
  return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value || 0);
}
