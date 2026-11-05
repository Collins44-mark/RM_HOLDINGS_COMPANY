"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { HARVEST_QUALITIES, businessToday, roundKg } from "@/lib/beekeeping/constants";
import type { BeeDirectory, BeeHarvest } from "@/lib/beekeeping/directory";
import { SaveButton, fieldClass, formatDate, overlayClass, saveJson, statusClass } from "../bee-ui";

export default function HarvestsView({ initial }: { initial: BeeDirectory }) {
  const [directory, setDirectory] = useState(initial);
  const [query, setQuery] = useState("");
  const [hiveId, setHiveId] = useState("");
  const [location, setLocation] = useState("");
  const [from, setFrom] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<BeeHarvest | null>(null);
  const [selected, setSelected] = useState<BeeHarvest | null>(null);
  const [draft, setDraft] = useState({ hive_id: "", harvest_date: businessToday(), quantity_kg: "", quality: "Not Graded", notes: "" });
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const eligible = directory.hives.filter((hive) => hive.status !== "Archived" && hive.status !== "Inactive");
  const rows = useMemo(() => directory.harvests.filter((harvest) => {
    const text = `${harvest.harvest_code} ${harvest.hive_code} ${harvest.location}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!hiveId || harvest.hive_id === hiveId) && (!location || harvest.location === location) && (!from || harvest.harvest_date >= from);
  }), [directory.harvests, query, hiveId, location, from]);
  const list = useListPage(rows, `${query}|${hiveId}|${location}|${from}`);
  const valid = directory.harvests.filter((harvest) => harvest.status === "Valid");
  const month = businessToday().slice(0, 7);
  const monthQty = roundKg(valid.filter((harvest) => harvest.harvest_date.startsWith(month)).reduce((sum, harvest) => sum + harvest.quantity_kg, 0));
  const total = roundKg(valid.reduce((sum, harvest) => sum + harvest.quantity_kg, 0));

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setError("");
    try {
      const data = await saveJson(mode === "edit" && editing ? `/api/beekeeping/harvests/${editing.id}` : "/api/beekeeping/harvests", mode === "edit" ? "PATCH" : "POST", { ...draft, quantity_kg: Number(draft.quantity_kg) });
      setDirectory(data.directory);
      setSaveState("saved");
      setTimeout(() => setMode(null), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaveState("idle");
    }
  }

  async function cancel(harvest: BeeHarvest) {
    setMenu(null);
    try {
      const data = await saveJson(`/api/beekeeping/harvests/${harvest.id}`, "PATCH", { cancel: true });
      setDirectory(data.directory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Harvest Records</h1><p className="text-sm text-slate-500">Each harvest is linked to one hive and increases honey stock.</p></div><button type="button" onClick={() => { setMode("create"); setEditing(null); setDraft({ hive_id: "", harvest_date: businessToday(), quantity_kg: "", quality: "Not Graded", notes: "" }); setSaveState("idle"); setError(""); }} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">+ Add Harvest</button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Records" value={String(valid.length)} /><Card label="Harvested" value={`${total} kg`} /><Card label="This month" value={`${monthQty} kg`} /><Card label="Average" value={valid.length ? `${roundKg(total / valid.length)} kg` : "—"} />
      </div>
      {error && !mode && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search harvests" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select value={hiveId} onChange={(event) => setHiveId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Hive</option>{directory.hives.map((hive) => <option key={hive.id} value={hive.id}>{hive.hive_code}</option>)}</select>
        <select value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Location</option>{[...new Set(directory.hives.map((hive) => hive.location).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Beehive</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Quality</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No harvests yet.</td></tr> : list.rows.map((harvest) => (
              <tr key={harvest.id}>
                <td className="px-4 py-3 font-medium">{harvest.harvest_code}</td>
                <td className="px-4 py-3">{harvest.hive_code}</td>
                <td className="px-4 py-3">{harvest.location}</td>
                <td className="px-4 py-3">{formatDate(harvest.harvest_date)}</td>
                <td className="px-4 py-3">{harvest.quantity_kg} kg</td>
                <td className="px-4 py-3">{harvest.quality}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(harvest.status)}`}>{harvest.status}</span></td>
                <td className="relative px-4 py-3"><button type="button" aria-label="Harvest actions" onClick={() => setMenu(menu === harvest.id ? null : harvest.id)}><MoreVertical size={16} /></button>
                  {menu === harvest.id && <div className="absolute right-4 z-20 w-40 rounded-2xl border bg-white py-1 shadow-xl"><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setSelected(harvest); setMenu(null); }}>View Details</button><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setEditing(harvest); setDraft({ hive_id: harvest.hive_id, harvest_date: harvest.harvest_date, quantity_kg: String(harvest.quantity_kg), quality: harvest.quality, notes: harvest.notes }); setMode("edit"); setSaveState("idle"); setMenu(null); }}>Edit Harvest</button><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => cancel(harvest)}>Cancel Harvest</button></div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4"><PaginationBar page={list.page} total={rows.length} pageSize={list.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} /></div>
      </div>
      {mode && (
        <div className={overlayClass}>
          <form onSubmit={handleSave} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-bold">{mode === "edit" ? "Edit Harvest" : "Add Harvest"}</h3>
            <label className="text-sm">Beehive<select required disabled={mode === "edit"} value={draft.hive_id} onChange={(event) => setDraft({ ...draft, hive_id: event.target.value })} className={fieldClass}><option value="">Select hive</option>{eligible.map((hive) => <option key={hive.id} value={hive.id}>{hive.hive_code} · {hive.location} · {hive.hive_type} · {hive.status}</option>)}</select></label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm">Date<input required type="date" value={draft.harvest_date} onChange={(event) => setDraft({ ...draft, harvest_date: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Quantity (kg)<input required type="number" min="0.001" step="0.001" value={draft.quantity_kg} onChange={(event) => setDraft({ ...draft, quantity_kg: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm col-span-2">Quality<select value={draft.quality} onChange={(event) => setDraft({ ...draft, quality: event.target.value })} className={fieldClass}>{HARVEST_QUALITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label className="mt-3 block text-sm">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} className={fieldClass} /></label>
            <div className="mt-4 flex gap-3"><SaveButton state={saveState} label="Save" /><button type="button" onClick={() => setMode(null)} className="rounded-xl border px-4 py-2">Cancel</button></div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="mt-[72px] mr-4 mb-4 h-[calc(100vh-72px)] w-full overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl sm:w-[480px]">
            <div className="flex justify-between"><h2 className="text-2xl font-extrabold">{selected.harvest_code}</h2><button type="button" onClick={() => setSelected(null)} aria-label="Close">✕</button></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p>Hive<br /><b>{selected.hive_code}</b></p><p>Location<br /><b>{selected.location}</b></p><p>Date<br /><b>{formatDate(selected.harvest_date)}</b></p><p>Quantity<br /><b>{selected.quantity_kg} kg</b></p><p>Quality<br /><b>{selected.quality}</b></p><p>Status<br /><b>{selected.status}</b></p><p>Sold from this harvest<br /><b>{selected.allocated_kg} kg</b></p>
            </div>
            <p className="mt-4 text-sm text-slate-600">{selected.notes || "No notes."}</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}
