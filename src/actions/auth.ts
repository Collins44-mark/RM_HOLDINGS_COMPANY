"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canAccessPath, landingPathFor } from "@/lib/auth/access";
import { signInWithPassword, signOutFromAuthProvider } from "@/lib/auth/sign-in";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/config/app";
import { permissionsForRoleCode } from "@/lib/auth/role-options";
import { getAuthUser, getVerifiedAuthUser } from "@/lib/auth/session";
import { identityFromUser } from "@/lib/auth/types";
import { writeAuditEvent } from "@/lib/audit";

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string } | null;

function redirectAfterAuth(
  identity: { role: string; modules: string[]; permissions: string[] },
  next: string | undefined,
): never {
  const requested = typeof next === "string" && next.startsWith("/") ? next : null;
  const destination =
    requested && requested !== LOGIN_PATH && requested !== CHANGE_PASSWORD_PATH && canAccessPath(identity, requested)
      ? requested
      : landingPathFor(identity);
  redirect(destination);
}

async function isCredentialFormPost() {
  const h = await headers();
  if (h.get("rsc") === "1" || h.get("next-router-prefetch") === "1") return false;
  return true;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!(await isCredentialFormPost())) {
    return null;
  }

  const nextRaw = formData.get("next");
  const next = typeof nextRaw === "string" ? nextRaw : undefined;

  const existing = await getAuthUser();
  if (existing) {
    if (existing.mustChangePassword) {
      redirect(CHANGE_PASSWORD_PATH);
    }
    redirectAfterAuth(identityFromUser(existing), next);
  }

  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier") || formData.get("email"),
    password: formData.get("password"),
    next,
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address or phone number and password." };
  }

  const { identifier, password } = parsed.data;
  const signedIn = await signInWithPassword(identifier, password);
  if (!signedIn.ok) {
    return { error: signedIn.error };
  }

  if (signedIn.mustChangePassword) {
    redirect(CHANGE_PASSWORD_PATH);
  }

  redirectAfterAuth(
    {
      role: signedIn.roleCode,
      modules: signedIn.modules,
      permissions: permissionsForRoleCode(signedIn.roleCode),
    },
    next,
  );
}

export async function logoutAction() {
  const user = await getVerifiedAuthUser();
  await signOutFromAuthProvider();
  if (user) {
    await writeAuditEvent({
      action: "logout",
      module: "auth",
      description: "User logout",
      severity: "low",
      entityType: "user",
      entityId: user.id,
      actor: { id: user.id, name: user.name, email: user.email },
    });
  }
  redirect(LOGIN_PATH);
}
