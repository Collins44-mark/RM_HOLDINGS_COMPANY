import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { updateBooking } from "@/lib/property/hall-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { id } = await params;
    const result = await updateBooking(admin, resolved.buId, id, await req.json());
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Booking not found" ? 404 : 400 });
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "booking.updated",
      description: "Updated a hall booking.",
      entityType: "hall_booking",
      entityId: id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
