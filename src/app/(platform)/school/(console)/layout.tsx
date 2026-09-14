import { ModuleGate } from "@/components/layout/ModuleGate";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="school">{children}</ModuleGate>;
}
