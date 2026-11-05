import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { paidByContract, presentContracts } from "@/lib/property/contracts";
import { createContract, syncUnitOccupancy } from "@/lib/property/contract-write";
import { issuePaidRentInvoice, paidPeriodEnd } from "@/lib/property/invoice-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

async function records(admin: any, buId: string) {
  const [contractsResult, tenantsResult, propertiesResult, unitsResult, invoicesResult] = await Promise.all([
    admin.from("rental_contracts").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(200),
    admin.from("tenants").select("id, full_name, phone_number, email").eq("business_unit_id", buId),
    admin.from("properties").select("id, name, street_address, ward, district, region").eq("business_unit_id", buId),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent, unit_type, floor").eq("business_unit_id", buId),
    admin.from("rent_invoices").select("contract_id, amount_paid, status").eq("business_unit_id", buId),
  ]);
  return presentContracts(contractsResult.data || [], tenantsResult.data || [], propertiesResult.data || [], unitsResult.data || [], paidByContract(invoicesResult.data || []));
}

export async function GET() {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    return NextResponse.json({ data: await records(admin, resolved.buId) });
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
    const months = Math.max(0, Math.floor(Number(body.months_paid || 0)));
    const periodEnd = paidPeriodEnd(String(body.start_date || ""), months);
    if (months < 1) return NextResponse.json({ error: "Select how many months were paid" }, { status: 400 });
    if (!periodEnd || periodEnd > String(body.end_date || "").slice(0, 10)) return NextResponse.json({ error: "Months paid go past the contract end date" }, { status: 400 });
    const result = await createContract(admin, resolved.buId, body);
    if (result.error || !result.data) return NextResponse.json({ error: result.error || "Save failed" }, { status: 400 });
    const invoice = await issuePaidRentInvoice(admin, resolved.buId, result.data, months);
    if (invoice.error) {
      await admin.from("rental_contracts").delete().eq("id", result.data.id).eq("business_unit_id", resolved.buId);
      await syncUnitOccupancy(admin, resolved.buId, result.data.unit_id);
      return NextResponse.json({ error: invoice.error }, { status: 400 });
    }
    result.data.amount_paid = invoice.amount_paid || 0;
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "contract.created",
      description: "Created a rental contract.",
      entityType: "rental_contract",
      entityId: result.data?.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
