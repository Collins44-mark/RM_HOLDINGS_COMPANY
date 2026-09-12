import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";
import { cn } from "@/lib/cn";

export function Logo({
  compact = false,
  light = true,
  markOnly = false,
  stacked = false,
  size,
}: {
  compact?: boolean;
  light?: boolean;
  markOnly?: boolean;
  stacked?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const markSize = size ?? (compact || markOnly || stacked ? "sm" : "md");

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        compact && "gap-2.5",
        markOnly && "justify-center gap-0",
        stacked && "flex-col gap-3",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-b from-[#d7b56a] to-[#b48a32] text-[#3a2a0a] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
          markSize === "sm" && "h-10 w-10 rounded-xl",
          markSize === "md" && "h-12 w-12 rounded-xl",
          markSize === "lg" && "h-16 w-16 rounded-[18px]",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "font-[family-name:var(--font-cormorant)] font-semibold leading-none tracking-tight",
            markSize === "sm" && "text-[22px]",
            markSize === "md" && "text-[26px]",
            markSize === "lg" && "text-[30px]",
          )}
        >
          RM
        </span>
      </div>
      {markOnly ? null : (
        <div className={cn("min-w-0", stacked && "text-center")}>
          <p
            className={cn(
              "font-semibold tracking-[0.16em] uppercase",
              compact || stacked ? "text-[11px]" : "text-xs",
              light ? "text-white" : "text-navy",
            )}
          >
            {APP_NAME}
          </p>
          {!compact && !stacked ? (
            <p
              className={cn(
                "mt-0.5 text-[11px] leading-[15px] tracking-wide",
                light ? "text-white/55" : "text-slate-500",
              )}
            >
              {APP_TAGLINE}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
