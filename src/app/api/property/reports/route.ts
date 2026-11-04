import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { buildPropertyReport } from "@/lib/property/report-query";
import { auditedPropertyResponse } from "@/lib/property/audit";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const result = await buildPropertyReport(admin, resolved.buId, await req.json(), user.name || "RM Holdings");
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return auditedPropertyResponse(resolved.buId, { data: result.data }, {
      action: "report.generated",
      description: "Generated a property report.",
      entityType: "report",
      entityId: null,
      metadata: { module: String(result.data?.module || ""), report: String(result.data?.title || "") },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
