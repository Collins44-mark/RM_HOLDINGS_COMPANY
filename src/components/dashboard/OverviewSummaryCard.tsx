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
    <article className="flex min-h-[108px] items-center gap-3.5 rounded-[18px] border border-white/90 bg-white px-4 py-4 shadow-[0_6px_20px_rgba(20,40,70,0.04)]">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#f3f5f8] text-navy">
        <Icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[20px] font-bold tracking-[-0.03em] text-navy">{value}</p>
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
