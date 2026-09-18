"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Subtle ~140ms content enter — does not delay navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter min-w-0 w-full max-w-full">
      {children}
    </div>
  );
}
