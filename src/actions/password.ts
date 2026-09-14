"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedAuthUser } from "@/lib/auth/session";
import { identityFromUser } from "@/lib/auth/types";
import { landingPathFor } from "@/lib/auth/access";
import { LOGIN_PATH } from "@/lib/config/app";

export type PasswordChangeState = { error?: string } | null;

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const user = await getVerifiedAuthUser();
  if (!user) redirect(LOGIN_PATH);

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Enter a valid new password." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase || !user.email) {
    return { error: "Authentication is not configured." };
  }

  const verified = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verified.error) {
    return { error: "Current temporary password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return { error: error.message || "Unable to update the password." };
  }

  await supabase.rpc("clear_password_change_required");
  redirect(landingPathFor(identityFromUser({ ...user, mustChangePassword: false })));
}
