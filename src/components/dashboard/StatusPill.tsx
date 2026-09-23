import { cn } from "@/lib/cn";
import type { PerformanceStatus } from "@/lib/data/finance";

const LABELS: Record<PerformanceStatus, string> = {
  strong: "Strong",
  healthy: "Healthy",
  watch: "Watch",
  idle: "No data",
};

export function StatusPill({ status }: { status: PerformanceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[72px] items-center justify-center rounded-full px-3 py-1 text-[12px] font-medium",
        status === "strong" && "bg-[#e8eef6] text-[#4d6480]",
        status === "healthy" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "watch" && "bg-[#f8efd8] text-[#b0892e]",
        status === "idle" && "bg-[#f3f5f8] text-[#6b7c90]",
      )}
    >
      {LABELS[status]}
    </span>
  );
}
