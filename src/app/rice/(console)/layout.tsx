import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function RiceLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="rice">{children}</ModuleConsole>;
}
