import { createClient } from "@supabase/supabase-js";
import {
  isSupabaseAdminConfigured,
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  if (!isSupabaseAdminConfigured()) return null;
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
