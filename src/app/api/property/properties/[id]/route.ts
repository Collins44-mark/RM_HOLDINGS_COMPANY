import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const roleCode = (user as any)?.roleCode || '';
    const isOwner = roleCode === 'OWNER' || roleCode === 'SUPER_ADMIN';
    if (!isOwner && !(user as any)?.businessUnits?.length) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
    const body = await req.json();
    const { id } = await params;
    let buId = '';
    try {
      const assigned = (user as any).businessUnits || [];
      if (assigned.length > 0) {
        const first = assigned[0];
        if (first.id) buId = String(first.id);
        else if (first.code) {
          const { data: buRow } = await admin.from('business_units').select('id').eq('code', first.code).limit(1).maybeSingle();
          buId = buRow?.id ? String(buRow.id) : '';
        }
      }
    } catch { buId = ''; }
    if (!buId && (isOwner || (user as any)?.modules?.includes('*'))) {
      try { const { data: all } = await admin.from('business_units').select('id').limit(1); if (all && all.length > 0) buId = String(all[0].id); } catch {}
    }
    if (!buId) return NextResponse.json({ error: 'Missing business_unit_id' }, { status: 401 });
    const { data: prop } = await admin.from('properties').select('business_unit_id').eq('id', id).single();
    if (!prop || prop.business_unit_id !== buId) return NextResponse.json({ error: 'Property not authorized' }, { status: 403 });
    const { data, error } = await admin.from('properties').update(body).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
