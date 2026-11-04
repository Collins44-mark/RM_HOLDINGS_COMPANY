import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { createTenant, listTenantRecords } from "@/lib/property/tenant-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

export async function GET() {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    return NextResponse.json({ data: await listTenantRecords(admin, resolved.buId) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const result = await createTenant(admin, resolved.buId, await req.json());
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "tenant.created",
      description: "Created a tenant.",
      entityType: "tenant",
      entityId: result.data?.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
