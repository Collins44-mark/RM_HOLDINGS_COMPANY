"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { loadSchoolStructureScope } from "@/lib/school/structure-scope";
import { schoolPageMeta, schoolPageRange, SCHOOL_PAGE_SIZE } from "@/lib/school/pagination";
import { loadActiveLevels, loadPlacementByStreamIds, resolvePlacementStreamIds } from "@/lib/school/placement-query";

const VIEW = "school.students.view";
const MANAGE = "school.students.manage";

export type StudentListRow = {
  id: string;
  studentNumber: string;
  admissionNumber: string;
  name: string;
  status: string;
  levelName: string;
  className: string;
  streamName: string;
  guardianName: string;
};

export type StudentGuardianRow = {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
};

export type StudentProfile = {
  id: string;
  studentNumber: string;
  admissionNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: string;
  phone: string;
  email: string;
  status: string;
  academicYearName: string;
  termName: string;
  levelName: string;
  className: string;
  streamName: string;
  enrollmentStatus: string;
  attendanceEligible: boolean;
  guardians: StudentGuardianRow[];
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

export async function listSchoolStudentsAction(
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
    const streamIds = await resolvePlacementStreamIds(ctx, input, scope);
    let allowedIds: string[] | null = null;
    if (streamIds) {
      if (!streamIds.length) {
        return {
          ok: true as const,
          students: [] as StudentListRow[],
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
      allowedIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
      if (!allowedIds.length) {
        return {
          ok: true as const,
          students: [] as StudentListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels: await loadActiveLevels(ctx),
          capabilities: { canView: true, canManage: canManage(user) },
        };
      }
    }
    let query = supabase
      .from("sch_students")
      .select("id, student_number, admission_number, first_name, middle_name, last_name, status", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (allowedIds) query = query.in("id", allowedIds);
    if (q) {
      query = query.or(`student_number.ilike.%${q}%,admission_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const students = (result.data ?? []) as Record<string, unknown>[];
    const ids = students.map((row) => String(row.id));
    const placement = new Map<string, { levelName: string; className: string; streamName: string }>();
    const guardians = new Map<string, string>();
    if (ids.length) {
      const [enrollments, links] = await Promise.all([
        supabase
          .from("sch_student_enrollments")
          .select("student_id, stream_id")
          .eq("business_unit_id", businessUnitId)
          .eq("status", "active")
          .in("student_id", ids),
        supabase
          .from("sch_student_guardians")
          .select("student_id, is_primary, sch_guardians(full_name)")
          .eq("business_unit_id", businessUnitId)
          .in("student_id", ids)
          .order("is_primary", { ascending: false }),
      ]);
      const byStream = await loadPlacementByStreamIds(
        ctx,
        (enrollments.data ?? []).map((row) => str(row.stream_id)),
      );
      for (const row of enrollments.data ?? []) {
        const place = byStream.get(str(row.stream_id));
        if (place) placement.set(String(row.student_id), place);
      }
      for (const row of links.data ?? []) {
        const studentId = String(row.student_id);
        if (guardians.has(studentId)) continue;
        const guardian = row.sch_guardians as { full_name?: string } | { full_name?: string }[] | null;
        const name = Array.isArray(guardian) ? str(guardian[0]?.full_name) : str(guardian?.full_name);
        if (name) guardians.set(studentId, name);
      }
    }
    const rows: StudentListRow[] = students.map((row) => {
      const place = placement.get(String(row.id));
      return {
        id: String(row.id),
        studentNumber: str(row.student_number),
        admissionNumber: str(row.admission_number),
        name: [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
        status: str(row.status) || "active",
        levelName: place?.levelName ?? "",
        className: place?.className ?? "",
        streamName: place?.streamName ?? "",
        guardianName: guardians.get(String(row.id)) ?? "",
      };
    });
    return {
      ok: true as const,
      students: rows,
      page: schoolPageMeta(page, result.count ?? rows.length, pageSize),
      levels: await loadActiveLevels(ctx),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolStudentAction(id: string) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const studentId = str(id);
    if (!studentId) throw new SchoolError("Student was not found.", "NOT_FOUND");
    const studentRes = await supabase
      .from("sch_students")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .eq("id", studentId)
      .maybeSingle();
    if (studentRes.error && !isSchoolUnconfiguredRead(studentRes.error)) mapSchoolDbError(studentRes.error, "load");
    if (!studentRes.data) throw new SchoolError("Student was not found.", "NOT_FOUND");
    const row = studentRes.data as Record<string, unknown>;

    const [enrollmentRes, linksRes] = await Promise.all([
      supabase
        .from("sch_student_enrollments")
        .select(
          "status, academic_year_id, term_id, stream_id, sch_class_streams(name, sch_classes(name, sch_class_levels(name))), sch_academic_years(name), sch_terms(name)",
        )
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("sch_student_guardians")
        .select("relationship, is_primary, guardian_id, sch_guardians(id, full_name, phone, email)")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId),
    ]);

    const enrollment = enrollmentRes.data as
      | {
          status?: string;
          stream_id?: string;
          sch_class_streams?: { name?: string; sch_classes?: { name?: string; sch_class_levels?: { name?: string } | null } | null };
          sch_academic_years?: { name?: string } | null;
          sch_terms?: { name?: string } | null;
        }
      | null;
    const stream = enrollment?.sch_class_streams;
    const guardians: StudentGuardianRow[] = (linksRes.data ?? []).map((link) => {
      const guardian = link.sch_guardians as { id?: string; full_name?: string; phone?: string; email?: string } | null;
      return {
        id: str(guardian?.id ?? link.guardian_id),
        fullName: str(guardian?.full_name),
        relationship: str(link.relationship),
        phone: str(guardian?.phone),
        email: str(guardian?.email),
        isPrimary: Boolean(link.is_primary),
      };
    });
    const profile: StudentProfile = {
      id: String(row.id),
      studentNumber: str(row.student_number),
      admissionNumber: str(row.admission_number),
      firstName: str(row.first_name),
      middleName: str(row.middle_name),
      lastName: str(row.last_name),
      dateOfBirth: String(row.date_of_birth ?? ""),
      gender: str(row.gender),
      nationality: str(row.nationality),
      address: str(row.address),
      phone: str(row.phone),
      email: str(row.email),
      status: str(row.status) || "active",
      academicYearName: str(enrollment?.sch_academic_years?.name),
      termName: str(enrollment?.sch_terms?.name),
      levelName: str(stream?.sch_classes?.sch_class_levels?.name),
      className: str(stream?.sch_classes?.name),
      streamName: str(stream?.name),
      enrollmentStatus: str(enrollment?.status),
      attendanceEligible: str(row.status) === "active" && str(enrollment?.status) === "active",
      guardians,
    };
    return { ok: true as const, student: profile, capabilities: { canView: true, canManage: canManage(user) } };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
