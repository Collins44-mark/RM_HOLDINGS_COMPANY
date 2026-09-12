import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function FarmLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="farm">{children}</ModuleConsole>;
}
