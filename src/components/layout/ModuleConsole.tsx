import { ModuleGate } from "@/components/layout/ModuleGate";
import type { ModuleCode } from "@/lib/config/app";

export async function ModuleConsole({
  module: moduleCode,
  children,
}: {
  module: ModuleCode;
  children: React.ReactNode;
  requireModule?: boolean;
}) {
  return <ModuleGate module={moduleCode}>{children}</ModuleGate>;
}
