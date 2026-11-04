import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { customersFrom } from "@/lib/property/halls";
import { listHallRecords } from "@/lib/property/hall-write";

export async function listHallDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = { bookings: [], halls: [], customers: [] };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  const directory = await listHallRecords(admin, resolved.buId);
  return { ...directory, customers: customersFrom(directory.bookings) };
}
