import { StatusPill } from "@/components/dashboard/StatusPill";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import {
  ReportMetricCard,
  ReportResultHeader,
  ReportSurface,
} from "@/components/reports/report-ui";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { ConsolidatedReport } from "@/lib/data/reports";

export function GroupOverviewReport({ report }: { report: ConsolidatedReport }) {
  return (
    <div className="space-y-5">
      <ReportResultHeader
        moduleLabel="All Business Units / Group"
        title="Group Overview"
        description="Consolidated sales and expense summary across business units."
      />
      <ReportSurface className="px-5 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetricCard label="Total Revenue" value={formatTzs(report.sales.totalRevenue)} />
          <ReportMetricCard label="Number of Sales" value={String(report.sales.salesCount)} />
          <ReportMetricCard
            label="Supermarket Revenue"
            value={formatTzs(report.sales.supermarketRevenue)}
            hint={`${report.sales.supermarketSalesCount} supermarket sales`}
          />
          <ReportMetricCard
            label="Total Expenses"
            value={formatTzs(report.expenses.totalExpenses)}
          />
        </div>
      </ReportSurface>
    </div>
  );
}

export function GroupFinancialReport({ report }: { report: ConsolidatedReport }) {
  const pl = report.profitAndLoss;
  return (
    <div className="space-y-5">
      <ReportResultHeader
        moduleLabel="All Business Units / Group"
        title="Consolidated Financial Report"
        description="Profit & loss and cash movement from live consolidated ledgers."
      />
      <ReportSurface className="px-5 py-5">
        <div className="max-w-xl space-y-0">
          {[
            ["Revenue", formatTzs(pl.revenue)],
            ["COGS", formatTzs(pl.cogs)],
            ["Product Profit", formatTzs(pl.productProfit)],
            ["Operating Expenses", formatTzs(pl.operatingExpenses)],
            ["Operating Position", formatTzs(pl.operatingPosition)],
            ["Profit Margin", formatPercent(pl.margin)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b border-black/[0.04] py-3 last:border-0"
            >
              <span className="text-[13.5px] text-slate-600">{label}</span>
              <span className="text-[13.5px] font-semibold tabular-nums text-navy">{value}</span>
            </div>
          ))}
        </div>
      </ReportSurface>

      <ReportSurface className="px-5 py-5">
        <p className="mb-4 text-[14px] font-semibold text-navy">Payment / Cash Summary</p>
        {report.cash.available ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ReportMetricCard label="Cash" value={formatTzs(report.cash.cash)} />
            <ReportMetricCard label="Mobile Money" value={formatTzs(report.cash.mobileMoney)} />
            <ReportMetricCard label="Card" value={formatTzs(report.cash.card)} />
            <ReportMetricCard label="Bank" value={formatTzs(report.cash.bank)} />
            <ReportMetricCard
              label="Net Cash Movement"
              value={formatTzs(report.cash.total)}
              hint={`${report.cash.paymentCount} payments`}
            />
          </div>
        ) : (
          <p className="text-[13.5px] text-slate-500">Not available</p>
        )}
      </ReportSurface>
    </div>
  );
}

export function GroupPerformanceReport({ report }: { report: ConsolidatedReport }) {
  return (
    <div className="space-y-5">
      <ReportResultHeader
        moduleLabel="All Business Units / Group"
        title="Business Performance"
        description="Revenue, expenses and operating position by business unit."
      />
      <ReportSurface className="overflow-x-auto px-5 py-4">
        <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Business Unit</th>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Revenue</th>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Expenses</th>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Operating Position</th>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Margin</th>
              <th className="pb-3 text-[12.5px] font-medium text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.businessUnits.map((row) => (
              <tr key={row.code}>
                <td className="border-t border-black/[0.04] py-3.5 pr-4">
                  <div className="flex items-center gap-2.5">
                    <ModuleIcon code={row.code} className="h-[16px] w-[16px] text-navy" />
                    <span className="text-[13.5px] font-semibold text-navy">{row.name}</span>
                  </div>
                </td>
                <td className="border-t border-black/[0.04] py-3.5 text-[13.5px] font-medium tabular-nums text-navy">
                  {formatTzs(row.revenue)}
                </td>
                <td className="border-t border-black/[0.04] py-3.5 text-[13.5px] font-medium tabular-nums text-navy">
                  {formatTzs(row.expenses)}
                </td>
                <td className="border-t border-black/[0.04] py-3.5 text-[13.5px] font-semibold tabular-nums text-navy">
                  {formatTzs(row.operatingPosition)}
                </td>
                <td className="border-t border-black/[0.04] py-3.5 text-[13.5px] font-medium tabular-nums text-navy">
                  {formatPercent(row.margin)}
                </td>
                <td className="border-t border-black/[0.04] py-3.5">
                  <StatusPill status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSurface>
    </div>
  );
}
