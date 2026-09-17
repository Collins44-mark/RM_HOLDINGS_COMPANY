"use client";

import { useMemo, useState } from "react";
import { formatTzs } from "@/lib/format/currency";
import { buildSalesReportData } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import { saleTotal, type SupermarketSale } from "@/lib/data/sample-supermarket-sales";
import {
  DesktopTable,
  ReportPageHeader,
  ReportSection,
  StatusPill,
  SummarySection,
  reportGlass,
  useReportPeriod,
} from "@/components/supermarket/report-shell";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

function SaleDetailsPanel({ sale, onClose }: { sale: SupermarketSale; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-[#0b2244]/30" aria-label="Close" onClick={onClose} />
      <aside className={cn(reportGlass, "relative z-10 max-h-[88vh] w-full max-w-lg overflow-hidden")}>
        <div className="flex items-start justify-between gap-3 border-b border-white/55 px-4 py-4 sm:px-5">
          <div>
            <p className="text-[12px] text-slate-500">Sale Details</p>
            <h3 className="mt-1 text-[18px] font-semibold text-navy">#{sale.id}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-navy" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill value={sale.status} />
            <p className="text-[12.5px] text-slate-500">
              {sale.dateLabel} · {sale.timeLabel}
            </p>
          </div>
          <p className="text-[13px] text-slate-500">
            {sale.cashier} · {sale.payment} · {sale.itemsCount} items
          </p>
          <ul className="space-y-2">
            {sale.lines.map((item, index) => (
              <li key={`${sale.id}-${item.name}-${index}`} className="flex justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-slate-600">
                  {item.name} × {item.quantity}
                </span>
                <span className="shrink-0 font-semibold text-navy">{formatTzs(item.quantity * item.unitPrice)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-white/60 pt-3 text-[14px] font-semibold text-navy">
            <div className="flex justify-between">
              <span>Total</span>
              <span>{formatTzs(saleTotal(sale))}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function SalesReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/sales");
  const data = useMemo(() => buildSalesReportData(preset, range), [preset, range]);
  const [selectedSale, setSelectedSale] = useState<SupermarketSale | null>(null);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <ReportPageHeader
        title="Sales Report"
        query={query}
        periodLabel={period.label}
        preset={preset}
        range={range}
        onPreset={onPreset}
        onRange={onRange}
        onExport={() => downloadReportPdf("sales", preset, range)}
      />

      <SummarySection
        title="Sales Summary"
        items={[
          { label: "Total Revenue", value: formatTzs(data.totalRevenue) },
          { label: "Transactions", value: data.totalTransactions.toLocaleString("en-US") },
          { label: "Items Sold", value: data.itemsSold.toLocaleString("en-US") },
          { label: "Returns", value: formatTzs(data.returnsAmount) },
        ]}
      />

      <ReportSection title="Sales Transactions" subtitle={`${data.sales.length} transactions`}>
        <DesktopTable headers={["Invoice", "Date", "Cashier", "Items", "Payment", "Amount", "Status"]} minWidth="720px">
          {data.sales.slice(0, 40).map((sale) => (
            <tr key={sale.id} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3">
                <button type="button" onClick={() => setSelectedSale(sale)} className="font-semibold text-navy hover:underline">
                  #{sale.id}
                </button>
              </td>
              <td className="px-3 py-3 text-slate-500">
                {sale.dateLabel} {sale.timeLabel}
              </td>
              <td className="px-3 py-3 text-slate-500">{sale.cashier}</td>
              <td className="px-3 py-3 text-slate-500">{sale.itemsCount}</td>
              <td className="px-3 py-3 text-slate-500">{sale.payment}</td>
              <td className="px-3 py-3 font-semibold text-navy">{formatTzs(sale.amount)}</td>
              <td className="py-3 pl-3 pr-5">
                <StatusPill value={sale.status} />
              </td>
            </tr>
          ))}
          {data.sales.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                No sales in this period.
              </td>
            </tr>
          ) : null}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.sales.slice(0, 40).map((sale) => (
            <li key={sale.id}>
              <button
                type="button"
                onClick={() => setSelectedSale(sale)}
                className="w-full rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">#{sale.id}</p>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      {sale.dateLabel} · {sale.cashier} · {sale.payment}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-navy">{formatTzs(sale.amount)}</p>
                    <div className="mt-1.5 flex justify-end">
                      <StatusPill value={sale.status} />
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </ReportSection>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ReportSection title="Payment Methods">
          <ul className="space-y-2.5 px-4 pb-4 sm:px-5">
            {data.paymentBreakdown.map((row) => (
              <li key={row.method} className="flex items-center justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{row.method}</p>
                  <p className="text-[12px] text-slate-500">{row.count} transactions</p>
                </div>
                <p className="shrink-0 font-semibold text-navy">{formatTzs(row.amount)}</p>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title="Top Selling Products">
          <DesktopTable headers={["Product", "Quantity Sold", "Revenue"]} minWidth="420px">
            {data.topProducts.map((row) => (
              <tr key={row.name} className="border-t border-white/55">
                <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.name}</td>
                <td className="px-3 py-3 text-slate-500">{row.quantity.toLocaleString("en-US")}</td>
                <td className="py-3 pl-3 pr-5 font-semibold text-navy">{formatTzs(row.revenue)}</td>
              </tr>
            ))}
          </DesktopTable>
          <ul className="space-y-2 px-4 pb-4 md:hidden">
            {data.topProducts.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/70 bg-white/45 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-navy">{row.name}</p>
                  <p className="text-[12px] text-slate-500">{row.quantity} sold</p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold text-navy">{formatTzs(row.revenue)}</p>
              </li>
            ))}
          </ul>
        </ReportSection>
      </div>

      {selectedSale ? <SaleDetailsPanel sale={selectedSale} onClose={() => setSelectedSale(null)} /> : null}
    </div>
  );
}
