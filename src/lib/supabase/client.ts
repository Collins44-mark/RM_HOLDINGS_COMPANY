"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}
