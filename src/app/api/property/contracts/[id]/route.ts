import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { updateContract } from "@/lib/property/contract-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

async function context(admin: any) {
  const user = await requireAuth();
  if (!admin) return { error: "Admin not configured", status: 500 as const };
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return { error: resolved.error, status: resolved.status };
  return { buId: resolved.buId };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = createSupabaseAdminClient();
    const ready = await context(admin);
    if ("error" in ready) return NextResponse.json({ error: ready.error }, { status: ready.status });
    const { id } = await params;
    const result = await updateContract(admin, ready.buId, id, await req.json());
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "Contract not found" ? 404 : 400 });
    return auditedPropertyResponse(ready.buId, { data: result.data }, {
      action: "contract.updated",
      description: "Updated a rental contract.",
      entityType: "rental_contract",
      entityId: id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
