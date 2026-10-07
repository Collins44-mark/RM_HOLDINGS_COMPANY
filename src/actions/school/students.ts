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
import { allowsStream, loadSchoolStructureScope } from "@/lib/school/structure-scope";
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";

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

export async function listSchoolStudentsAction(input: { page?: number; q?: string } = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const q = searchNeedle(input.q);
    let query = supabase
      .from("sch_students")
      .select("id, student_number, admission_number, first_name, middle_name, last_name, status", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (q) {
      query = query.or(`student_number.ilike.%${q}%,admission_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const students = (result.data ?? []) as Record<string, unknown>[];
    const ids = students.map((row) => String(row.id));
    const placement = new Map<string, { levelName: string; className: string; streamName: string; streamId: string }>();
    if (ids.length) {
      const enrollments = await supabase
        .from("sch_student_enrollments")
        .select("student_id, stream_id, sch_class_streams(id, name, sch_classes(name, sch_class_levels(name)))")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .in("student_id", ids);
      for (const row of enrollments.data ?? []) {
        const stream = row.sch_class_streams as
          | { id?: string; name?: string; sch_classes?: { name?: string; sch_class_levels?: { name?: string } | null } | null }
          | null;
        placement.set(String(row.student_id), {
          streamId: str(row.stream_id),
          streamName: str(stream?.name),
          className: str(stream?.sch_classes?.name),
          levelName: str(stream?.sch_classes?.sch_class_levels?.name),
        });
      }
    }
    const rows: StudentListRow[] = students
      .map((row) => {
        const place = placement.get(String(row.id));
        if (place && !scope.schoolWide && !allowsStream(scope, place.streamId)) return null;
        return {
          id: String(row.id),
          studentNumber: str(row.student_number),
          admissionNumber: str(row.admission_number),
          name: [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
          status: str(row.status) || "active",
          levelName: place?.levelName ?? "",
          className: place?.className ?? "",
          streamName: place?.streamName ?? "",
        };
      })
      .filter((row): row is StudentListRow => Boolean(row));
    return {
      ok: true as const,
      students: rows,
      page: schoolPageMeta(page, result.count ?? rows.length, pageSize),
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
