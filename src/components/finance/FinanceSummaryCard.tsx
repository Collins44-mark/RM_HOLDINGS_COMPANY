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
        "flex min-h-[120px] items-start gap-3.5 rounded-card border border-[color:var(--color-line)] px-5 py-4 shadow-card transition duration-200 hover:shadow-card-hover",
      )}
      style={{ backgroundColor: surface }}
    >
      <span
        className="inline-flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[13px]"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        <Icon className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[13.5px] font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-navy">{value}</p>
        <ComparisonIndicator value={delta} label={comparisonLabel} invert={invertDelta} />
      </div>
    </article>
  );
}
