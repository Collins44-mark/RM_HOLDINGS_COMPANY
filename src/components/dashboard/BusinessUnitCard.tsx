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
      className="glass-card group flex min-h-[108px] items-center gap-4 rounded-card px-5 py-5 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:shadow-card-hover"
    >
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] backdrop-blur-sm"
        style={{ backgroundColor: iconBg, color: accent }}
      >
        <ModuleIcon code={code} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${TYPE.cardTitle}`}>{name}</span>
        {subtitle ? (
          <span className={`mt-1 block ${TYPE.cardMeta}`}>{subtitle}</span>
        ) : null}
        <span className={`mt-1 block ${TYPE.cardMeta}`}>{location}</span>
      </span>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/75 text-navy transition duration-200 ease-out group-hover:translate-x-0.5 group-hover:bg-white">
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </Link>
  );
}
