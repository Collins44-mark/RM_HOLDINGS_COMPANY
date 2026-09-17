"use client";

import { useMemo } from "react";
import { formatTzs } from "@/lib/format/currency";
import { buildInventoryReportData } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import {
  DesktopTable,
  ReportPageHeader,
  ReportSection,
  StatusPill,
  SummarySection,
  useReportPeriod,
} from "@/components/supermarket/report-shell";

export function InventoryReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/inventory");
  const data = useMemo(() => buildInventoryReportData(preset, range), [preset, range]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <ReportPageHeader
        title="Inventory Report"
        query={query}
        periodLabel={period.label}
        preset={preset}
        range={range}
        onPreset={onPreset}
        onRange={onRange}
        onExport={() => downloadReportPdf("inventory", preset, range)}
      />

      <SummarySection
        title="Inventory Summary"
        items={[
          { label: "Total Products", value: data.totalProducts.toLocaleString("en-US") },
          { label: "Total Stock Units", value: data.totalStockUnits.toLocaleString("en-US") },
          { label: "Inventory Value", value: formatTzs(data.totalInventoryValue) },
          { label: "Low Stock", value: data.lowStock.toLocaleString("en-US") },
        ]}
      />

      <ReportSection title="Stock Movement">
        <DesktopTable headers={["Movement", "Count"]} minWidth="360px">
          {data.movements.map((row) => (
            <tr key={row.label} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.label}</td>
              <td className="py-3 pl-3 pr-5 font-semibold text-navy">{row.count.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.movements.map((row) => (
            <li key={row.label} className="flex justify-between rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-2.5 text-[13px]">
              <span className="text-slate-600">{row.label}</span>
              <span className="font-semibold text-navy">{row.count}</span>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Low Stock Products">
        <DesktopTable headers={["Product", "Current Stock", "Reorder Level", "Stock Value", "Status"]} minWidth="680px">
          {data.lowStockProducts.map((row) => (
            <tr key={row.sku} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.name}</td>
              <td className="px-3 py-3 text-slate-500">{row.stock}</td>
              <td className="px-3 py-3 text-slate-500">{row.reorderLevel}</td>
              <td className="px-3 py-3 font-semibold text-navy">{formatTzs(row.value)}</td>
              <td className="py-3 pl-3 pr-5">
                <StatusPill value={row.status} />
              </td>
            </tr>
          ))}
          {data.lowStockProducts.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                No low-stock products.
              </td>
            </tr>
          ) : null}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.lowStockProducts.map((row) => (
            <li key={row.sku} className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold text-navy">{row.name}</p>
                <StatusPill value={row.status} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-slate-500">
                Stock {row.stock} · Reorder {row.reorderLevel} · {formatTzs(row.value)}
              </p>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Inventory Valuation">
        <DesktopTable headers={["Product", "Quantity", "Buying Price", "Stock Value"]} minWidth="560px">
          {data.valuation.map((row) => (
            <tr key={row.name} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.name}</td>
              <td className="px-3 py-3 text-slate-500">{row.quantity}</td>
              <td className="px-3 py-3 text-slate-500">{formatTzs(row.buyingPrice)}</td>
              <td className="py-3 pl-3 pr-5 font-semibold text-navy">{formatTzs(row.stockValue)}</td>
            </tr>
          ))}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.valuation.map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-navy">{row.name}</p>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  {row.quantity} × {formatTzs(row.buyingPrice)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-navy">{formatTzs(row.stockValue)}</p>
            </li>
          ))}
        </ul>
      </ReportSection>
    </div>
  );
}
