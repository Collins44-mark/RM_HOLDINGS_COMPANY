import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMoney, parsePayday } from "@/lib/school/salary";

export type SalaryArrangementInput = {
  staffHomeBusinessUnitId: string;
  staffId: string;
  costBusinessUnitId: string;
  monthlySalary: number | string | null | undefined;
  payday?: number | string | null;
  effectiveOn?: string | null;
  isActive?: boolean;
};

export function paydayOrDefault(value: unknown, fallback = 28) {
  return parsePayday(value) ?? fallback;
}

export async function upsertSalaryArrangement(
  supabase: SupabaseClient,
  input: SalaryArrangementInput,
): Promise<{ error?: string }> {
  const staffId = String(input.staffId ?? "").trim();
  const home = String(input.staffHomeBusinessUnitId ?? "").trim();
  const cost = String(input.costBusinessUnitId ?? "").trim() || home;
  if (!staffId || !home || !cost) return { error: "Choose a business unit for this salary." };

  const salary = parseMoney(input.monthlySalary);
  if (salary != null && salary < 0) return { error: "Monthly salary cannot be negative." };
  const payday = paydayOrDefault(input.payday);
  const effectiveOn = String(input.effectiveOn ?? "").trim();
  const isActive = input.isActive !== false;
  const today = new Date().toISOString().slice(0, 10);
  const effective = /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) ? effectiveOn : today;

  if (cost === home) {
    const updated = await supabase
      .from("sch_staff")
      .update({
        monthly_salary: salary,
        salary_effective_on: salary == null ? null : effective,
      })
      .eq("id", staffId)
      .eq("business_unit_id", home);
    if (updated.error) return { error: updated.error.message || "Couldn't save this salary." };
  }

  if (salary == null) {
    await supabase
      .from("sch_staff_salary_allocations")
      .delete()
      .eq("staff_id", staffId)
      .eq("cost_business_unit_id", cost);
    return {};
  }

  const row = {
    business_unit_id: home,
    staff_id: staffId,
    cost_business_unit_id: cost,
    amount: salary,
    payday,
    effective_on: effective,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };
  const upserted = await supabase.from("sch_staff_salary_allocations").upsert(row, {
    onConflict: "staff_id,cost_business_unit_id",
  });
  if (upserted.error) {
    const inserted = await supabase.from("sch_staff_salary_allocations").insert({
      business_unit_id: home,
      staff_id: staffId,
      cost_business_unit_id: cost,
      amount: salary,
    });
    if (inserted.error) return { error: inserted.error.message || "Couldn't save this salary arrangement." };
  }
  return {};
}
