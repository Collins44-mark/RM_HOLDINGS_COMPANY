import { updateTag, unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SchoolContext } from "@/lib/school/access";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";

export const SCHOOL_STRUCTURE_TAG = "school-structure";

export type StructureClass = { id: string; name: string; levelId: string };
export type StructureStream = { id: string; name: string; classId: string };

export type SchoolStructureCatalog = {
  years: Array<{ id: string; name: string; isCurrent: boolean }>;
  terms: Array<{ id: string; academicYearId: string; name: string }>;
  levels: Array<{ id: string; name: string }>;
  classes: StructureClass[];
  streams: StructureStream[];
};

const emptyCatalog = (): SchoolStructureCatalog => ({
  years: [],
  terms: [],
  levels: [],
  classes: [],
  streams: [],
});

async function fetchCatalog(businessUnitId: string): Promise<SchoolStructureCatalog> {
  const admin = createSupabaseAdminClient();
  if (!admin) return emptyCatalog();
  const [yearsRes, termsRes, levelsRes, classesRes, streamsRes] = await Promise.all([
    admin
      .from("sch_academic_years")
      .select("id, name, is_current")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("start_date", { ascending: false }),
    admin
      .from("sch_terms")
      .select("id, academic_year_id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("sch_class_levels")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("sch_classes")
      .select("id, name, level_id")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("sch_class_streams")
      .select("id, name, class_id")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  return {
    years: (yearsRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isCurrent: Boolean(row.is_current),
    })),
    terms: (termsRes.data ?? []).map((row) => ({
      id: String(row.id),
      academicYearId: String(row.academic_year_id),
      name: String(row.name),
    })),
    levels: (levelsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    classes: (classesRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      levelId: String(row.level_id),
    })),
    streams: (streamsRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      classId: String(row.class_id),
    })),
  };
}

function cachedCatalog(businessUnitId: string) {
  return unstable_cache(() => fetchCatalog(businessUnitId), ["school-structure-catalog", businessUnitId], {
    revalidate: 120,
    tags: [SCHOOL_STRUCTURE_TAG],
  })();
}

export async function loadSchoolStructureCatalog(ctx: SchoolContext): Promise<SchoolStructureCatalog> {
  const admin = createSupabaseAdminClient();
  if (admin) return cachedCatalog(ctx.businessUnitId);

  const { supabase, businessUnitId } = ctx;
  const [yearsRes, termsRes, levelsRes, classesRes, streamsRes] = await Promise.all([
    supabase
      .from("sch_academic_years")
      .select("id, name, is_current")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("start_date", { ascending: false }),
    supabase
      .from("sch_terms")
      .select("id, academic_year_id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sch_class_levels")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sch_classes")
      .select("id, name, level_id")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sch_class_streams")
      .select("id, name, class_id")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (yearsRes.error && !isSchoolUnconfiguredRead(yearsRes.error)) return emptyCatalog();
  return {
    years: (yearsRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isCurrent: Boolean(row.is_current),
    })),
    terms: (termsRes.data ?? []).map((row) => ({
      id: String(row.id),
      academicYearId: String(row.academic_year_id),
      name: String(row.name),
    })),
    levels: (levelsRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    classes: (classesRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      levelId: String(row.level_id),
    })),
    streams: (streamsRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      classId: String(row.class_id),
    })),
  };
}

export function invalidateSchoolStructureCatalog() {
  updateTag(SCHOOL_STRUCTURE_TAG);
}
