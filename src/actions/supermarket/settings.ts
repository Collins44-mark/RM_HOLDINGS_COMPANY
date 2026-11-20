"use server";

import { revalidatePath } from "next/cache";
import { canAccessPath } from "@/lib/auth/access";
import { getVerifiedAuthUser } from "@/lib/auth/session";
import { identityFromUser } from "@/lib/auth/types";
import { saveSupermarketReceiptDetails } from "@/lib/supermarket/store-settings";

export async function saveSupermarketStoreNameAction(
  _previous: { ok?: boolean; error?: string } | null,
  formData: FormData,
) {
  const actor = await getVerifiedAuthUser();
  if (!actor || !canAccessPath(identityFromUser(actor), "/supermarket/settings")) {
    return { error: "You cannot change the supermarket receipt details." };
  }
  const saved = await saveSupermarketReceiptDetails({
    storeName: String(formData.get("storeName") ?? ""),
    location: String(formData.get("location") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    tin: String(formData.get("tin") ?? ""),
    email: String(formData.get("email") ?? ""),
    thanks: String(formData.get("thanks") ?? ""),
  });
  if (!saved.ok) return { error: saved.error };
  revalidatePath("/supermarket/settings");
  revalidatePath("/supermarket/pos");
  revalidatePath("/supermarket/sales");
  return { ok: true as const };
}
