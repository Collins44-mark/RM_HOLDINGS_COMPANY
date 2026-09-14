import { ModuleGate } from "@/components/layout/ModuleGate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="owner">{children}</ModuleGate>;
}
