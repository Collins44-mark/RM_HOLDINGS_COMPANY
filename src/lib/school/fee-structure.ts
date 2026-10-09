import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";

export type FeeStructureTermAmount = {
  termId: string;
  termName: string;
  amount: number;
  isCurrent: boolean;
};

export type ApplicableFeeStructure = {
  id: string;
  academicYearId: string;
  academicYearName: string;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  annualAmount: number;
  terms: FeeStructureTermAmount[];
  currentTermId: string | null;
  currentTermName: string | null;
  currentTermAmount: number | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isCurrentTerm(startDate: string, endDate: string, today: string) {
  return Boolean(startDate && endDate && startDate <= today && today <= endDate);
}

export async function findApplicableFeeStructure(input: {
  supabase: SupabaseClient;
  businessUnitId: string;
  academicYearId: string;
  classId: string;
  levelId?: string;
  termId?: string;
}): Promise<ApplicableFeeStructure | null> {
  const academicYearId = String(input.academicYearId ?? "").trim();
  const classId = String(input.classId ?? "").trim();
  if (!academicYearId || !classId) return null;

  const [classRes, structureRes] = await Promise.all([
    input.supabase
      .from("sch_classes")
      .select("id, name, level_id")
      .eq("business_unit_id", input.businessUnitId)
      .eq("id", classId)
      .maybeSingle(),
    input.supabase
      .from("sch_fee_structures")
      .select("id, academic_year_id, level_id, class_id, annual_amount, is_active")
      .eq("business_unit_id", input.businessUnitId)
      .eq("academic_year_id", academicYearId)
      .eq("class_id", classId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (classRes.error && !isSchoolUnconfiguredRead(classRes.error)) return null;
  if (!classRes.data) return null;
  const levelId = String(classRes.data.level_id);
  if (input.levelId && String(input.levelId) !== levelId) return null;
  if (structureRes.error && !isSchoolUnconfiguredRead(structureRes.error)) return null;
  if (!structureRes.data) return null;

  const [levelRes, yearRes, termAmountRes, yearTermsRes] = await Promise.all([
    input.supabase
      .from("sch_class_levels")
      .select("id, name")
      .eq("business_unit_id", input.businessUnitId)
      .eq("id", levelId)
      .maybeSingle(),
    input.supabase
      .from("sch_academic_years")
      .select("id, name")
      .eq("business_unit_id", input.businessUnitId)
      .eq("id", academicYearId)
      .maybeSingle(),
    input.supabase
      .from("sch_fee_structure_terms")
      .select("term_id, amount")
      .eq("business_unit_id", input.businessUnitId)
      .eq("fee_structure_id", String(structureRes.data.id)),
    input.supabase
      .from("sch_terms")
      .select("id, name, start_date, end_date, is_active")
      .eq("business_unit_id", input.businessUnitId)
      .eq("academic_year_id", academicYearId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const today = todayIso();
  const yearTerms = yearTermsRes.data ?? [];
  const amountByTerm = new Map(
    (termAmountRes.data ?? []).map((row: { term_id: string; amount: number | string }) => [
      String(row.term_id),
      Number(row.amount),
    ]),
  );
  const preferredTermId = String(input.termId ?? "").trim();
  const datedCurrent = yearTerms.find((row: { start_date: string; end_date: string }) =>
    isCurrentTerm(String(row.start_date), String(row.end_date), today),
  );
  const currentTermId = preferredTermId || (datedCurrent ? String(datedCurrent.id) : "");
  const terms: FeeStructureTermAmount[] = yearTerms
    .filter((row: { id: string }) => amountByTerm.has(String(row.id)))
    .map((row: { id: string; name: string }) => ({
      termId: String(row.id),
      termName: String(row.name),
      amount: amountByTerm.get(String(row.id)) ?? 0,
      isCurrent: currentTermId === String(row.id),
    }));
  const current = terms.find((row) => row.termId === currentTermId) ?? null;
  const currentName =
    current?.termName ??
    (datedCurrent && !preferredTermId ? String(datedCurrent.name) : null) ??
    (preferredTermId ? (yearTerms.find((row: { id: string }) => String(row.id) === preferredTermId)?.name ?? null) : null);

  return {
    id: String(structureRes.data.id),
    academicYearId,
    academicYearName: String(yearRes.data?.name ?? ""),
    levelId,
    levelName: String(levelRes.data?.name ?? ""),
    classId,
    className: String(classRes.data.name ?? ""),
    annualAmount: Number(structureRes.data.annual_amount),
    terms,
    currentTermId: currentTermId || null,
    currentTermName: currentName ? String(currentName) : null,
    currentTermAmount: current ? current.amount : null,
  };
}
