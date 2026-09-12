import type { SVGProps } from "react";
import {
  Building2,
  GraduationCap,
  ShoppingCart,
  Tractor,
  Wheat,
} from "lucide-react";
import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

const GLYPH = "h-[22px] w-[22px]";

function CowIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(GLYPH, className)} {...props}>
      <path
        d="M7.2 8.2c.4-1.6 1.6-2.7 2.8-2.7.5 0 1 .2 1.5.6.5-.4 1-.6 1.5-.6 1.2 0 2.4 1.1 2.8 2.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 9.5c-2 .4-3.5 2.2-3.5 4.3V16.5h15V13.8c0-2.1-1.5-3.9-3.5-4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 16.5v2.2M15.5 16.5v2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.2 12.8h.2M13.6 12.8h.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6.4 7.2 5.2 5.6M17.6 7.2l1.2-1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BeeIcon({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(GLYPH, className)} {...props}>
      <path
        d="M8.2 10.2C6 8.4 4.2 8 3.6 8.7c-.7.8 0 2.4 2.2 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.8 10.2c2.2-1.8 4-2.2 4.6-1.5.7.8 0 2.4-2.2 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 8.2c2.4 0 4.2 2.2 4.2 4.8S14.4 17.8 12 17.8 7.8 15.6 7.8 13 9.6 8.2 12 8.2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M9.4 11.6h5.2M9.4 13.4h5.2M9.8 15.1h4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 8.2V6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="5.6" r="1.15" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const LUCIDE = {
  rice: Wheat,
  farm: Tractor,
  supermarket: ShoppingCart,
  property: Building2,
  school: GraduationCap,
} as const;

export function ModuleIcon({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  if (code === "livestock") return <CowIcon className={className} />;
  if (code === "beekeeping") return <BeeIcon className={className} />;
  const Icon = LUCIDE[code as keyof typeof LUCIDE] ?? GraduationCap;
  return <Icon className={cn(GLYPH, className)} strokeWidth={1.75} />;
}
