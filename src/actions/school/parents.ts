"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
} from "@/lib/school/access";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";

const VIEW = "school.parents.view";
const MANAGE = "school.parents.manage";

export type GuardianListRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  students: string;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

export async function listSchoolGuardiansAction(input: { page?: number; q?: string } = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const q = searchNeedle(input.q);
    let query = supabase
      .from("sch_guardians")
      .select("id, full_name, phone, email", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("full_name")
      .range(from, to);
    if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const guardians = (result.data ?? []) as Record<string, unknown>[];
    const ids = guardians.map((row) => String(row.id));
    const names = new Map<string, string[]>();
    if (ids.length) {
      const links = await supabase
        .from("sch_student_guardians")
        .select("guardian_id, sch_students(first_name, last_name)")
        .eq("business_unit_id", businessUnitId)
        .in("guardian_id", ids);
      for (const row of links.data ?? []) {
        const student = row.sch_students as { first_name?: string; last_name?: string } | null;
        const label = [str(student?.first_name), str(student?.last_name)].filter(Boolean).join(" ");
        const list = names.get(String(row.guardian_id)) ?? [];
        if (label) list.push(label);
        names.set(String(row.guardian_id), list);
      }
    }
    return {
      ok: true as const,
      guardians: guardians.map((row) => ({
        id: String(row.id),
        fullName: str(row.full_name),
        phone: str(row.phone),
        email: str(row.email),
        students: (names.get(String(row.id)) ?? []).join(", "),
      })),
      page: schoolPageMeta(page, result.count ?? guardians.length, pageSize),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
