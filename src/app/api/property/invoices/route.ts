import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { createInvoice, listInvoiceRecords } from "@/lib/property/invoice-write";
import { auditedPropertyResponse } from "@/lib/property/audit";

async function ready() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Admin not configured", status: 500 as const };
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return { error: resolved.error, status: resolved.status };
  return { admin, buId: resolved.buId };
}

export async function GET() {
  try {
    const context = await ready();
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    return NextResponse.json({ data: await listInvoiceRecords(context.admin, context.buId) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await ready();
    if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
    const result = await createInvoice(context.admin, context.buId, await req.json());
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return auditedPropertyResponse(context.buId, { data: result.data }, {
      action: "invoice.created",
      description: "Created a rent invoice.",
      entityType: "rent_invoice",
      entityId: result.data?.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
