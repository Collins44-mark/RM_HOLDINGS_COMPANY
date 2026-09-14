import { ModuleGate } from "@/components/layout/ModuleGate";

export default function RiceLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="rice">{children}</ModuleGate>;
}
