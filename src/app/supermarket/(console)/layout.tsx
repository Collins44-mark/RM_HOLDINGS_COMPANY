import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function SupermarketLayout({ children }: { children: React.ReactNode }) {
  return <ModuleConsole module="supermarket">{children}</ModuleConsole>;
}
