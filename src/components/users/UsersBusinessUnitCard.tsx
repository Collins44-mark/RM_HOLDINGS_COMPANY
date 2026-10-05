"use client";

import { ArrowRight } from "lucide-react";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { TYPE } from "@/lib/theme/tokens";

export function UsersBusinessUnitCard({
  code,
  name,
  userCount,
  accent,
  iconBg,
  onOpen,
}: {
  code: string;
  name: string;
  userCount: number;
  accent: string;
  iconBg: string;
  onOpen: () => void;
}) {
  const label = userCount === 1 ? "1 user" : `${userCount} users`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-card group flex min-w-0 items-center gap-3 rounded-card px-4 py-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:shadow-card-hover sm:gap-4 sm:px-5 sm:py-5"
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] backdrop-blur-sm sm:h-11 sm:w-11 sm:rounded-[14px]"
        style={{ backgroundColor: iconBg, color: accent }}
      >
        <ModuleIcon code={code} className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${TYPE.cardTitle}`}>{name}</span>
        <span className={`mt-1 block ${TYPE.cardMeta}`}>{label}</span>
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/75 text-navy transition duration-200 ease-out group-hover:translate-x-0.5 group-hover:bg-white sm:h-10 sm:w-10">
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </button>
  );
}
