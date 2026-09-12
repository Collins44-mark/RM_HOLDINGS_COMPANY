"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canAccessPath } from "@/lib/auth/access";
import { identityFromUser } from "@/lib/auth/types";
import { getAuthUser } from "@/lib/auth/session";
import { signInWithPassword, signOutFromAuthProvider } from "@/lib/auth/sign-in";
import { DASHBOARD_PATH, LOGIN_PATH } from "@/lib/config/app";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
  }

  const { email, password, next } = parsed.data;
  const signedIn = await signInWithPassword(email, password);
  if (!signedIn.ok) {
    return { error: signedIn.error };
  }

  const user = await getAuthUser();
  const requested = typeof next === "string" && next.startsWith("/") ? next : null;
  const destination =
    user && requested && requested !== LOGIN_PATH && canAccessPath(identityFromUser(user), requested)
      ? requested
      : DASHBOARD_PATH;

  redirect(destination);
}

export async function logoutAction() {
  await signOutFromAuthProvider();
  redirect(LOGIN_PATH);
}
