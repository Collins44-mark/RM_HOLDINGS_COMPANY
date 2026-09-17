"use client";

import { useMemo } from "react";
import { formatTzs } from "@/lib/format/currency";
import { buildProfitLossReportData } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import {
  DesktopTable,
  ReportPageHeader,
  ReportSection,
  reportGlass,
  useReportPeriod,
} from "@/components/supermarket/report-shell";
import { cn } from "@/lib/cn";

function LineRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "strong" | "result";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2.5",
        tone === "result" && "border-t border-white/70 pt-3",
        tone === "strong" && "border-t border-white/55 pt-3",
      )}
    >
      <p
        className={cn(
          "text-[13.5px]",
          tone === "muted" && "text-slate-500",
          tone === "default" && "text-navy",
          (tone === "strong" || tone === "result") && "font-semibold text-navy",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "shrink-0 text-[13.5px] tabular-nums",
          tone === "muted" && "text-slate-500",
          tone === "default" && "font-medium text-navy",
          (tone === "strong" || tone === "result") && "font-semibold text-navy",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ProfitLossReportDetail() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports/profit-loss");
  const data = useMemo(() => buildProfitLossReportData(preset, range), [preset, range]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <ReportPageHeader
        title="Profit & Loss"
        query={query}
        periodLabel={period.label}
        preset={preset}
        range={range}
        onPreset={onPreset}
        onRange={onRange}
        onExport={() => downloadReportPdf("profit-loss", preset, range)}
      />

      <section className={cn(reportGlass, "min-w-0 px-4 py-5 sm:px-5 sm:py-6")}>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Profit & Loss Summary</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">
          {data.periodLabel}
          {data.periodDates ? ` · ${data.periodDates}` : ""}
        </p>

        <div className="mt-4 max-w-xl">
          <LineRow label="Revenue" value={formatTzs(data.revenue)} />
          <LineRow label="Cost of Goods Sold" value={`- ${formatTzs(data.costOfGoodsSold)}`} tone="muted" />
          <LineRow label="Gross Profit" value={formatTzs(data.grossProfit)} tone="strong" />
          <LineRow label="Operating Expenses" value={`- ${formatTzs(data.operatingExpenses)}`} tone="muted" />
          <LineRow
            label="Loss from Expired/Damaged Stock"
            value={`- ${formatTzs(data.inventoryLoss)}`}
            tone="muted"
          />
          <LineRow label="Net Profit" value={formatTzs(data.netProfit)} tone="result" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
            <p className="text-[12px] text-slate-500">Gross Margin</p>
            <p className="mt-1 text-[18px] font-semibold text-navy">{data.grossMargin}%</p>
          </div>
          <div className="rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3">
            <p className="text-[12px] text-slate-500">Net Margin</p>
            <p className="mt-1 text-[18px] font-semibold text-navy">{data.netMargin}%</p>
          </div>
        </div>
      </section>

      <ReportSection title="Operating Expenses">
        <DesktopTable headers={["Category", "Description", "Amount"]} minWidth="520px">
          {data.expenses.map((row, index) => (
            <tr key={`${row.category}-${index}`} className="border-t border-white/55">
              <td className="py-3 pl-5 pr-3 font-medium text-navy">{row.category}</td>
              <td className="px-3 py-3 text-slate-500">{row.description}</td>
              <td className="py-3 pl-3 pr-5 font-semibold text-navy">{formatTzs(row.amount)}</td>
            </tr>
          ))}
        </DesktopTable>
        <ul className="space-y-2 px-4 pb-4 md:hidden">
          {data.expenses.map((row, index) => (
            <li
              key={`${row.category}-${index}`}
              className="flex items-start justify-between gap-3 rounded-[14px] border border-white/70 bg-white/45 px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-navy">{row.category}</p>
                <p className="mt-1 text-[12.5px] text-slate-500">{row.description}</p>
              </div>
              <p className="shrink-0 font-semibold text-navy">{formatTzs(row.amount)}</p>
            </li>
          ))}
        </ul>
      </ReportSection>
    </div>
  );
}
