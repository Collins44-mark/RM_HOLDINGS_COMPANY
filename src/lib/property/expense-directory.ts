import { requireAuth } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBusinessUnitId } from "@/lib/property/business-unit";
import { listExpenseRecords } from "@/lib/property/expense-write";
import type { ExpenseBookingOption, ExpenseOption, ExpenseRecord, PropertyIncome } from "@/lib/property/expenses";

export async function listExpenseDirectory() {
  const user = await requireAuth();
  const admin = createSupabaseAdminClient();
  const empty = {
    expenses: [] as ExpenseRecord[],
    properties: [] as ExpenseOption[],
    units: [] as ExpenseOption[],
    bookings: [] as ExpenseBookingOption[],
    income: [] as PropertyIncome[],
  };
  if (!admin) return empty;
  const resolved = await resolveBusinessUnitId(user, admin);
  if ("error" in resolved) return empty;
  return listExpenseRecords(admin, resolved.buId);
}
