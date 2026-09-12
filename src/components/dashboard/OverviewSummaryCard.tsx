import type { ComponentType } from "react";
import { ComparisonIndicator } from "@/components/finance/ComparisonIndicator";

type MetricIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export function OverviewSummaryCard({
  label,
  value,
  delta,
  comparisonLabel,
  invertDelta = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: number;
  comparisonLabel: string;
  invertDelta?: boolean;
  icon: MetricIcon;
}) {
  return (
    <article className="flex min-h-0 min-w-0 items-center gap-2.5 rounded-[18px] border border-white/90 bg-white px-3 py-3 shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:min-h-[108px] sm:gap-3.5 sm:px-4 sm:py-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy sm:h-12 sm:w-12 sm:rounded-[16px]">
        <Icon className="h-4 w-4 sm:h-[22px] sm:w-[22px]" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 sm:text-[13px]">{label}</p>
        <p className="mt-0.5 break-words text-[15px] font-bold tracking-[-0.03em] text-navy sm:text-[20px]">{value}</p>
        <ComparisonIndicator
          value={delta}
          label={comparisonLabel}
          invert={invertDelta}
          unsigned
          plainArrow
        />
      </div>
    </article>
  );
}

export function PercentMark({
  className,
  strokeWidth = 1.6,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M15.25 8.75 8.75 15.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="9.25" cy="9.25" r="1.15" fill="currentColor" />
      <circle cx="14.75" cy="14.75" r="1.15" fill="currentColor" />
    </svg>
  );
}
