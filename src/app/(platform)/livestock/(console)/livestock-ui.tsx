"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LivestockDirectory } from "@/lib/livestock/directory";

export const fieldClass = "mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none";

export function useLivestock(initial: LivestockDirectory) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  async function save(payload: Record<string, unknown>) {
    setState("saving");
    setError("");
    const response = await fetch("/api/livestock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Save failed");
      setState("idle");
      return false;
    }
    setData(json.directory);
    setState("saved");
    router.refresh();
    window.setTimeout(() => setState("idle"), 900);
    return true;
  }
  return { data, state, error, setError, save };
}

export function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className="flex min-w-[140px] items-center justify-center rounded-xl bg-[#0b2244] px-4 py-2 font-semibold text-white disabled:opacity-70">
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : label}
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

export function Panel({ title, children, onClose, onSubmit }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[88px]">
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><button type="button" onClick={onClose} className="text-sm text-slate-500">Close</button></div>
        {children}
      </form>
    </div>
  );
}

export function money(value: number) {
  return new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value || 0);
}
