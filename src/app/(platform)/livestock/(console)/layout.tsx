import { ModuleGate } from "@/components/layout/ModuleGate";

export default function LivestockLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="livestock">{children}</ModuleGate>;
}
