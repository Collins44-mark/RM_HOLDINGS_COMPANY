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
import { schoolPageMeta, schoolPageRange, SCHOOL_PAGE_SIZE } from "@/lib/school/pagination";
import { loadActiveLevels, loadPlacementByStreamIds, placementLabel, resolvePlacementStreamIds } from "@/lib/school/placement-query";
import { loadSchoolStructureScope } from "@/lib/school/structure-scope";

const VIEW = "school.parents.view";
const MANAGE = "school.parents.manage";

export type GuardianStudentLink = {
  studentId: string;
  name: string;
  placement: string;
};

export type GuardianListRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  students: GuardianStudentLink[];
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

export async function listSchoolGuardiansAction(
  input: { page?: number; pageSize?: number; q?: string; levelId?: string; classId?: string; streamId?: string } = {},
) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : SCHOOL_PAGE_SIZE;
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const streamIds = await resolvePlacementStreamIds(
      ctx,
      input,
      input.levelId || input.classId || input.streamId ? scope : null,
    );
    let allowedIds: string[] | null = null;
    if (streamIds) {
      if (!streamIds.length) {
        return {
          ok: true as const,
          guardians: [] as GuardianListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels: await loadActiveLevels(ctx),
          capabilities: { canView: true, canManage: canManage(user) },
        };
      }
      const enrollments = await supabase
        .from("sch_student_enrollments")
        .select("student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .in("stream_id", streamIds);
      const studentIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
      if (!studentIds.length) {
        return {
          ok: true as const,
          guardians: [] as GuardianListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels: await loadActiveLevels(ctx),
          capabilities: { canView: true, canManage: canManage(user) },
        };
      }
      const links = await supabase
        .from("sch_student_guardians")
        .select("guardian_id")
        .eq("business_unit_id", businessUnitId)
        .in("student_id", studentIds);
      allowedIds = [...new Set((links.data ?? []).map((row) => String(row.guardian_id)))];
      if (!allowedIds.length) {
        return {
          ok: true as const,
          guardians: [] as GuardianListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels: await loadActiveLevels(ctx),
          capabilities: { canView: true, canManage: canManage(user) },
        };
      }
    }
    let query = supabase
      .from("sch_guardians")
      .select("id, full_name, phone, email", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("full_name")
      .range(from, to);
    if (allowedIds) query = query.in("id", allowedIds);
    if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const guardians = (result.data ?? []) as Record<string, unknown>[];
    const ids = guardians.map((row) => String(row.id));
    const names = new Map<string, GuardianStudentLink[]>();
    if (ids.length) {
      const links = await supabase
        .from("sch_student_guardians")
        .select("guardian_id, student_id, sch_students(id, first_name, last_name)")
        .eq("business_unit_id", businessUnitId)
        .in("guardian_id", ids);
      const studentIds = [...new Set((links.data ?? []).map((row) => String(row.student_id)))];
      const placements = new Map<string, string>();
      if (studentIds.length) {
        const enrollments = await supabase
          .from("sch_student_enrollments")
          .select("student_id, stream_id")
          .eq("business_unit_id", businessUnitId)
          .eq("status", "active")
          .in("student_id", studentIds);
        const byStream = await loadPlacementByStreamIds(
          ctx,
          (enrollments.data ?? []).map((row) => str(row.stream_id)),
        );
        for (const row of enrollments.data ?? []) {
          const place = byStream.get(str(row.stream_id));
          if (place) {
            placements.set(String(row.student_id), placementLabel(place.levelName, place.className, place.streamName));
          }
        }
      }
      for (const row of links.data ?? []) {
        const student = row.sch_students as { id?: string; first_name?: string; last_name?: string } | null;
        const studentId = str(student?.id ?? row.student_id);
        const label = [str(student?.first_name), str(student?.last_name)].filter(Boolean).join(" ");
        const list = names.get(String(row.guardian_id)) ?? [];
        if (label) list.push({ studentId, name: label, placement: placements.get(studentId) ?? "" });
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
        students: names.get(String(row.id)) ?? [],
      })),
      page: schoolPageMeta(page, result.count ?? guardians.length, pageSize),
      levels: await loadActiveLevels(ctx),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
