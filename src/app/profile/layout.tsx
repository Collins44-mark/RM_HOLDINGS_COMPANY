import type { ReactNode } from "react";
import { ModuleConsole } from "@/components/layout/ModuleConsole";

export const dynamic = "force-dynamic";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <ModuleConsole module="owner" requireModule={false}>
      {children}
    </ModuleConsole>
  );
}
