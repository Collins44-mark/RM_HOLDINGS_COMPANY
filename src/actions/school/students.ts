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
import {
  enrollmentPlacementOr,
  loadPlacementByClassIds,
  loadPlacementByStreamIds,
  resolveEnrollmentPlacementFilter,
} from "@/lib/school/placement-query";
import { catalogLookup, loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { writeAuditEvent } from "@/lib/audit";

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
  address: string;
  occupation: string;
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
  classId: string;
  streamId: string;
  enrollmentId: string | null;
  streams: Array<{ id: string; name: string }>;
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

function canEditGuardians(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission("school.parents.manage", matcher));
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
    const [scope, catalog] = await Promise.all([loadSchoolStructureScope(ctx), loadSchoolStructureCatalog(ctx)]);
    const levels = catalog.levels.filter((row) => scope.schoolWide || scope.levelIds.has(row.id));
    const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : SCHOOL_PAGE_SIZE;
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const placementFilter = await resolveEnrollmentPlacementFilter(ctx, input, scope);
    const placementOr = enrollmentPlacementOr(placementFilter);
    let allowedIds: string[] | null = null;
    if (placementOr) {
      const enrollments = await supabase
        .from("sch_student_enrollments")
        .select("student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .or(placementOr);
      allowedIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
      if (!allowedIds.length) {
        return {
          ok: true as const,
          students: [] as StudentListRow[],
          page: schoolPageMeta(1, 0, pageSize),
          levels,
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
          .select("student_id, stream_id, class_id")
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
      const lookup = catalogLookup(catalog);
      const missingStreams = (enrollments.data ?? []).map((row) => str(row.stream_id)).filter((id) => id && !lookup.placement(id));
      const missingClasses = (enrollments.data ?? [])
        .filter((row) => !str(row.stream_id))
        .map((row) => str(row.class_id))
        .filter((id) => id && !lookup.placementByClass(id));
      const [byStream, byClass] = await Promise.all([
        missingStreams.length ? loadPlacementByStreamIds(ctx, missingStreams) : Promise.resolve(new Map()),
        missingClasses.length ? loadPlacementByClassIds(ctx, missingClasses) : Promise.resolve(new Map()),
      ]);
      for (const row of enrollments.data ?? []) {
        const streamId = str(row.stream_id);
        const classId = str(row.class_id);
        const place = streamId
          ? lookup.placement(streamId) ?? byStream.get(streamId)
          : lookup.placementByClass(classId) ?? byClass.get(classId);
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
      levels,
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
      .select(
        "id, student_number, admission_number, first_name, middle_name, last_name, date_of_birth, gender, nationality, address, status",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("id", studentId)
      .maybeSingle();
    if (studentRes.error && !isSchoolUnconfiguredRead(studentRes.error)) mapSchoolDbError(studentRes.error, "load");
    if (!studentRes.data) throw new SchoolError("Student was not found.", "NOT_FOUND");
    const row = studentRes.data as Record<string, unknown>;

    const [enrollmentRes, linksRes, catalog] = await Promise.all([
      supabase
        .from("sch_student_enrollments")
        .select("id, status, academic_year_id, term_id, stream_id, class_id")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("sch_student_guardians")
        .select("relationship, is_primary, guardian_id, sch_guardians(id, full_name, phone, email, address, occupation)")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId),
      loadSchoolStructureCatalog(ctx),
    ]);

    const enrollment = enrollmentRes.data as
      | { id?: string; status?: string; academic_year_id?: string; term_id?: string; stream_id?: string; class_id?: string }
      | null;
    const streamId = str(enrollment?.stream_id);
    const classId = str(enrollment?.class_id);
    const lookup = catalogLookup(catalog);
    const [yearRes, termRes, streamFallback, classFallback] = await Promise.all([
      enrollment?.academic_year_id
        ? supabase.from("sch_academic_years").select("name").eq("id", String(enrollment.academic_year_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      enrollment?.term_id
        ? supabase.from("sch_terms").select("name").eq("id", String(enrollment.term_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      streamId && !lookup.placement(streamId) ? loadPlacementByStreamIds(ctx, [streamId]) : Promise.resolve(new Map()),
      !streamId && classId && !lookup.placementByClass(classId)
        ? loadPlacementByClassIds(ctx, [classId])
        : Promise.resolve(new Map()),
    ]);
    const place = streamId
      ? lookup.placement(streamId) ?? streamFallback.get(streamId)
      : lookup.placementByClass(classId) ?? classFallback.get(classId);
    const streams = classId ? catalog.streams.filter((row) => row.classId === classId) : [];
    const guardians: StudentGuardianRow[] = (linksRes.data ?? []).map((link) => {
      const guardian = link.sch_guardians as {
        id?: string;
        full_name?: string;
        phone?: string;
        email?: string;
        address?: string;
        occupation?: string;
      } | null;
      return {
        id: str(guardian?.id ?? link.guardian_id),
        fullName: str(guardian?.full_name),
        relationship: str(link.relationship),
        phone: str(guardian?.phone),
        email: str(guardian?.email),
        address: str(guardian?.address),
        occupation: str(guardian?.occupation),
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
      phone: "",
      email: "",
      status: str(row.status) || "active",
      academicYearName: str(yearRes.data?.name),
      termName: str(termRes.data?.name),
      levelName: place?.levelName ?? "",
      className: place?.className ?? "",
      streamName: place?.streamName ?? "",
      classId,
      streamId,
      enrollmentId: enrollment?.id ? String(enrollment.id) : null,
      streams: streams.map((row) => ({ id: row.id, name: row.name })),
      enrollmentStatus: str(enrollment?.status),
      attendanceEligible: str(row.status) === "active" && str(enrollment?.status) === "active",
      guardians,
    };
    return {
      ok: true as const,
      student: profile,
      capabilities: { canView: true, canManage: canManage(user), canEditGuardians: canEditGuardians(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function assignSchoolStudentStreamAction(input: { studentId: string; streamId: string }) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const studentId = str(input.studentId);
    const streamId = str(input.streamId);
    if (!studentId) throw new SchoolError("Student was not found.", "NOT_FOUND");
    const enrollment = await supabase
      .from("sch_student_enrollments")
      .select("id, class_id, stream_id, student_id")
      .eq("business_unit_id", businessUnitId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();
    if (enrollment.error && !isSchoolUnconfiguredRead(enrollment.error)) mapSchoolDbError(enrollment.error, "save");
    if (!enrollment.data?.id) throw new SchoolError("An active enrollment was not found.", "NOT_FOUND");
    const classId = str(enrollment.data.class_id);
    if (streamId) {
      const stream = await supabase
        .from("sch_class_streams")
        .select("id, class_id, is_active, name")
        .eq("business_unit_id", businessUnitId)
        .eq("id", streamId)
        .maybeSingle();
      if (!stream.data?.id || !stream.data.is_active) throw new SchoolError("The selected stream is not valid.", "VALIDATION");
      if (str(stream.data.class_id) !== classId) {
        throw new SchoolError("The selected stream does not belong to that class.", "VALIDATION");
      }
    }
    const updated = await supabase
      .from("sch_student_enrollments")
      .update({ stream_id: streamId || null })
      .eq("id", String(enrollment.data.id))
      .select("id")
      .maybeSingle();
    if (updated.error) mapSchoolDbError(updated.error, "save");
    await supabase.from("sch_admissions").update({ stream_id: streamId || null }).eq("student_id", studentId).eq("business_unit_id", businessUnitId);
    await writeAuditEvent({
      action: "school.student_stream_assigned",
      description: streamId ? `Student stream updated` : `Student stream cleared`,
      entityType: "sch_student_enrollments",
      entityId: String(enrollment.data.id),
      businessUnitId,
      module: "school",
      severity: "medium",
    });
    return { ok: true as const, streamId: streamId || null };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
