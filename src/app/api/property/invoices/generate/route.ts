import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateDueInvoices } from "@/lib/property/invoice-write";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Automatic invoice generation is not configured. CRON_SECRET is not set." }, { status: 503 });
  }
  const header = req.headers.get("authorization") || "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  const result = await generateDueInvoices(admin);
  return NextResponse.json({ data: result });
}
