import { StatusPill } from "@/components/dashboard/StatusPill";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent } from "@/lib/format/percent";
import type { ConsolidatedReport } from "@/lib/data/reports";

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[16px] border border-black/[0.04] bg-white px-4 py-4 shadow-card">
      <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-black/[0.04] bg-white shadow-card">
      <div className="border-b border-black/[0.04] px-5 py-4">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-navy">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-slate-500">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function PlRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-black/[0.04] py-3 last:border-0 ${
        emphasize ? "font-semibold text-navy" : "text-slate-600"
      }`}
    >
      <span className="text-[13.5px]">{label}</span>
      <span className={`text-[13.5px] tabular-nums ${emphasize ? "text-navy" : "text-navy"}`}>
        {value}
      </span>
    </div>
  );
}

export function GroupReportsView({ report }: { report: ConsolidatedReport }) {
  const { sales, expenses, profitAndLoss, businessUnits, cash } = report;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Consolidated Sales"
        description="Group revenue and transaction count for the selected period."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Revenue" value={formatTzs(sales.totalRevenue)} />
          <MetricCard label="Number of Sales" value={String(sales.salesCount)} />
          <MetricCard
            label="Supermarket Revenue"
            value={formatTzs(sales.supermarketRevenue)}
            hint={`${sales.supermarketSalesCount} supermarket sales`}
          />
          <MetricCard
            label="Other Units Revenue"
            value={formatTzs(0)}
            hint="No live ledgers yet"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Consolidated Expenses"
        description="Operating expenses across business units."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Total Expenses" value={formatTzs(expenses.totalExpenses)} />
          <MetricCard label="Supermarket Expenses" value={formatTzs(expenses.supermarketExpenses)} />
          <MetricCard
            label="Other Units Expenses"
            value={formatTzs(0)}
            hint="No live ledgers yet"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Profit & Loss"
        description="Same Phase 1 formula as Group Finance: Revenue − COGS − Operating Expenses."
      >
        <div className="max-w-xl">
          <PlRow label="Revenue" value={formatTzs(profitAndLoss.revenue)} />
          <PlRow label="COGS" value={formatTzs(profitAndLoss.cogs)} />
          <PlRow label="Product Profit" value={formatTzs(profitAndLoss.productProfit)} />
          <PlRow label="Operating Expenses" value={formatTzs(profitAndLoss.operatingExpenses)} />
          <PlRow
            label="Operating Position"
            value={formatTzs(profitAndLoss.operatingPosition)}
            emphasize
          />
          <PlRow label="Profit Margin" value={formatPercent(profitAndLoss.margin)} emphasize />
        </div>
      </SectionCard>

      <SectionCard
        title="Business Performance"
        description="Revenue, expenses and operating position by business unit."
      >
        <div className="overflow-x-auto">
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
              {businessUnits.map((row) => (
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
        </div>
      </SectionCard>

      <SectionCard
        title="Payment / Cash Summary"
        description="Supermarket cash movements for the selected period (IN minus OUT by method)."
      >
        {cash.available ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Cash" value={formatTzs(cash.cash)} />
            <MetricCard label="Mobile Money" value={formatTzs(cash.mobileMoney)} />
            <MetricCard label="Card" value={formatTzs(cash.card)} />
            <MetricCard label="Bank" value={formatTzs(cash.bank)} />
            <MetricCard
              label="Net Cash Movement"
              value={formatTzs(cash.total)}
              hint={`${cash.paymentCount} payments`}
            />
          </div>
        ) : (
          <p className="text-[13.5px] text-slate-500">Not available</p>
        )}
      </SectionCard>
    </div>
  );
}
