"use client";

import { Settings } from "lucide-react";
import type { FarmSettingsWorkspace } from "@/actions/farm/workspace";
import { glassPanel, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { LanguagePreference } from "@/components/i18n/LanguagePreference";
import { useT } from "@/components/i18n/LocaleProvider";
import { FarmNotice, FarmPageHeader } from "@/components/farm/farm-ui";
import { translateFarmCopy } from "@/lib/farm/error-copy";

export function FarmSettingsPage({ initial }: { initial: { ok: true; workspace: FarmSettingsWorkspace } | { ok: false; error: string } }) {
  const t = useT();
  const workspace = initial.ok ? initial.workspace : null;
  const error = initial.ok ? null : initial.error;
  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={Settings} title={t("farm.settings.title")} subtitle={t("farm.settings.subtitle")} />
      <LanguagePreference />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}
      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold text-navy">{t("farm.settings.services")}</h2>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("rice.settings.code")}</th>
                <th className="px-3 py-2">{t("rice.settings.name")}</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.services ?? []).map((row) => (
                <tr key={row.id} className="border-t border-navy/5 text-navy">
                  <td className="px-3 py-2.5">{row.code}</td>
                  <td className="px-3 py-2.5">{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
