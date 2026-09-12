import type { LucideIcon } from "lucide-react";
import { ComparisonIndicator } from "@/components/finance/ComparisonIndicator";
import { cn } from "@/lib/cn";

export function FinanceSummaryCard({
  label,
  value,
  delta,
  comparisonLabel,
  invertDelta = false,
  icon: Icon,
  surface,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  delta: number;
  comparisonLabel: string;
  invertDelta?: boolean;
  icon: LucideIcon;
  surface: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <article
      className={cn(
        "flex min-h-0 min-w-0 items-start gap-2.5 rounded-card border border-[color:var(--color-line)] px-3 py-3 shadow-card transition duration-200 hover:shadow-card-hover sm:min-h-[120px] sm:gap-3.5 sm:px-5 sm:py-4",
      )}
      style={{ backgroundColor: surface }}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] sm:h-[50px] sm:w-[50px] sm:rounded-[13px]"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        <Icon className="h-4 w-4 sm:h-6 sm:w-6" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[11px] font-medium text-slate-500 sm:text-[13.5px]">{label}</p>
        <p className="mt-1 break-words text-[15px] font-bold tracking-[-0.03em] text-navy sm:text-[21px]">{value}</p>
        <ComparisonIndicator value={delta} label={comparisonLabel} invert={invertDelta} />
      </div>
    </article>
  );
}
