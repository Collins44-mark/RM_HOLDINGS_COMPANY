"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { HIVE_STATUSES, HIVE_TYPES, businessToday } from "@/lib/beekeeping/constants";
import type { BeeDirectory, BeeHive } from "@/lib/beekeeping/directory";
import { ActionMenu, ActionMenuItem, SaveButton, fieldClass, formatDate, overlayClass, placeActionMenu, saveJson, statusClass } from "../bee-ui";

export default function HivesView({ initial }: { initial: BeeDirectory }) {
  const [directory, setDirectory] = useState(initial);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<BeeHive | null>(null);
  const [selected, setSelected] = useState<BeeHive | null>(null);
  const [draft, setDraft] = useState({ hive_name: "", location: "", hive_type: "Langstroth", installation_date: businessToday(), status: "Empty", notes: "" });
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const rows = useMemo(() => directory.hives.filter((hive) => hive.status !== "Archived").filter((hive) => {
    const text = `${hive.hive_code} ${hive.hive_name} ${hive.location}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!status || hive.status === status) && (!location || hive.location === location);
  }), [directory.hives, query, status, location]);
  const list = useListPage(rows, `${query}|${status}|${location}`);
  const locations = [...new Set(directory.hives.map((hive) => hive.location).filter(Boolean))];
  const menuHive = directory.hives.find((hive) => hive.id === menu) || null;

  function openMenu(event: React.MouseEvent<HTMLButtonElement>, id: string, itemCount: number) {
    if (menu === id) {
      setMenu(null);
      return;
    }
    setMenuPos(placeActionMenu(event.currentTarget.getBoundingClientRect(), itemCount));
    setMenu(id);
  }

  const counts = {
    total: directory.hives.filter((hive) => hive.status !== "Archived").length,
    active: directory.hives.filter((hive) => hive.status === "Active").length,
    empty: directory.hives.filter((hive) => hive.status === "Empty").length,
    maintenance: directory.hives.filter((hive) => hive.status === "Maintenance").length,
  };

  function openCreate() {
    setEditing(null);
    setDraft({ hive_name: "", location: "", hive_type: "Langstroth", installation_date: businessToday(), status: "Empty", notes: "" });
    setMode("create");
    setSaveState("idle");
    setError("");
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setError("");
    try {
      const data = await saveJson(mode === "edit" && editing ? `/api/beekeeping/hives/${editing.id}` : "/api/beekeeping/hives", mode === "edit" ? "PATCH" : "POST", draft);
      setDirectory(data.directory);
      setSaveState("saved");
      setTimeout(() => setMode(null), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaveState("idle");
    }
  }

  async function archive(hive: BeeHive) {
    setMenu(null);
    const data = await saveJson(`/api/beekeeping/hives/${hive.id}`, "PATCH", { archive: true });
    setDirectory(data.directory);
    setSelected(null);
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Beehives</h1><p className="text-sm text-slate-500">Every hive registered for this business.</p></div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">+ Add Beehive</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total" value={counts.total} /><Card label="Active" value={counts.active} /><Card label="Empty" value={counts.empty} /><Card label="Maintenance" value={counts.maintenance} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search hives" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Status</option>{HIVE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Location</option>{locations.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">Hive ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Installed</th><th className="px-4 py-3">Harvested</th><th className="px-4 py-3">Last harvest</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No beehives yet.</td></tr> : list.rows.map((hive) => (
              <tr key={hive.id}>
                <td className="px-4 py-3 font-medium">{hive.hive_code}</td>
                <td className="px-4 py-3">{hive.hive_name || "—"}</td>
                <td className="px-4 py-3">{hive.location}</td>
                <td className="px-4 py-3">{hive.hive_type}</td>
                <td className="px-4 py-3">{formatDate(hive.installation_date)}</td>
                <td className="px-4 py-3">{hive.total_harvested} kg</td>
                <td className="px-4 py-3">{formatDate(hive.last_harvest)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(hive.status)}`}>{hive.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" aria-label="Hive actions" className="rounded-lg p-1 hover:bg-slate-100" onClick={(event) => openMenu(event, hive.id, 4)}><MoreVertical size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4"><PaginationBar page={list.page} total={rows.length} pageSize={list.pageSize} onPage={list.setPage} onPageSize={list.setPageSize} /></div>
      </div>
      {menuHive ? (
        <ActionMenu top={menuPos.top} left={menuPos.left} onClose={() => setMenu(null)}>
          <ActionMenuItem label="View Details" onClick={() => { setSelected(menuHive); setMenu(null); }} />
          <ActionMenuItem label="Edit Hive" onClick={() => { setEditing(menuHive); setDraft({ hive_name: menuHive.hive_name, location: menuHive.location, hive_type: menuHive.hive_type, installation_date: menuHive.installation_date, status: menuHive.status, notes: menuHive.notes }); setMode("edit"); setSaveState("idle"); setMenu(null); }} />
          <ActionMenuItem label="View Harvest History" onClick={() => { setSelected(menuHive); setMenu(null); }} />
          <ActionMenuItem label="Archive Hive" onClick={() => archive(menuHive)} />
        </ActionMenu>
      ) : null}

      {mode && (
        <div className={overlayClass} onClick={(event) => { if (event.target === event.currentTarget && saveState === "idle") setMode(null); }}>
          <form onSubmit={handleSave} className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-bold">{mode === "edit" ? "Edit Hive" : "Add Beehive"}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Hive ID<input readOnly value={mode === "edit" ? editing?.hive_code || "" : "Assigned on save"} className={`${fieldClass} bg-slate-50 text-slate-500`} /></label>
              <label className="text-sm">Hive name<input value={draft.hive_name} onChange={(event) => setDraft({ ...draft, hive_name: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Location / apiary<input required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Hive type<select value={draft.hive_type} onChange={(event) => setDraft({ ...draft, hive_type: event.target.value })} className={fieldClass}>{HIVE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm">Installation date<input required type="date" value={draft.installation_date} onChange={(event) => setDraft({ ...draft, installation_date: event.target.value })} className={fieldClass} /></label>
              <label className="text-sm">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className={fieldClass}>{HIVE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label className="mt-3 block text-sm">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} className={fieldClass} /></label>
            <div className="mt-4 flex gap-3"><SaveButton state={saveState} label="Save" /><button type="button" onClick={() => setMode(null)} className="rounded-xl border px-4 py-2">Cancel</button></div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <aside className="mt-[72px] mr-4 mb-4 h-[calc(100vh-72px)] w-full overflow-y-auto rounded-3xl border border-slate-100 bg-white p-8 shadow-2xl sm:w-[480px]">
            <div className="flex items-start justify-between"><div><h2 className="text-2xl font-extrabold">{selected.hive_code}</h2><p className="text-sm text-slate-500">{selected.location} · {selected.hive_type}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close">✕</button></div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <Info label="Name" value={selected.hive_name || "—"} /><Info label="Status" value={selected.status} /><Info label="Installed" value={formatDate(selected.installation_date)} /><Info label="Harvested" value={`${selected.total_harvested} kg`} /><Info label="Records" value={String(selected.harvest_count)} /><Info label="Last harvest" value={formatDate(selected.last_harvest)} /><Info label="Average" value={selected.harvest_count ? `${Math.round((selected.total_harvested / selected.harvest_count) * 1000) / 1000} kg` : "—"} />
            </div>
            <p className="mt-4 text-sm text-slate-600">{selected.notes || "No notes."}</p>
            <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">Harvest history</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {directory.harvests.filter((harvest) => harvest.hive_id === selected.id && harvest.status === "Valid").map((harvest) => <li key={harvest.id} className="flex justify-between"><span>{harvest.harvest_code} · {formatDate(harvest.harvest_date)}</span><span>{harvest.quantity_kg} kg · {harvest.quality}</span></li>)}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="font-medium text-slate-800">{value}</p></div>;
}
