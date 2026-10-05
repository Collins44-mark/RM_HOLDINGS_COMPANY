"use client";

import { useActionState, useMemo, useState } from "react";
import { saveBusinessUnitLocationAction } from "@/actions/business-units";

type UnitOption = {
  id: string;
  name: string;
  storedLocation: string;
};

const fieldClass =
  "h-11 w-full rounded-[14px] border border-black/[0.06] bg-white/90 px-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

export function BusinessUnitLocationsForm({ units }: { units: UnitOption[] }) {
  const [state, action, pending] = useActionState(saveBusinessUnitLocationAction, null);
  const [selectedId, setSelectedId] = useState(units[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const selected = useMemo(
    () => units.find((unit) => unit.id === selectedId) ?? units[0],
    [selectedId, units],
  );
  const location =
    (selected && selected.id in drafts ? drafts[selected.id] : selected?.storedLocation) ?? "";

  if (units.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-slate-500">
        No business units were returned from Supabase.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4 px-5 py-5">
      <input type="hidden" name="businessUnitId" value={selected?.id ?? ""} />
      <label className="block">
        <span className="mb-1.5 block text-sm text-slate-500">Business Unit</span>
        <select
          className={fieldClass}
          value={selected?.id ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-slate-500">Location</span>
        <input
          name="location"
          value={location}
          onChange={(event) => {
            const id = selected?.id;
            if (!id) return;
            setDrafts((current) => ({ ...current, [id]: event.target.value }));
          }}
          placeholder="Location not set"
          maxLength={160}
          className={fieldClass}
        />
      </label>
      {state?.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">Location saved.</p> : null}
      <button
        type="submit"
        disabled={pending || !selected}
        className="h-11 rounded-[14px] bg-navy px-5 text-[14px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
