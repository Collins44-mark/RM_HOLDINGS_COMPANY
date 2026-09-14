import { ModuleGate } from "@/components/layout/ModuleGate";

export default function BeekeepingLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="beekeeping">{children}</ModuleGate>;
}
