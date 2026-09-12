import { BarChart3 } from "lucide-react";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { formatTzs } from "@/lib/format/currency";
import { cn } from "@/lib/cn";
import { TYPE } from "@/lib/theme/tokens";

export function RevenueCard({
  code,
  name,
  amount,
  accent,
  tint,
  featured = false,
}: {
  code: string;
  name: string;
  amount: number;
  accent: string;
  tint: string;
  featured?: boolean;
}) {
  return (
    <article
      className={cn(
        "glass-card min-w-0 rounded-card px-3 py-3 sm:px-4 sm:py-[18px]",
        featured && "bg-white/80",
      )}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] sm:h-10 sm:w-10 sm:rounded-[12px]"
          style={{
            backgroundColor: featured ? "rgba(90, 122, 160, 0.14)" : tint,
            color: featured ? "#5A7AA0" : accent,
          }}
        >
          {featured ? (
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.85} />
          ) : (
            <ModuleIcon code={code} className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="break-words text-[12px] font-medium text-slate-500 sm:text-[13px]">{name}</p>
          <p
            className={cn(
              featured ? `${TYPE.revenueTotal} mt-1` : `${TYPE.revenueValue} mt-1`,
            )}
          >
            {formatTzs(amount)}
          </p>
        </div>
      </div>
    </article>
  );
}
