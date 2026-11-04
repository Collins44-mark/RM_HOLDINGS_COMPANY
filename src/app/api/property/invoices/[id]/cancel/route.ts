import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { cancelInvoice } from "@/lib/property/invoice-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { id } = await params;
    const result = await cancelInvoice(admin, resolved.buId, id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "Invoice not found" ? 404 : 400 });
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "invoice.cancelled",
      description: "Cancelled a rent invoice.",
      entityType: "rent_invoice",
      entityId: id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
