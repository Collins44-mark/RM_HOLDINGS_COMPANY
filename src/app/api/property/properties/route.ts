import { getSupabasePropertyClient } from "@/lib/supabase/property";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const supabase = await getSupabasePropertyClient();
    const { data, error } = await supabase.from("properties").select("*").eq("businessUnitId", (user as any).businessUnitId || (user as any).business_unit_id).limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const supabase = await getSupabasePropertyClient();
    const body = await req.json();
    const { data, error } = await supabase.from("properties").insert({ ...body, business_unit_id: buId }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
