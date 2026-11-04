import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { recordPayment } from "@/lib/property/invoice-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

export async function GET() {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { data, error } = await admin.from("rent_payments").select("*").eq("business_unit_id", resolved.buId).order("payment_date", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
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
    const body = await req.json();
    const invoiceId = String(body.invoice_id || "");
    if (!invoiceId) return NextResponse.json({ error: "Select an invoice" }, { status: 400 });
    const result = await recordPayment(admin, resolved.buId, invoiceId, body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "payment.recorded",
      description: "Recorded a rent payment.",
      entityType: "rent_invoice",
      entityId: invoiceId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
