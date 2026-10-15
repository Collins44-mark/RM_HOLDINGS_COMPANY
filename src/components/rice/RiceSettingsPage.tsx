"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { loadRiceSettingsWorkspaceAction, type RiceSettingsWorkspace } from "@/actions/rice/workspace";
import { saveRiceItemAction } from "@/actions/rice/posting";
import { SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { LanguagePreference } from "@/components/i18n/LanguagePreference";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { formatKg, RiceField, RiceNotice, RicePageHeader, riceKindKey } from "@/components/rice/rice-ui";

export function RiceSettingsPage({
  initial,
}: {
  initial: { ok: true; workspace: RiceSettingsWorkspace } | { ok: false; error: string };
}) {
  const t = useT();
  const { locale } = useLocale();
  const [workspace, setWorkspace] = useState(initial.ok ? initial.workspace : null);
  const [error, setError] = useState(initial.ok ? null : initial.error);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", kind: "RICE" });

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader icon={Settings} title={t("rice.settings.title")} subtitle={t("rice.settings.subtitle")} />
      <LanguagePreference />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}

      {workspace?.caps.canSettings ? (
        <section className={glassPanel}>
          <h2 className="text-[16px] font-semibold text-navy">{t("rice.settings.add")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <RiceField label={t("rice.settings.code")}>
              <input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.settings.name")}>
              <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </RiceField>
            <RiceField label={t("rice.settings.kind")}>
              <select className={inputClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="PADDY">{t("rice.kind.PADDY")}</option>
                <option value="RICE">{t("rice.kind.RICE")}</option>
                <option value="BROKEN">{t("rice.kind.BROKEN")}</option>
                <option value="BYPRODUCT">{t("rice.kind.BYPRODUCT")}</option>
              </select>
            </RiceField>
          </div>
          <div className="mt-4">
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel={t("rice.settings.save")}
              busyLabel={t("rice.settings.saving")}
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
        <h2 className="text-[16px] font-semibold text-navy">{t("rice.settings.catalog")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.settings.code")}</th>
                <th className="px-3 py-2">{t("rice.settings.name")}</th>
                <th className="px-3 py-2">{t("rice.settings.kind")}</th>
                <th className="px-3 py-2">{t("rice.settings.onHand")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.items ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.code}</td>
                  <td className="px-3 py-2.5">{row.name}</td>
                  <td className="px-3 py-2.5">{t(riceKindKey(row.kind))}</td>
                  <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
