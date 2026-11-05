"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getVerifiedAuthUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAuditEvent } from "@/lib/audit";
import { isStoredImage } from "@/lib/images/read-image";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type ProfileState = { error?: string; success?: boolean } | null;

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const actor = await getVerifiedAuthUser();
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

  await writeAuditEvent({
    action: "profile.updated",
    module: "profile",
    description: `Updated profile name to ${parsed.data.name}`,
    severity: "low",
    entityType: "user",
    entityId: actor.id,
  });

  revalidatePath("/profile");
  return { success: true };
}

export async function updateAvatarAction(image: string): Promise<ProfileState> {
  const actor = await getVerifiedAuthUser();
  if (!actor) return { error: "You must be signed in to update your profile." };
  if (!isStoredImage(image)) return { error: "Choose a smaller photo." };

  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Profile photos are not available right now." };

  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: image, updated_at: new Date().toISOString() })
    .eq("id", actor.id);
  if (error) return { error: "Unable to save your photo. Please try again." };

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.updateUser({ data: { avatar_url: image, full_name: actor.name } });
  }

  await writeAuditEvent({
    action: "profile.updated",
    module: "profile",
    description: "Updated profile photo",
    severity: "low",
    entityType: "user",
    entityId: actor.id,
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { success: true };
}
