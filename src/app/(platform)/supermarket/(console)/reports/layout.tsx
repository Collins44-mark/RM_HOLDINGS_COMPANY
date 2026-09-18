import type { ReactNode } from "react";

/**
 * Shared Reports segment layout — keeps report child routes under one parent
 * so only report content swaps while the supermarket console shell stays put.
 */
export default function SupermarketReportsLayout({ children }: { children: ReactNode }) {
  return children;
}
