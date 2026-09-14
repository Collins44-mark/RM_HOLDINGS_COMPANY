import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/session";
import { landingPathFor } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { redirect } from "next/navigation";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  if (user.businessUnits.length <= 1) {
    redirect(landingPathFor(identityFromUser(user)));
  }
  return children;
}
