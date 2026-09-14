"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canAccessPath, landingPathFor } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { getAuthUser } from "@/lib/auth/session";
import { signInWithPassword, signOutFromAuthProvider } from "@/lib/auth/sign-in";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/config/app";

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

  const user = await getAuthUser();
  if (user?.mustChangePassword) {
    redirect(CHANGE_PASSWORD_PATH);
  }

  const requested = typeof next === "string" && next.startsWith("/") ? next : null;
  const destination =
    user && requested && requested !== LOGIN_PATH && requested !== CHANGE_PASSWORD_PATH && canAccessPath(identityFromUser(user), requested)
      ? requested
      : user
        ? landingPathFor(identityFromUser(user))
        : LOGIN_PATH;

  redirect(destination);
}

export async function logoutAction() {
  await signOutFromAuthProvider();
  redirect(LOGIN_PATH);
}
