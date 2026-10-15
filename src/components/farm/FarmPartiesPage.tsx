"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { loadFarmPartiesWorkspaceAction, type FarmPartiesWorkspace } from "@/actions/farm/workspace";
import { saveFarmPartyAction } from "@/actions/farm/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { useT } from "@/components/i18n/LocaleProvider";
import { FarmField, FarmNotice, FarmPageHeader } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";

export function FarmPartiesPage({
  initial,
  kind,
}: {
  initial: { ok: true; workspace: FarmPartiesWorkspace } | { ok: false; error: string };
  kind: "CUSTOMER" | "SUPPLIER";
}) {
  const t = useT();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const title = kind === "CUSTOMER" ? t("farm.customers.title") : t("farm.suppliers.title");

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Users} title={title} subtitle={t("farm.parties.subtitle")} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}
      {workspace?.caps.canParties ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.parties.add")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FarmField label={t("profile.fullName")}>
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </FarmField>
            <FarmField label={t("common.phone")}>
              <input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </FarmField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel={t("common.record")} busyLabel={t("common.posting")} onClick={async () => {
              setBusy(true); setError(null);
              const result = await saveFarmPartyAction({ kind, ...form });
              setBusy(false);
              if (!result.ok) setError(result.error);
              else {
                const next = await loadFarmPartiesWorkspaceAction(kind);
                if (next.ok) setWorkspace(next.workspace);
                setForm({ name: "", phone: "", notes: "" });
              }
            }} />
          </div>
        </section>
      ) : null}
      <section className={glassPanel}>
        <div className={`${tableScrollClass}`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("profile.fullName")}</th>
                <th className="px-3 py-2">{t("common.phone")}</th>
                <th className="px-3 py-2">{t("rice.purchases.no")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.parties ?? []).length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={3}>{t("farm.parties.empty")}</td></tr>
              ) : (workspace?.parties ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.name}</td>
                  <td className="px-3 py-2.5">{row.phone ?? "—"}</td>
                  <td className="px-3 py-2.5">{row.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
