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
        "glass-card rounded-card px-4 py-[18px]",
        featured && "bg-white/80",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
          style={{
            backgroundColor: featured ? "rgba(90, 122, 160, 0.14)" : tint,
            color: featured ? "#5A7AA0" : accent,
          }}
        >
          {featured ? (
            <BarChart3 className="h-5 w-5" strokeWidth={1.85} />
          ) : (
            <ModuleIcon code={code} className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{name}</p>
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
