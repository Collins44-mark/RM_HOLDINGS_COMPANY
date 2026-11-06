import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { assignTenant } from "@/lib/property/tenant-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

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
      .from("tenants")
      .select("id, full_name, phone_number, email, status, notes, business_unit_id")
      .eq("id", id)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });
    if (!existing || existing.business_unit_id !== resolved.buId) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const fullName = String(body.full_name || body.name || existing.full_name).trim();
    if (!fullName) return NextResponse.json({ error: "Tenant name is required" }, { status: 400 });
    const status = body.status === "Inactive" ? "Inactive" : "Active";
    const propertyId = String(body.property_id || "").trim();
    const unitId = String(body.unit_id || "").trim();
    if (!propertyId) return NextResponse.json({ error: "Select a property" }, { status: 400 });

    const { error: updateError } = await admin.from("tenants").update({
      full_name: fullName,
      phone_number: String(body.phone_number ?? existing.phone_number ?? "").trim(),
      email: String(body.email ?? existing.email ?? "").trim(),
      status,
    }).eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    const arrived = String(body.arrived_on || "").slice(0, 10);
    if (arrived && !/^\d{4}-\d{2}-\d{2}$/.test(arrived)) {
      return NextResponse.json({ error: "Enter the arrival date" }, { status: 400 });
    }
    const assigned = await assignTenant(admin, resolved.buId, {
      ...existing,
      full_name: fullName,
      phone_number: String(body.phone_number ?? existing.phone_number ?? "").trim(),
      email: String(body.email ?? existing.email ?? "").trim(),
      status,
    }, propertyId, unitId, status, arrived);
    if (assigned.error) return NextResponse.json({ error: assigned.error }, { status: 400 });
    return auditedPropertyResponse(resolved.buId, { data: assigned.data }, {
      action: "tenant.updated",
      description: "Updated a tenant.",
      entityType: "tenant",
      entityId: id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
