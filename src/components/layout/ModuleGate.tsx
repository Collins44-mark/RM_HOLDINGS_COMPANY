import type { ReactNode } from "react";
import type { ModuleCode } from "@/lib/config/app";

/**
 * Module access is enforced in `src/proxy.ts` (JWT claims + canAccessPath).
 * Awaiting requireModuleAccess here previously blocked every soft navigation
 * inside the module console (Finance → Stock, Reports → Sales, etc.).
 * Mutations still use requireVerifiedAuth / requireModuleAccess on the server.
 */
export function ModuleGate({
  children,
}: {
  module: ModuleCode;
  children: ReactNode;
}) {
  return children;
}
