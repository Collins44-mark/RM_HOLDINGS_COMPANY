"use client";

import { FileText } from "lucide-react";
import type { RiceReportsWorkspace } from "@/actions/rice/workspace";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import { glassPanel, primaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { downloadRiceReportsPdf } from "@/lib/rice/reports-pdf";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { translateRiceCopy } from "@/lib/rice/error-copy";
import { formatKg, RiceNotice, RicePageHeader, riceKindKey } from "@/components/rice/rice-ui";

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
  const items = workspace?.items ?? [];
  const accounts = workspace?.accounts ?? [];
  const loans = workspace?.loans.loans ?? [];
  const movements = workspace?.loans.movements ?? [];
  const itemPage = useListPage(items, `${period}:${items.length}`);
  const accountPage = useListPage(accounts, `${period}:${accounts.length}`);
  const loanPage = useListPage(loans, `${period}:${loans.length}`);
  const movementPage = useListPage(movements, `${period}:${movements.length}`);

  return (
    <div className="space-y-5 pb-10">
      <RicePageHeader
        icon={FileText}
        title={t("rice.reports.title")}
        subtitle={t("rice.reports.subtitle")}
        period={period}
        periodLabel={workspace?.periodLabel ?? ""}
      />
      {error ? <RiceNotice>{translateRiceCopy(t, error)}</RiceNotice> : null}
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
                    <th className="px-3 py-2">{t("common.item")}</th>
                    <th className="px-3 py-2">{t("rice.settings.kind")}</th>
                    <th className="px-3 py-2">{t("common.quantity")}</th>
                    <th className="px-3 py-2">{t("common.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {itemPage.rows.map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">{row.name}</td>
                      <td className="px-3 py-2.5">{t(riceKindKey(row.kind))}</td>
                      <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                      <td className="px-3 py-2.5">{formatTzs(row.valueTzs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={itemPage.page} total={items.length} pageSize={itemPage.pageSize} onPage={itemPage.setPage} onPageSize={itemPage.setPageSize} />
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.reports.storage")}</h2>
            <div className={`${tableScrollClass} mt-4`}>
              <table className="min-w-full text-left text-[13.5px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2">{t("rice.storage.customer")}</th>
                    <th className="px-3 py-2">{t("rice.storage.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={2}>
                        {t("rice.reports.storageEmpty")}
                      </td>
                    </tr>
                  ) : (
                    accountPage.rows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.partyName}</td>
                        <td className="px-3 py-2.5">{formatKg(row.qtyKg, locale)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar page={accountPage.page} total={accounts.length} pageSize={accountPage.pageSize} onPage={accountPage.setPage} onPageSize={accountPage.setPageSize} />
          </section>
          <section className={glassPanel}>
            <h2 className="text-[16px] font-semibold text-navy">{t("rice.reports.loans")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13.5px] md:grid-cols-3">
              <Row label={t("rice.reports.disbursed")} value={formatTzs(workspace.loans.disbursed)} />
              <Row label={t("rice.reports.repaid")} value={formatTzs(workspace.loans.repaid)} />
              <Row label={t("rice.reports.outstanding")} value={formatTzs(workspace.loans.outstanding)} />
            </dl>
            <div className={`${tableScrollClass} mt-4`}>
              <table className="min-w-full text-left text-[13.5px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2">{t("rice.reports.loan")}</th>
                    <th className="px-3 py-2">{t("rice.reports.farmer")}</th>
                    <th className="px-3 py-2">{t("rice.reports.disbursed")}</th>
                    <th className="px-3 py-2">{t("rice.reports.repaid")}</th>
                    <th className="px-3 py-2">{t("rice.reports.outstanding")}</th>
                    <th className="px-3 py-2">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={6}>
                        {t("rice.reports.loansEmpty")}
                      </td>
                    </tr>
                  ) : (
                    loanPage.rows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.number}</td>
                        <td className="px-3 py-2.5">{row.farmerName}</td>
                        <td className="px-3 py-2.5">{formatTzs(row.disbursed)}</td>
                        <td className="px-3 py-2.5">{formatTzs(row.principalRepaid)}</td>
                        <td className="px-3 py-2.5">{formatTzs(row.outstanding)}</td>
                        <td className="px-3 py-2.5">{loanStatusLabel(t, row.status, row.outstanding, row.disbursed)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar page={loanPage.page} total={loans.length} pageSize={loanPage.pageSize} onPage={loanPage.setPage} onPageSize={loanPage.setPageSize} />
            <h3 className="mt-6 text-[15px] font-semibold text-navy">{t("rice.reports.loanMovements")}</h3>
            <div className={`${tableScrollClass} mt-4`}>
              <table className="min-w-full text-left text-[13.5px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2">{t("common.date")}</th>
                    <th className="px-3 py-2">{t("rice.reports.loan")}</th>
                    <th className="px-3 py-2">{t("rice.reports.farmer")}</th>
                    <th className="px-3 py-2">{t("common.type")}</th>
                    <th className="px-3 py-2">{t("common.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={5}>
                        {t("rice.reports.loanMovementsEmpty")}
                      </td>
                    </tr>
                  ) : (
                    movementPage.rows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-navy">
                        <td className="px-3 py-2.5">{row.date}</td>
                        <td className="px-3 py-2.5">{row.number}</td>
                        <td className="px-3 py-2.5">{row.farmerName}</td>
                        <td className="px-3 py-2.5">{row.kind === "DISBURSEMENT" ? t("rice.reports.loanGiven") : t("rice.reports.repayment")}</td>
                        <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar page={movementPage.page} total={movements.length} pageSize={movementPage.pageSize} onPage={movementPage.setPage} onPageSize={movementPage.setPageSize} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function loanStatusLabel(t: (key: "rice.reports.loanApproved" | "rice.reports.loanRepaid" | "rice.reports.loanActive") => string, status: string, outstanding: number, disbursed: number) {
  if (disbursed <= 0 && status !== "CLOSED") return t("rice.reports.loanApproved");
  if (outstanding <= 0) return t("rice.reports.loanRepaid");
  if (status === "ACTIVE") return t("rice.reports.loanActive");
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-navy">{value}</dd>
    </div>
  );
}
