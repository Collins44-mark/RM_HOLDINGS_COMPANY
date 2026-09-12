import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="property">{children}</ModuleConsole>;
}
