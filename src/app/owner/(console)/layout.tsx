import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="owner">{children}</ModuleConsole>;
}
