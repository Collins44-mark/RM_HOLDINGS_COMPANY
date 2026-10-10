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
    <article className="flex min-h-0 min-w-0 items-center gap-3 rounded-[22px] border border-white/70 bg-white/68 px-4 py-4 shadow-[0_10px_28px_rgba(20,40,70,0.06)] backdrop-blur-xl sm:min-h-[118px] sm:gap-4 sm:px-5 sm:py-5">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 text-navy sm:h-12 sm:w-12">
        <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-500 sm:text-[13px]">{label}</p>
        <p className="mt-0.5 break-words text-[17px] font-bold tracking-[-0.03em] text-navy sm:text-[22px]">{value}</p>
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
