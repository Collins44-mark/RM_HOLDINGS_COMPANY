import { ModuleGate } from "@/components/layout/ModuleGate";

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="property">{children}</ModuleGate>;
}
