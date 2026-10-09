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
import { schoolPageMeta, schoolPageRange, parseSchoolPageSize } from "@/lib/school/pagination";
import {
  enrollmentPlacementOr,
  loadPlacementByClassIds,
  loadPlacementByStreamIds,
  resolveEnrollmentPlacementFilterFromCatalog,
} from "@/lib/school/placement-query";
import { catalogLookup, loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { loadSchoolStructureScope } from "@/lib/school/structure-scope";

const VIEW = "school.parents.view";
const MANAGE = "school.parents.manage";

export type GuardianStudentLink = {
  studentId: string;
  name: string;
  levelName: string;
  className: string;
  streamName: string;
};

export type GuardianListRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  students: GuardianStudentLink[];
};

export type GuardianPlacementOption = { id: string; name: string };

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
    const [catalog, scope] = await Promise.all([
      loadSchoolStructureCatalog(ctx),
      isOwnerRole(user.roleCode) ? Promise.resolve(null) : loadSchoolStructureScope(ctx),
    ]);
    const levels = catalog.levels.filter((row) => !scope || scope.schoolWide || scope.levelIds.has(row.id));
    const pageSize = parseSchoolPageSize(input.pageSize);
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const levelId = str(input.levelId);
    const classId = str(input.classId);
    const classes = levelId
      ? catalog.classes
          .filter((row) => row.levelId === levelId && (!scope || scope.schoolWide || scope.classIds.has(row.id)))
          .map((row) => ({ id: row.id, name: row.name }))
      : [];
    const streams = classId
      ? catalog.streams
          .filter((row) => row.classId === classId && (!scope || scope.schoolWide || scope.streamIds.has(row.id)))
          .map((row) => ({ id: row.id, name: row.name }))
      : [];
    const placementFilter = resolveEnrollmentPlacementFilterFromCatalog(catalog, input, scope);
    const placementOr = enrollmentPlacementOr(placementFilter);
    let allowedIds: string[] | null = null;
    if (placementOr) {
      if (placementFilter.kind === "empty") {
        return {
          ok: true as const,
          guardians: [] as GuardianListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels,
          classes,
          streams,
          capabilities: { canView: true, canManage: canManage(user) },
        };
      }
      const enrollments = await supabase
        .from("sch_student_enrollments")
        .select("student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .or(placementOr);
      const studentIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
      if (!studentIds.length) {
        return {
          ok: true as const,
          guardians: [] as GuardianListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels,
          classes,
          streams,
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
          levels,
          classes,
          streams,
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
        .select("guardian_id, student_id")
        .eq("business_unit_id", businessUnitId)
        .in("guardian_id", ids);
      const studentIds = [...new Set((links.data ?? []).map((row) => String(row.student_id)).filter(Boolean))];
      const [studentsRes, enrollmentsRes] = studentIds.length
        ? await Promise.all([
            supabase
              .from("sch_students")
              .select("id, first_name, middle_name, last_name")
              .eq("business_unit_id", businessUnitId)
              .in("id", studentIds),
            supabase
              .from("sch_student_enrollments")
              .select("student_id, stream_id, class_id")
              .eq("business_unit_id", businessUnitId)
              .eq("status", "active")
              .in("student_id", studentIds),
          ])
        : [{ data: [] as Array<Record<string, unknown>> }, { data: [] as Array<Record<string, unknown>> }];
      const lookup = catalogLookup(catalog);
      const missingStreams = (enrollmentsRes.data ?? [])
        .map((row) => str(row.stream_id))
        .filter((id) => id && !lookup.placement(id));
      const missingClasses = (enrollmentsRes.data ?? [])
        .filter((row) => !str(row.stream_id))
        .map((row) => str(row.class_id))
        .filter((id) => id && !lookup.placementByClass(id));
      const [byStream, byClass] = await Promise.all([
        missingStreams.length ? loadPlacementByStreamIds(ctx, missingStreams) : Promise.resolve(new Map()),
        missingClasses.length ? loadPlacementByClassIds(ctx, missingClasses) : Promise.resolve(new Map()),
      ]);
      const studentNames = new Map<string, string>();
      for (const row of studentsRes.data ?? []) {
        studentNames.set(
          String(row.id),
          [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
        );
      }
      const placements = new Map<string, { levelName: string; className: string; streamName: string }>();
      for (const row of enrollmentsRes.data ?? []) {
        const nextStreamId = str(row.stream_id);
        const nextClassId = str(row.class_id);
        const place = nextStreamId
          ? lookup.placement(nextStreamId) ?? byStream.get(nextStreamId)
          : lookup.placementByClass(nextClassId) ?? byClass.get(nextClassId);
        placements.set(String(row.student_id), {
          levelName: place?.levelName ?? "",
          className: place?.className ?? "",
          streamName: place?.streamName ?? "",
        });
      }
      for (const row of links.data ?? []) {
        const studentId = str(row.student_id);
        const label = studentNames.get(studentId) ?? "";
        const place = placements.get(studentId);
        const list = names.get(String(row.guardian_id)) ?? [];
        list.push({
          studentId,
          name: label,
          levelName: place?.levelName ?? "",
          className: place?.className ?? "",
          streamName: place?.streamName ?? "",
        });
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
      levels,
      classes,
      streams,
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
