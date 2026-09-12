import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function BeekeepingLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="beekeeping">{children}</ModuleConsole>;
}
