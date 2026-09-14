"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canAccessPath, landingPathFor } from "@/lib/auth/access";
import { signInWithPassword, signOutFromAuthProvider } from "@/lib/auth/sign-in";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/config/app";
import { permissionsForRoleCode } from "@/lib/auth/role-options";

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier") || formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address or phone number and password." };
  }

  const { identifier, password, next } = parsed.data;
  const signedIn = await signInWithPassword(identifier, password);
  if (!signedIn.ok) {
    return { error: signedIn.error };
  }

  if (signedIn.mustChangePassword) {
    redirect(CHANGE_PASSWORD_PATH);
  }

  const identity = {
    role: signedIn.roleCode,
    modules: signedIn.modules,
    permissions: permissionsForRoleCode(signedIn.roleCode),
  };

  const requested = typeof next === "string" && next.startsWith("/") ? next : null;
  const destination =
    requested && requested !== LOGIN_PATH && requested !== CHANGE_PASSWORD_PATH && canAccessPath(identity, requested)
      ? requested
      : landingPathFor(identity);

  redirect(destination);
}

export async function logoutAction() {
  await signOutFromAuthProvider();
  redirect(LOGIN_PATH);
}
