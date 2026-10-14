"use client";

import { FileText } from "lucide-react";
import type { RiceReportsWorkspace } from "@/actions/rice/workspace";
import { glassPanel, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { downloadRiceReportsPdf } from "@/lib/rice/reports-pdf";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { formatKg, RiceNotice, RicePageHeader } from "@/components/rice/rice-ui";

export function RiceReportsPage({
  initial,
  period,
}: {
  initial: { ok: true; workspace: RiceReportsWorkspace } | { ok: false; error: string };
  period: ReportPeriod;
}) {
  const workspace = initial.ok ? initial.workspace : null;
  const error = initial.ok ? null : initial.error;
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={FileText}
        title={t("rice.reports.title")}
        subtitle={t("rice.reports.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{error}</RiceNotice> : null}
      {workspace ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={() => downloadRiceReportsPdf(workspace, locale)}>
              {t("rice.reports.pdf")}
            </button>
          </div>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.reports.totals")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13.5px] md:grid-cols-4">
              <Row label={t("rice.purchases.title")} value={formatTzs(workspace.summary.purchasesTotal)} />
              <Row label={t("rice.finance.sales")} value={formatTzs(workspace.summary.salesTotal)} />
              <Row label={t("rice.finance.service")} value={formatTzs(workspace.summary.serviceIncome)} />
              <Row label={t("rice.finance.cogs")} value={formatTzs(workspace.summary.cogs)} />
              <Row label={t("rice.finance.loss")} value={formatTzs(workspace.summary.productionLoss)} />
              <Row label={t("rice.finance.expenses")} value={formatTzs(workspace.summary.expenses)} />
              <Row label={t("rice.finance.inventory")} value={formatTzs(workspace.summary.inventoryValue)} />
              <Row label={t("rice.finance.payables")} value={formatTzs(workspace.summary.payables)} />
              <Row label={t("rice.finance.receivables")} value={formatTzs(workspace.summary.receivables)} />
              <Row label={t("rice.finance.net")} value={formatTzs(workspace.summary.netProfit)} />
            </dl>
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.reports.inventory")}</h2>
            <div className={`${tableScrollClass} mt-4`}>
              <table className="min-w-full text-left text-[13.5px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.items.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">{row.name}</td>
                      <td className="px-3 py-2.5">{row.kind}</td>
                      <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                      <td className="px-3 py-2.5">{formatTzs(row.valueTzs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">Customer storage balances</h2>
            <div className={`${tableScrollClass} mt-4`}>
              <table className="min-w-full text-left text-[13.5px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.accounts.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={2}>
                        No customer storage balances.
                      </td>
                    </tr>
                  ) : (
                    workspace.accounts.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.partyName}</td>
                        <td className="px-3 py-2.5">{formatKg(row.qtyKg)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-navy">{value}</dd>
    </div>
  );
}
