"use client";

import { useEffect, useState } from "react";
import { APP_TAGLINE } from "@/lib/config/app";
import { cn } from "@/lib/cn";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function useLogoFill(src: string) {
  const [color, setColor] = useState("#ffffff");

  useEffect(() => {
    if (!src) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      if (active) setColor(`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  return color;
}

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
  const { organisationName, logoUrl } = useLocale();
  const logoFill = useLogoFill(logoUrl);

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
          "flex shrink-0 items-center justify-center overflow-hidden text-[#3a2a0a]",
          logoUrl ? "bg-transparent" : "bg-gradient-to-b from-[#d7b56a] to-[#b48a32] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
          markSize === "sm" && "h-10 w-10 rounded-xl",
          markSize === "md" && "h-12 w-12 rounded-xl",
          markSize === "lg" && "h-16 w-16 rounded-[18px]",
        )}
        style={logoUrl ? { backgroundColor: logoFill } : undefined}
        aria-hidden
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
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
        )}
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
            {organisationName}
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
