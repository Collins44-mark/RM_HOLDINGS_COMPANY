import { NextResponse } from "next/server";
import { identityFromUser } from "@/lib/auth/types";
import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { denyLivestock, resolveLivestockUnit } from "@/lib/livestock/access";
import { loadLivestockDirectory } from "@/lib/livestock/directory";
import { scopeLivestockDirectory } from "@/lib/livestock/scope";
import { buildLivestockReportPdf } from "@/lib/livestock/report-pdf";
import { buildLivestockReport } from "@/lib/livestock/reports";

export async function GET(request: Request) {
  const user = await requireAuth();
  const denied = denyLivestock(user, ["livestock.reports.view"]);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  const resolved = await resolveLivestockUnit(user, admin);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const directory = scopeLivestockDirectory(await loadLivestockDirectory(admin, resolved.buId), identityFromUser(user));
  const report = buildLivestockReport(url.searchParams.get("report") || "ls-financial", directory, from, to);
  const bytes = buildLivestockReportPdf(report, url.searchParams.get("period") || `${from} to ${to}`, new Date().toISOString());
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${report.title.replace(/\s+/g, "-").toLowerCase()}.pdf"` } });
}
