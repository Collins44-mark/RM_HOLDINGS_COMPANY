import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { presentContracts } from "@/lib/property/contracts";
import { createContract } from "@/lib/property/contract-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

async function records(admin: any, buId: string) {
  const [contractsResult, tenantsResult, propertiesResult, unitsResult] = await Promise.all([
    admin.from("rental_contracts").select("*").eq("business_unit_id", buId).order("created_at", { ascending: false }).limit(200),
    admin.from("tenants").select("id, full_name, phone_number, email").eq("business_unit_id", buId),
    admin.from("properties").select("id, name, street_address, ward, district, region").eq("business_unit_id", buId),
    admin.from("property_units").select("id, unit_name, unit_code, property_id, monthly_rent, unit_type, floor").eq("business_unit_id", buId),
  ]);
  return presentContracts(contractsResult.data || [], tenantsResult.data || [], propertiesResult.data || [], unitsResult.data || []);
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
    const result = await createContract(admin, resolved.buId, await req.json());
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
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
