import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSupabasePropertyClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}
