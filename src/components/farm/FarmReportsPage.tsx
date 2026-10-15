"use client";

import { FileText } from "lucide-react";
import type { FarmReportsWorkspace } from "@/actions/farm/workspace";
import { glassPanel, primaryButton } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { FarmNotice, FarmPageHeader } from "@/components/farm/farm-ui";
import { downloadFarmReportsPdf } from "@/lib/farm/reports-pdf";
import { translateFarmCopy } from "@/lib/farm/error-copy";

export function FarmReportsPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: FarmReportsWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const workspace = initial.ok ? initial.workspace : null;
  const error = initial.ok ? null : initial.error;
  const t = useT();
  const { locale } = useLocale();
  const summary = workspace?.summary;

  return (
    <div className="space-y-5 pb-10">
      <FarmPageHeader icon={FileText} title={t("farm.reports.title")} subtitle={t("farm.reports.subtitle")} period={period} periodLabel={workspace?.periodLabel ?? ""} />
      {error ? <FarmNotice>{translateFarmCopy(t, error)}</FarmNotice> : null}
      {workspace ? (
        <>
          <button type="button" className={primaryButton} onClick={() => downloadFarmReportsPdf(workspace, locale)}>
            {t("rice.reports.pdf")}
          </button>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.reports.totals")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13.5px] md:grid-cols-4">
              <div><dt className="text-slate-400">{t("farm.kpi.income")}</dt><dd className="font-semibold text-navy">{formatTzs(summary?.serviceIncome ?? 0)}</dd></div>
              <div><dt className="text-slate-400">{t("farm.finance.receivables")}</dt><dd className="font-semibold text-navy">{formatTzs(summary?.receivables ?? 0)}</dd></div>
              <div><dt className="text-slate-400">{t("rice.finance.expenses")}</dt><dd className="font-semibold text-navy">{formatTzs(summary?.expenses ?? 0)}</dd></div>
              <div><dt className="text-slate-400">{t("rice.finance.net")}</dt><dd className="font-semibold text-navy">{formatTzs(summary?.netProfit ?? 0)}</dd></div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
