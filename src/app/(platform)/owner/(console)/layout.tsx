import { ModuleGate } from "@/components/layout/ModuleGate";

export default function OwnerConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="owner">{children}</ModuleGate>;
}
