import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="school">{children}</ModuleConsole>;
}
