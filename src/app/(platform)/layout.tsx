import { ModuleConsole } from "@/components/layout/ModuleConsole";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="owner">{children}</ModuleConsole>;
}
