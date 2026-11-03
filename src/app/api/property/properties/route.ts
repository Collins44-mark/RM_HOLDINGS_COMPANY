import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
        const user = await requireAuth();
    // Server-side authorization: only Owner/Super Admin or assigned employee may write
    const roleCode = (user as any)?.roleCode || '';
    const isOwner = roleCode === 'OWNER' || roleCode === 'SUPER_ADMIN';
    if (!isOwner && !(user as any)?.businessUnits?.length) {
      return NextResponse.json({ error: 'Not authorized for property operations' }, { status: 403 });
    }
    const admin = createSupabaseAdminClient(); if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 }); const supabase = admin;
    // Resolve authorized business unit from user's assigned businessUnits (existing RM Holdings auth pattern)
    let buId = "";
    try {
      const assigned = (user as any).businessUnits || [];
      if (assigned.length > 0) {
        const first = assigned[0];
        if (first.id) buId = String(first.id);
        else if (first.code) {
          const { data: buRow } = await supabase.from("business_units").select("id").eq("code", first.code).limit(1).maybeSingle();
          buId = buRow?.id ? String(buRow.id) : "";
        }
      }
    } catch { buId = ""; }
    // Owner/Group Admin: access all company business units
    if (!buId && ((user as any)?.roleCode === "OWNER" || (user as any)?.roleCode === "SUPER_ADMIN" || (user as any)?.modules?.includes("*"))) {
      try { const { data: all } = await supabase.from("business_units").select("id").limit(1); if (all && all.length > 0) buId = String(all[0].id); } catch { /* ignore */ }
    }
    if (!buId) return NextResponse.json({ error: "Missing business_unit_id — no authorized business unit assigned to user" }, { status: 401 });
    const { data, error } = await supabase.from("properties").select("*").limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
        const user = await requireAuth();
    // Server-side authorization: only Owner/Super Admin or assigned employee may write
    const roleCode = (user as any)?.roleCode || '';
    const isOwner = roleCode === 'OWNER' || roleCode === 'SUPER_ADMIN';
    if (!isOwner && !(user as any)?.businessUnits?.length) {
      return NextResponse.json({ error: 'Not authorized for property operations' }, { status: 403 });
    }
    const admin = createSupabaseAdminClient(); if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 }); const supabase = admin;
    // Resolve authorized business unit from user's assigned businessUnits (existing RM Holdings auth pattern)
    let buId = "";
    try {
      const assigned = (user as any).businessUnits || [];
      if (assigned.length > 0) {
        const first = assigned[0];
        if (first.id) buId = String(first.id);
        else if (first.code) {
          const { data: buRow } = await supabase.from("business_units").select("id").eq("code", first.code).limit(1).maybeSingle();
          buId = buRow?.id ? String(buRow.id) : "";
        }
      }
    } catch { buId = ""; }
    // Owner/Group Admin: access all company business units
    if (!buId && ((user as any)?.roleCode === "OWNER" || (user as any)?.roleCode === "SUPER_ADMIN" || (user as any)?.modules?.includes("*"))) {
      try { const { data: all } = await supabase.from("business_units").select("id").limit(1); if (all && all.length > 0) buId = String(all[0].id); } catch { /* ignore */ }
    }
    if (!buId) return NextResponse.json({ error: "Missing business_unit_id — no authorized business unit assigned to user" }, { status: 401 });
    const body = await req.json();
    if (!buId) return NextResponse.json({ error: "Missing business_unit_id — session not authorized" }, { status: 401 });
    const payload = { ...body, business_unit_id: buId, property_code: body.property_code || (body.name ? String(body.name).toLowerCase().replace(/\s+/g,"_").substring(0,50) : "PROP"), street_address: body.address || body.street_address || "" }; if (body.address && !body.street_address) delete payload.address; const { data, error } = await supabase.from("properties").insert(payload).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
