import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatSignedPercent } from "@/lib/format/percent";

export function ComparisonIndicator({
  value,
  label,
  invert = false,
  unsigned = false,
  plainArrow = false,
}: {
  value: number;
  label: string;
  invert?: boolean;
  unsigned?: boolean;
  plainArrow?: boolean;
}) {
  const up = value >= 0;
  const positive = invert ? !up : up;
  const Icon = plainArrow ? (up ? ArrowUp : ArrowDown) : up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        "mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-medium sm:text-[12px]",
        positive ? "text-[#1f8a4c]" : "text-[#c24646]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      <span>{unsigned ? `${Math.abs(value).toFixed(1)}%` : formatSignedPercent(value)}</span>
      <span className="font-normal text-slate-400">{label}</span>
    </p>
  );
}
