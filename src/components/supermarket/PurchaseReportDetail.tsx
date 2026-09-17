"use client";

import { useMemo } from "react";
import { formatTzs } from "@/lib/format/currency";
import { buildPurchaseReportData } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import {
  DesktopTable,
  ReportPageHeader,
  ReportSection,
  StatusPill,
  SummarySection,
  useReportPeriod,
} from "@/components/supermarket/report-shell";

export function PurchaseReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/purchases");
  const data = useMemo(() => buildPurchaseReportData(preset, range), [preset, range]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <ReportPageHeader
        title="Purchase Report"
        query={query}
        periodLabel={period.label}
        preset={preset}
        range={range}
        onPreset={onPreset}
        onRange={onRange}
        onExport={() => downloadReportPdf("purchases", preset, range)}
      />

      <SummarySection
        title="Purchase Summary"
        items={[
          { label: "Total Purchases", value: formatTzs(data.totalPurchases) },
          { label: "Purchase Orders", value: data.purchaseCount.toLocaleString("en-US") },
          { label: "Items Purchased", value: data.itemsPurchased.toLocaleString("en-US") },
          { label: "Outstanding", value: formatTzs(data.outstanding) },
        ]}
      />

      <ReportSection title="Purchases">
        <DesktopTable
          headers={["PO Number", "Supplier", "Date", "Items", "Amount", "Payment Status", "Status"]}
          minWidth="760px"
        >
          {data.purchases.map((row) => (
            <tr key={row.number} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-semibold text-navy">{row.number}</td>
              <td className="px-3 py-3 text-slate-500">{row.supplier}</td>
              <td className="px-3 py-3 text-slate-500">{row.date}</td>
              <td className="px-3 py-3 text-slate-500">{row.items}</td>
              <td className="px-3 py-3 font-semibold text-navy">{formatTzs(row.amount)}</td>
              <td className="px-3 py-3">
                <StatusPill value={row.paymentStatus} />
              </td>
              <td className="py-3 pl-3 pr-5">
                <StatusPill value={row.status} />
              </td>
            </tr>
          ))}
          {data.purchases.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                No purchases in this period.
              </td>
            </tr>
          ) : null}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.purchases.map((row) => (
            <li key={row.number} className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{row.number}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {row.supplier} · {row.date} · {row.items} items
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-navy">{formatTzs(row.amount)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill value={row.paymentStatus} />
                <StatusPill value={row.status} />
              </div>
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title="Supplier Summary">
        <DesktopTable headers={["Supplier", "Purchases", "Paid", "Outstanding"]} minWidth="520px">
          {data.suppliers.map((row) => (
            <tr key={row.name} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.name}</td>
              <td className="px-3 py-3 font-semibold text-navy">{formatTzs(row.purchases)}</td>
              <td className="px-3 py-3 text-slate-500">{formatTzs(row.paid)}</td>
              <td className="py-3 pl-3 pr-5 text-slate-500">{formatTzs(row.outstanding)}</td>
            </tr>
          ))}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.suppliers.map((row) => (
            <li key={row.name} className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
              <p className="font-semibold text-navy">{row.name}</p>
              <p className="mt-1.5 text-[12.5px] text-slate-500">
                Purchases {formatTzs(row.purchases)} · Paid {formatTzs(row.paid)} · Outstanding{" "}
                {formatTzs(row.outstanding)}
              </p>
            </li>
          ))}
        </ul>
      </ReportSection>
    </div>
  );
}
