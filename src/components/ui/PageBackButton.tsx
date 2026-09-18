import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { MouseEventHandler } from "react";
import { cn } from "@/lib/cn";

const backButtonClass =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-[#e7ecf3] bg-white/90 text-navy shadow-[0_8px_24px_rgba(15,35,64,0.045)] backdrop-blur-xl transition duration-200 hover:bg-white hover:shadow-[0_10px_28px_rgba(15,35,64,0.07)] active:scale-[0.97] sm:h-[52px] sm:w-[52px] lg:h-14 lg:w-14";

type PageBackButtonBase = {
  /** Accessible name + native title tooltip. Defaults to "Go back". */
  label?: string;
  className?: string;
};

export type PageBackButtonProps = PageBackButtonBase &
  (
    | {
        href: string;
        onClick?: MouseEventHandler<HTMLAnchorElement>;
        prefetch?: boolean;
      }
    | {
        href?: undefined;
        onClick: MouseEventHandler<HTMLButtonElement>;
        prefetch?: never;
      }
  );

/**
 * Shared page-level back control — icon-only rounded square.
 * Preserves Link or button behavior from the call site.
 */
export function PageBackButton(props: PageBackButtonProps) {
  const label = props.label ?? "Go back";
  const className = cn(backButtonClass, props.className);
  const icon = <ArrowLeft className="h-5 w-5" strokeWidth={1.9} aria-hidden />;

  if (typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        prefetch={props.prefetch}
        onClick={props.onClick}
        aria-label={label}
        title={label}
        className={className}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} aria-label={label} title={label} className={className}>
      {icon}
    </button>
  );
}
