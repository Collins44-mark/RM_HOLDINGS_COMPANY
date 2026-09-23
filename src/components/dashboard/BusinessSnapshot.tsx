import { BarChart3, Building2 } from "lucide-react";
import { PercentMark } from "@/components/dashboard/OverviewSummaryCard";
import { formatTzs } from "@/lib/format/currency";
import { formatPercent, formatSignedPercent } from "@/lib/format/percent";
import type { UnitFinanceRow } from "@/lib/data/finance";

export function BusinessSnapshot({
  highestRevenue,
  highestMargin,
  activeUnits,
  configuredUnits,
  lastUpdated,
}: {
  highestRevenue?: UnitFinanceRow;
  highestMargin?: UnitFinanceRow;
  activeUnits: number;
  configuredUnits: number;
  lastUpdated: string;
}) {
  return (
    <section className="rounded-[20px] border border-white/90 bg-white/92 px-5 py-5 shadow-[0_8px_28px_rgba(20,40,70,0.045)] sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">
            Business Snapshot
          </h2>
          <p className="mt-1 text-[13.5px] leading-5 text-slate-500">
            Key highlights from live consolidated ledgers
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-400 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            Live updates
          </span>
          <span>Last updated: {lastUpdated}</span>
        </p>
      </div>

      <div className="mt-5 flex flex-row items-stretch gap-3 max-sm:flex-col">
        <SnapshotCard
          label="Highest Revenue"
          icon={BarChart3}
          title={highestRevenue?.name}
          value={highestRevenue ? formatTzs(highestRevenue.revenue) : "Not available"}
          trend={
            highestRevenue && highestRevenue.revenueChange !== 0
              ? highestRevenue.revenueChange
              : undefined
          }
        />
        <SnapshotCard
          label="Highest Margin"
          icon={PercentMark}
          title={highestMargin?.name}
          value={highestMargin ? formatPercent(highestMargin.margin) : "Not available"}
          trend={
            highestMargin && highestMargin.marginChange !== 0
              ? highestMargin.marginChange
              : undefined
          }
        />
        <SnapshotCard
          label="Active Business Units"
          icon={Building2}
          value={String(activeUnits)}
          detail={`${configuredUnits} configured · ${activeUnits} with activity this period`}
        />
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  icon: Icon,
  title,
  value,
  detail,
  trend,
}: {
  label: string;
  icon: typeof BarChart3 | typeof PercentMark | typeof Building2;
  title?: string;
  value: string;
  detail?: string;
  trend?: number;
}) {
  return (
    <article className="flex min-w-0 flex-1 items-start gap-3 rounded-[16px] border border-black/[0.04] bg-white px-3 py-3 shadow-[0_4px_16px_rgba(20,40,70,0.03)] sm:gap-3.5 sm:px-4 sm:py-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy sm:h-11 sm:w-11 sm:rounded-[14px]">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.65} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[10px] font-medium tracking-[0.08em] text-slate-400 uppercase sm:text-[11px]">
          {label}
        </p>
        {title ? (
          <p className="mt-1 break-words text-[14px] font-semibold tracking-[-0.02em] text-navy sm:text-[15px]">
            {title}
          </p>
        ) : null}
        <p className="mt-0.5 break-words text-[17px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">{value}</p>
        {detail ? <p className="mt-0.5 text-[13px] text-slate-500">{detail}</p> : null}
        {typeof trend === "number" ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12.5px] font-medium text-[#1f8a4c]">
            <span aria-hidden>{trend >= 0 ? "↑" : "↓"}</span>
            <span>{formatSignedPercent(trend)}</span>
            <span>vs last period</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}
