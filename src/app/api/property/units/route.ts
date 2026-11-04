import { getSupabasePropertyClient } from "@/lib/supabase/property";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const supabase = await getSupabasePropertyClient();
    const { data, error } = await (supabase as any).from("PropertyUnit").select("*,Property(name)").eq("propertyId", buId || "").limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: (data || []).map((d: any) => ({ ...d, property_id: d.propertyId, monthly_rent: d.rentAmount, property: d.Property })) });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 }); }
}
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const supabase = await getSupabasePropertyClient();
    const body = await req.json();
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const { data, error } = await (supabase as any).from("PropertyUnit").insert({ id: crypto.randomUUID(), name: body.name, propertyId: body.property_id || body.propertyId, status: body.status, rentAmount: body.monthly_rent || body.rentAmount || 0, createdAt: new Date().toISOString() }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: { ...data, property_id: data.propertyId, monthly_rent: data.rentAmount } });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 400 }); }
}
export async function DELETE(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const id = url.pathname.split('/').pop();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const buId = (user as any).businessUnitId || (user as any).business_unit_id;
    const { data, error } = await (admin as any).from("PropertyUnit").delete().eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) { return NextResponse.json({ error: e.message || "Failed" }, { status: 400 }); }
}
