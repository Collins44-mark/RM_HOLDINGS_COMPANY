import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { renewContract, syncUnitOccupancy } from "@/lib/property/contract-write";
import { auditedPropertyResponse } from "@/lib/property/audit";
import { issuePaidRentInvoice, paidPeriodEnd } from "@/lib/property/invoice-write";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { id } = await params;
    const body = await req.json();
    const months = Math.max(0, Math.floor(Number(body.months_paid || 0)));
    const periodEnd = paidPeriodEnd(String(body.start_date || ""), months);
    if (months < 1) return NextResponse.json({ error: "Select how many months were paid" }, { status: 400 });
    if (!periodEnd || periodEnd > String(body.end_date || "").slice(0, 10)) return NextResponse.json({ error: "Months paid go past the contract end date" }, { status: 400 });
    const result = await renewContract(admin, resolved.buId, id, body);
    if (result.error || !result.data) return NextResponse.json({ error: result.error || "Renewal failed" }, { status: result.error === "Contract not found" ? 404 : 400 });
    const invoice = await issuePaidRentInvoice(admin, resolved.buId, result.data, months);
    if (invoice.error) {
      await admin.from("rental_contracts").delete().eq("id", result.data.id).eq("business_unit_id", resolved.buId);
      if (result.closedPrevious && result.previous?.id) await admin.from("rental_contracts").update({ status: "Active" }).eq("id", result.previous.id).eq("business_unit_id", resolved.buId);
      await syncUnitOccupancy(admin, resolved.buId, result.data.unit_id);
      return NextResponse.json({ error: invoice.error }, { status: 400 });
    }
    result.data.amount_paid = invoice.amount_paid || 0;
    return auditedPropertyResponse(resolved.buId, { data: result.data, previous: result.previous }, {
      action: "contract.renewed",
      description: "Renewed a rental contract.",
      entityType: "rental_contract",
      entityId: result.data?.id || id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
