import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  try {
    const user = await requireAuth();
    const { business_unit_id } = user as any; // uses RBAC / session
    const url = new URL(req.url);
    const table = url.searchParams.get("table") || "properties";
    const bu = url.searchParams.get("business_unit_id") || business_unit_id;

    if (!bu) return NextResponse.json({ error: "Missing business_unit_id" }, { status: 400 });

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("business_unit_id", bu)
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, table, business_unit_id: bu });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}
