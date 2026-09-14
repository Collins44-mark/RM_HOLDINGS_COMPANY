import type { ReactNode } from "react";
import { requireModuleAccess } from "@/lib/auth/session";
import type { ModuleCode } from "@/lib/config/app";

export async function ModuleGate({
  module: moduleCode,
  children,
}: {
  module: ModuleCode;
  children: ReactNode;
}) {
  await requireModuleAccess(moduleCode);
  return children;
}
