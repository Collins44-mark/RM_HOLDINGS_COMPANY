import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { listReportOptions } from "@/lib/property/report-query";
import ReportsView from "./reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { properties: [], units: [], tenants: [], halls: [] };
  const options = !admin ? empty : await (async () => {
    const resolved = await resolveBusinessUnitId(user, admin);
    if ("error" in resolved) return empty;
    return listReportOptions(admin, resolved.buId);
  })();
  return <ReportsView options={options} />;
}
