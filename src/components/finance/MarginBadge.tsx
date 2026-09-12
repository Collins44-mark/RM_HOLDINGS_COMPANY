import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format/percent";

export function MarginBadge({
  value,
  emphasis = "auto",
}: {
  value: number;
  emphasis?: "auto" | "total";
}) {
  const tone =
    emphasis === "total"
      ? "bg-[#dce8fb] text-[#2f62c4]"
      : value >= 40
        ? "bg-[#e3f6ea] text-[#1f7a45]"
        : value >= 30
          ? "bg-[#eef6e4] text-[#5b7a2f]"
          : "bg-[#f8efd8] text-[#9a6b12]";

  return (
    <span
      className={cn(
        "inline-flex min-w-[52px] items-center justify-center rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        tone,
      )}
    >
      {formatPercent(value)}
    </span>
  );
}
