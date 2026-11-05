import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { denyBee, resolveBeekeepingUnit } from "@/lib/beekeeping/access";

export async function beeContext(permission: string) {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Admin not configured" }, { status: 500 }) };
  const denied = denyBee(user, permission);
  if (denied) return { error: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  const resolved = await resolveBeekeepingUnit(user, admin);
  if ("error" in resolved) return { error: NextResponse.json({ error: resolved.error }, { status: resolved.status }) };
  return { user, admin, buId: resolved.buId };
}

export function beeFail(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed";
  return NextResponse.json({ error: message }, { status: 400 });
}
