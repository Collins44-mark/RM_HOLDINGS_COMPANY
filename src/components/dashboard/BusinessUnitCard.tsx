import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { TYPE } from "@/lib/theme/tokens";

export function BusinessUnitCard({
  href,
  code,
  name,
  location,
  subtitle,
  accent,
  iconBg,
}: {
  href: string;
  code: string;
  name: string;
  location: string;
  subtitle?: string | null;
  accent: string;
  iconBg: string;
  surface?: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card group flex min-h-0 min-w-0 items-center gap-2.5 rounded-card px-3 py-3 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:shadow-card-hover sm:min-h-[108px] sm:gap-4 sm:px-5 sm:py-5"
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] backdrop-blur-sm sm:h-12 sm:w-12 sm:rounded-[14px]"
        style={{ backgroundColor: iconBg, color: accent }}
      >
        <ModuleIcon code={code} className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${TYPE.cardTitle}`}>{name}</span>
        {subtitle ? (
          <span className={`mt-1 block ${TYPE.cardMeta}`}>{subtitle}</span>
        ) : null}
        <span className={`mt-1 block ${TYPE.cardMeta}`}>{location}</span>
      </span>
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/75 text-navy transition duration-200 ease-out group-hover:translate-x-0.5 group-hover:bg-white sm:inline-flex">
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </Link>
  );
}
