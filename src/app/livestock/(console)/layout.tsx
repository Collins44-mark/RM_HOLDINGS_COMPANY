import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function LivestockLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="livestock">{children}</ModuleConsole>;
}
