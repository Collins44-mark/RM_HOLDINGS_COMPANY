"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type ProfileState = { error?: string; success?: boolean } | null;

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const actor = await getAuthUser();
  if (!actor) {
    return { error: "You must be signed in to update your profile." };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: "Enter your full name." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Authentication is not configured." };
  }

  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.name },
  });

  if (error) {
    return { error: "Unable to save your name. Please try again." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/owner");
  return { success: true };
}
