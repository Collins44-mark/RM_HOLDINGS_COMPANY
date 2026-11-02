import { getSupabasePropertyClient } from "@/lib/supabase/property";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const supabase = await getSupabasePropertyClient();
    // Resolve authorized business unit from user assignment
    const { data: buRow } = await supabase.from("business_units").select("id").eq("id", (user as any)?.businessUnitId || (user as any)?.business_unit_id).limit(1).maybeSingle();
    const buId = buRow?.id || (user as any)?.businessUnitId || (user as any)?.business_unit_id || "";
    const { data, error } = await supabase.from("properties").select("*").eq("business_unit_id", buId || "").limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const supabase = await getSupabasePropertyClient();
    // Resolve authorized business unit from user assignment
    const { data: buRow } = await supabase.from("business_units").select("id").eq("id", (user as any)?.businessUnitId || (user as any)?.business_unit_id).limit(1).maybeSingle();
    const buId = buRow?.id || (user as any)?.businessUnitId || (user as any)?.business_unit_id || "";
    const body = await req.json();
    if (!buId) return NextResponse.json({ error: "Missing business_unit_id — session not authorized" }, { status: 401 });
    const { data, error } = await supabase.from("properties").insert({ ...body, business_unit_id: buId }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
