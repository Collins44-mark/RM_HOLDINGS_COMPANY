"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { loadRiceSettingsWorkspaceAction, type RiceSettingsWorkspace } from "@/actions/rice/workspace";
import { saveRiceItemAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatKg, RiceField, RiceNotice, RicePageHeader } from "@/components/rice/rice-ui";

export function RiceSettingsPage({
  initial,
}: {
  initial: { ok: true; workspace: RiceSettingsWorkspace } | { ok: false; error: string };
}) {
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", kind: "RICE" });

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Settings} title="Settings" subtitle="Rice grades and by-product catalog. Adding an item does not create stock." />
      {error ? <RiceNotice>{error}</RiceNotice> : null}

      {workspace?.caps.canSettings ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">Add item</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label="Code">
              <input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </RiceField>
            <RiceField label="Name">
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </RiceField>
            <RiceField label="Kind">
              <select className={inputClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="PADDY">Paddy</option>
                <option value="RICE">Rice</option>
                <option value="BROKEN">Broken rice</option>
                <option value="BYPRODUCT">By-product</option>
              </select>
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Save item"
              busyLabel="Saving…"
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await saveRiceItemAction(form);
                setBusy(false);
                if (!result.ok) setError(result.error);
                else {
                  const next = await loadRiceSettingsWorkspaceAction();
                  if (next.ok) setWorkspace(next.workspace);
                  setForm({ code: "", name: "", kind: "RICE" });
                }
              }}
            />
          </div>
        </section>
      ) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">Catalog</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">On hand</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.items ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.code}</td>
                  <td className="px-3 py-2.5">{row.name}</td>
                  <td className="px-3 py-2.5">{row.kind}</td>
                  <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
