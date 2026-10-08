"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Subtle ~140ms content enter — does not delay navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const key =
    pathname === "/supermarket/finance/banking" || pathname === "/supermarket/finance/bank-reconciliation"
      ? "/supermarket/finance/banking-workspace"
      : pathname.startsWith("/school")
        ? "/school"
        : pathname;
  return (
    <div key={key} className="page-enter min-w-0 w-full max-w-full">
      {children}
    </div>
  );
}
