import { ModuleGate } from "@/components/layout/ModuleGate";

export default function FarmLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="farm">{children}</ModuleGate>;
}
