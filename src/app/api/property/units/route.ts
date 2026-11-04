import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { isCurrentContract } from "@/lib/property/contracts";
import { auditedPropertyResponse } from "@/lib/property/audit";

async function resolveBusinessUnitId(user: any, admin: any) {
  const roleCode = user?.roleCode || "";
  const isOwner = roleCode === "OWNER" || roleCode === "SUPER_ADMIN";
  if (!isOwner && !user?.businessUnits?.length) {
    return { error: "Not authorized for property operations", status: 403 as const };
  }
  let buId = "";
  const assigned = user?.businessUnits || [];
  const propertyUnit = assigned.find((unit: { code?: string; id?: string }) => unit?.code === "property");
  if (propertyUnit?.id) buId = String(propertyUnit.id);
  else if (!isOwner && assigned.length === 1 && assigned[0]?.id) buId = String(assigned[0].id);
  if (!buId && (isOwner || user?.modules?.includes("*") || propertyUnit)) {
    const { data: all } = await admin.from("business_units").select("id").eq("code", "property").limit(1);
    if (all && all.length > 0) buId = String(all[0].id);
  }
  if (!buId) return { error: "Missing business_unit_id — no authorized business unit assigned to user", status: 401 as const };
  return { buId };
}

function toUnit(row: any, tenantName: string | null = null) {
  return {
    id: row.id,
    name: row.unit_name || row.unit_code,
    status: row.occupancy_status || "Vacant",
    monthly_rent: row.monthly_rent ?? 0,
    property_id: row.property_id,
    unit_type: row.unit_type,
    tenant_name: tenantName,
    property: row.properties ? { name: row.properties.name } : null,
  };
}

function unitCodeFromName(name: string) {
  const base = String(name || "UNIT").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return base || "UNIT";
}

export async function GET() {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const [unitsResult, contractsResult, tenantsResult] = await Promise.all([
      admin.from("property_units").select("*, properties(name)").eq("business_unit_id", resolved.buId).order("created_at", { ascending: false }).limit(200),
      admin.from("rental_contracts").select("unit_id, tenant_id, status, start_date, end_date, created_at").eq("business_unit_id", resolved.buId).eq("status", "Active"),
      admin.from("tenants").select("id, full_name").eq("business_unit_id", resolved.buId),
    ]);
    if (unitsResult.error) return NextResponse.json({ error: unitsResult.error.message }, { status: 500 });
    const names = new Map((tenantsResult.data || []).map((tenant) => [tenant.id, tenant.full_name]));
    const tenantByUnit = new Map<string, string>();
    for (const contract of [...(contractsResult.data || [])].filter((contract) => isCurrentContract(contract)).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))) {
      const name = names.get(contract.tenant_id);
      if (name) tenantByUnit.set(contract.unit_id, name);
    }
    return NextResponse.json({ data: (unitsResult.data || []).map((row) => toUnit(row, tenantByUnit.get(row.id) || null)) });
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
    const name = String(body.name || body.unit_name || "").trim();
    const propertyId = String(body.property_id || "").trim();
    if (!name) return NextResponse.json({ error: "Unit name is required" }, { status: 400 });
    if (!propertyId) return NextResponse.json({ error: "Select a property" }, { status: 400 });

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id, name, business_unit_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 400 });
    if (!property || property.business_unit_id !== resolved.buId) {
      return NextResponse.json({ error: "Property not found for this business unit" }, { status: 400 });
    }

    const status = String(body.status || body.occupancy_status || "Vacant");
    const payload = {
      business_unit_id: resolved.buId,
      property_id: propertyId,
      unit_code: unitCodeFromName(name),
      unit_name: name,
      unit_type: body.unit_type || "Apartment",
      monthly_rent: body.monthly_rent ? Number(body.monthly_rent) : 0,
      occupancy_status: status,
    };

    let { data, error } = await admin.from("property_units").insert(payload).select("*, properties(name)").single();
    if (error && /duplicate|unique/i.test(error.message || "")) {
      const retry = { ...payload, unit_code: `${payload.unit_code}-${Date.now().toString(36).slice(-4)}`.slice(0, 50) };
      const second = await admin.from("property_units").insert(retry).select("*, properties(name)").single();
      data = second.data;
      error = second.error;
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return auditedPropertyResponse(resolved.buId, { data: toUnit(data) }, {
      action: "unit.created",
      description: "Created a unit.",
      entityType: "property_unit",
      entityId: data?.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
