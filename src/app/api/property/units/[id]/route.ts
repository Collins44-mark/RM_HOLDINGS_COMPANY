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
  if (!buId) return { error: "Missing business_unit_id", status: 401 as const };
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { id } = await params;
    const body = await req.json();
    const { data: existing, error: existingError } = await admin
      .from("property_units")
      .select("id, business_unit_id")
      .eq("id", id)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
    if (!existing || existing.business_unit_id !== resolved.buId) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }
    const update: Record<string, unknown> = {};
    if (body.name) {
      update.unit_name = String(body.name).trim();
    }
    if (body.status) update.occupancy_status = body.status;
    if (body.monthly_rent !== undefined) update.monthly_rent = Number(body.monthly_rent) || 0;
    if (body.property_id) update.property_id = body.property_id;
    const { data, error } = await admin.from("property_units").update(update).eq("id", id).select("*, properties(name)").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const { data: contracts } = await admin.from("rental_contracts").select("tenant_id, status, start_date, end_date").eq("business_unit_id", resolved.buId).eq("unit_id", id).eq("status", "Active");
    const contract = (contracts || []).find((item) => isCurrentContract(item));
    let tenantName: string | null = null;
    if (contract?.tenant_id) {
      const { data: tenant } = await admin.from("tenants").select("full_name").eq("id", contract.tenant_id).maybeSingle();
      tenantName = tenant?.full_name || null;
    }
    return auditedPropertyResponse(resolved.buId, { data: toUnit(data, tenantName) }, {
      action: "unit.updated",
      description: "Updated a unit.",
      entityType: "property_unit",
      entityId: id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { id } = await params;
    const { data, error } = await admin
      .from("property_units")
      .delete()
      .eq("id", id)
      .eq("business_unit_id", resolved.buId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    return auditedPropertyResponse(resolved.buId, { data }, {
      action: "unit.deleted",
      description: "Deleted a unit.",
      entityType: "property_unit",
      entityId: id,
      severity: "high",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
