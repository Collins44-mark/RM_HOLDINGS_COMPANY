import { Suspense, type ReactNode } from "react";
import { requireAuth } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import { ConsoleLoading } from "@/components/layout/ConsoleLoading";

async function WorkspaceGate({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  if (user.businessUnits.length <= 1) {
    redirect(landingPathFor(identityFromUser(user)));
  }
  return children;
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <WorkspaceGate>{children}</WorkspaceGate>
    </Suspense>
  );
}
