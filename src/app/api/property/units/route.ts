import { getSupabasePropertyClient } from "@/lib/supabase/property";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const supabase = await getSupabasePropertyClient();
    const { data, error } = await (supabase as any).from("property_units").select("*").eq("business_unit_id", buId || "").limit(50);
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
    const body = await req.json();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id; const { data, error } = await (supabase as any).from("property_units").insert({ ...body, business_unit_id: buId }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
