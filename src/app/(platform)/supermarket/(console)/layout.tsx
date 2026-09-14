import { ModuleGate } from "@/components/layout/ModuleGate";

export default function SupermarketLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="supermarket">{children}</ModuleGate>;
}
