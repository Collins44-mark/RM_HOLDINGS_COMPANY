"use server";

import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolEmptyRead,
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { parseSchoolPage, parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import { loadSchoolStructureCatalog, type SchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { SCHOOL_EXAM_TYPES, type SchoolExamStatus, type SchoolExamType } from "@/lib/school/exam-types";

const VIEW = "school.exams.view";
const MANAGE = "school.exams.manage";
const ENTER = "school.results.enter";
const PUBLISH = "school.results.publish";

export type SchoolExamCapabilities = {
  canView: boolean;
  canManage: boolean;
  canEnter: boolean;
  canPublish: boolean;
};

export type SchoolExamRow = {
  id: string;
  name: string;
  examType: SchoolExamType;
  examDate: string;
  status: SchoolExamStatus;
  maxMarks: number;
  classId: string;
  className: string;
  levelId: string;
  levelName: string;
  yearName: string;
  termName: string | null;
  subjectCount: number;
};

export type SchoolExamSubjectOption = { id: string; name: string };
export type SchoolExamStudentRow = {
  studentId: string;
  enrollmentId: string;
  admissionNumber: string;
  name: string;
};
export type SchoolExamMark = {
  studentId: string;
  subjectId: string;
  enrollmentId: string;
  marks: number;
  grade: string | null;
};

export type SchoolExamDetail = {
  exam: SchoolExamRow;
  schoolName: string;
  subjects: SchoolExamSubjectOption[];
  students: SchoolExamStudentRow[];
  marks: SchoolExamMark[];
  gradingConfigured: boolean;
  gradingMessage: string | null;
};

export type SchoolExamsWorkspace = {
  exams: SchoolExamRow[];
  page: ReturnType<typeof schoolPageMeta>;
  query: string;
  classId: string;
  catalog: SchoolStructureCatalog;
  classSubjects: SchoolExamSubjectOption[];
  capabilities: SchoolExamCapabilities;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function can(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>): SchoolExamCapabilities {
  return {
    canView: can(user, VIEW) || can(user, MANAGE) || can(user, ENTER) || can(user, PUBLISH),
    canManage: can(user, MANAGE),
    canEnter: can(user, ENTER) || can(user, MANAGE),
    canPublish: can(user, PUBLISH) || can(user, MANAGE),
  };
}

function mapRpcError(error: { message?: string; code?: string } | null): never {
  const raw = String(error?.message ?? "");
  const message = raw.replace(/^[A-Z0-9]+:\s*/i, "").split("\n")[0]?.slice(0, 180) ?? "";
  if (
    message &&
    !/sql|postgres|relation|column|permission denied|schema cache/i.test(message) &&
    /class|subject|name|exam|mark|term|year|authenticated|available|found|enroll|maximum/i.test(message)
  ) {
    throw new SchoolError(message, error?.code === "42501" ? "PRIVILEGE" : "VALIDATION");
  }
  mapSchoolDbError(error ? { message: error.message ?? "", code: error.code } : null);
}

function missingExamSchema(error: { message?: string; code?: string } | null) {
  if (!error || isSchoolEmptyRead(error)) return false;
  return isSchoolUnconfiguredRead(error);
}

function mapExam(
  row: Record<string, unknown>,
  catalog: SchoolStructureCatalog,
  subjectCount: number,
): SchoolExamRow {
  const classId = String(row.class_id);
  const schoolClass = catalog.classes.find((item) => item.id === classId);
  const level = catalog.levels.find((item) => item.id === schoolClass?.levelId);
  const year = catalog.years.find((item) => item.id === String(row.academic_year_id));
  const term = catalog.terms.find((item) => item.id === String(row.term_id ?? ""));
  return {
    id: String(row.id),
    name: String(row.name),
    examType: (SCHOOL_EXAM_TYPES.includes(row.exam_type as SchoolExamType) ? row.exam_type : "other") as SchoolExamType,
    examDate: String(row.exam_date),
    status: row.status === "published" ? "published" : "draft",
    maxMarks: Number(row.max_marks) || 0,
    classId,
    className: schoolClass?.name ?? "—",
    levelId: schoolClass?.levelId ?? "",
    levelName: level?.name ?? "—",
    yearName: year?.name ?? "—",
    termName: term?.name ?? null,
    subjectCount,
  };
}

export async function getSchoolExamsWorkspaceAction(input?: {
  page?: number;
  pageSize?: number;
  q?: string;
  classId?: string;
}): Promise<{ ok: true; workspace: SchoolExamsWorkspace } | { ok: false; error: string }> {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, ENTER, PUBLISH]);
    const capabilities = caps(user);
    const catalog = await loadSchoolStructureCatalog({ supabase, businessUnitId, userId: user.id });
    const query = str(input?.q).slice(0, 80);
    const classId = str(input?.classId);
    const { page, from, to, pageSize } = schoolPageRange(parseSchoolPage(input?.page), parseSchoolPageSize(input?.pageSize));

    let examQuery = supabase
      .from("sch_exams")
      .select("id, name, exam_type, exam_date, status, max_marks, class_id, academic_year_id, term_id", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("exam_date", { ascending: false });
    if (!capabilities.canEnter && !capabilities.canManage && !capabilities.canPublish) {
      examQuery = examQuery.eq("status", "published");
    }
    if (classId) examQuery = examQuery.eq("class_id", classId);
    if (query) examQuery = examQuery.ilike("name", `%${query}%`);
    const examsRes = await examQuery.range(from, to);
    if (missingExamSchema(examsRes.error)) {
      throw new SchoolError("Exams aren’t available on this database yet.", "NOT_CONFIGURED");
    }
    if (examsRes.error && !isSchoolUnconfiguredRead(examsRes.error)) mapSchoolDbError(examsRes.error, "load");

    const examIds = (examsRes.data ?? []).map((row) => String(row.id));
    const papersRes = examIds.length
      ? await supabase.from("sch_exam_papers").select("exam_id").in("exam_id", examIds)
      : { data: [] as Array<{ exam_id: string }>, error: null };
    const countByExam = new Map<string, number>();
    for (const row of papersRes.data ?? []) {
      const id = String(row.exam_id);
      countByExam.set(id, (countByExam.get(id) ?? 0) + 1);
    }

    const exams = (examsRes.data ?? []).map((row) => mapExam(row as Record<string, unknown>, catalog, countByExam.get(String(row.id)) ?? 0));
    return {
      ok: true,
      workspace: {
        exams,
        page: schoolPageMeta(page, examsRes.count ?? exams.length, pageSize),
        query,
        classId,
        catalog,
        classSubjects: [],
        capabilities,
      },
    };
  } catch (error) {
    return { ok: false, error: schoolActionError(error) };
  }
}

export async function listSchoolClassAssignedSubjectsAction(classId: string) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, ENTER, PUBLISH]);
    const id = str(classId);
    if (!id) return { ok: true as const, subjects: [] as SchoolExamSubjectOption[] };
    const { data, error } = await supabase
      .from("sch_class_subjects")
      .select("subject_id")
      .eq("business_unit_id", businessUnitId)
      .eq("class_id", id)
      .eq("is_active", true);
    if (missingExamSchema(error)) throw new SchoolError("Subjects aren’t available on this database yet.", "NOT_CONFIGURED");
    if (error && !isSchoolUnconfiguredRead(error)) mapSchoolDbError(error, "load");
    const subjectIds = [...new Set((data ?? []).map((row) => String(row.subject_id)))];
    if (!subjectIds.length) return { ok: true as const, subjects: [] as SchoolExamSubjectOption[] };
    const subjectsRes = await supabase
      .from("sch_subjects")
      .select("id, name, is_active")
      .eq("business_unit_id", businessUnitId)
      .in("id", subjectIds);
    if (subjectsRes.error && !isSchoolUnconfiguredRead(subjectsRes.error)) mapSchoolDbError(subjectsRes.error, "load");
    const subjects = (subjectsRes.data ?? [])
      .filter((row) => row.is_active !== false)
      .map((row) => ({ id: String(row.id), name: String(row.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true as const, subjects };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function createSchoolExamAction(input: {
  name: string;
  examType: string;
  academicYearId: string;
  termId?: string;
  examDate: string;
  classId: string;
  maxMarks?: number;
  subjectIds: string[];
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([MANAGE]);
    const name = str(input.name);
    const examType = str(input.examType);
    const academicYearId = str(input.academicYearId);
    const termId = str(input.termId) || null;
    const examDate = str(input.examDate);
    const classId = str(input.classId);
    const maxMarks = Number(input.maxMarks ?? 100);
    const subjectIds = [...new Set((input.subjectIds ?? []).map(str).filter(Boolean))];
    if (!name) throw new SchoolError("Enter an exam name.", "VALIDATION");
    if (!SCHOOL_EXAM_TYPES.includes(examType as SchoolExamType)) throw new SchoolError("Choose a valid exam type.", "VALIDATION");
    if (!academicYearId) throw new SchoolError("Select an academic year.", "VALIDATION");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) throw new SchoolError("Exam date is invalid.", "VALIDATION");
    if (!classId) throw new SchoolError("Select a class.", "VALIDATION");
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) throw new SchoolError("Maximum marks must be greater than zero.", "VALIDATION");
    if (!subjectIds.length) throw new SchoolError("Select at least one subject assigned to this class.", "VALIDATION");

    const { data, error } = await supabase.rpc("sch_create_exam", {
      p_name: name,
      p_exam_type: examType,
      p_academic_year_id: academicYearId,
      p_term_id: termId,
      p_exam_date: examDate,
      p_class_id: classId,
      p_max_marks: maxMarks,
      p_subject_ids: subjectIds,
    });
    if (error) mapRpcError(error);
    const examId = String(data ?? "");
    await writeAuditEvent({
      action: "school.exam_created",
      module: "school",
      description: `Created exam · ${name}`,
      severity: "medium",
      entityType: "sch_exams",
      entityId: examId || null,
      businessUnitId,
    });
    return { ok: true as const, examId };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolExamDetailAction(examId: string) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE, ENTER, PUBLISH]);
    const capabilities = caps(user);
    const id = str(examId);
    if (!id) throw new SchoolError("Exam was not found.", "NOT_FOUND");
    const catalog = await loadSchoolStructureCatalog({ supabase, businessUnitId, userId: user.id });
    const { data: examRow, error: examError } = await supabase
      .from("sch_exams")
      .select("id, name, exam_type, exam_date, status, max_marks, class_id, academic_year_id, term_id")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (examError && !isSchoolEmptyRead(examError)) {
      if (missingExamSchema(examError)) throw new SchoolError("Exams aren’t available on this database yet.", "NOT_CONFIGURED");
      mapSchoolDbError(examError, "load");
    }
    if (!examRow) throw new SchoolError("Exam was not found.", "NOT_FOUND");
    if (examRow.status !== "published" && !capabilities.canEnter && !capabilities.canManage && !capabilities.canPublish) {
      throw new SchoolError("This exam has not been published.", "UNAUTHORIZED");
    }

    const [papersRes, enrollRes, scaleRes, profileRes, buRes] = await Promise.all([
      supabase.from("sch_exam_papers").select("id, subject_id").eq("exam_id", id).eq("business_unit_id", businessUnitId),
      supabase
        .from("sch_student_enrollments")
        .select("id, student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("class_id", String(examRow.class_id))
        .eq("academic_year_id", String(examRow.academic_year_id))
        .eq("status", "active"),
      supabase
        .from("sch_grading_scales")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .eq("is_current", true)
        .maybeSingle(),
      supabase.from("sch_school_profiles").select("name").eq("business_unit_id", businessUnitId).maybeSingle(),
      supabase.from("business_units").select("name").eq("id", businessUnitId).maybeSingle(),
    ]);
    if (papersRes.error && !isSchoolUnconfiguredRead(papersRes.error)) mapSchoolDbError(papersRes.error, "load");
    if (enrollRes.error && !isSchoolUnconfiguredRead(enrollRes.error)) mapSchoolDbError(enrollRes.error, "load");

    const paperSubjectIds = [...new Set((papersRes.data ?? []).map((row) => String(row.subject_id)))];
    const studentIds = [...new Set((enrollRes.data ?? []).map((row) => String(row.student_id)))];
    const [subjectRows, studentRows] = await Promise.all([
      paperSubjectIds.length
        ? supabase.from("sch_subjects").select("id, name").eq("business_unit_id", businessUnitId).in("id", paperSubjectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      studentIds.length
        ? supabase
            .from("sch_students")
            .select("id, admission_number, first_name, middle_name, last_name")
            .eq("business_unit_id", businessUnitId)
            .in("id", studentIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              admission_number: string | null;
              first_name: string;
              middle_name: string | null;
              last_name: string;
            }>,
            error: null,
          }),
    ]);

    const subjects: SchoolExamSubjectOption[] = (subjectRows.data ?? [])
      .map((row) => ({ id: String(row.id), name: String(row.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const studentById = new Map((studentRows.data ?? []).map((row) => [String(row.id), row]));
    const students: SchoolExamStudentRow[] = (enrollRes.data ?? [])
      .map((row) => {
        const student = studentById.get(String(row.student_id));
        if (!student) return null;
        return {
          studentId: String(student.id),
          enrollmentId: String(row.id),
          admissionNumber: String(student.admission_number ?? ""),
          name: [str(student.first_name), str(student.middle_name), str(student.last_name)].filter(Boolean).join(" "),
        };
      })
      .filter((row): row is SchoolExamStudentRow => Boolean(row))
      .sort((a, b) => a.name.localeCompare(b.name));

    const marksRes = await supabase
      .from("sch_exam_results")
      .select("student_id, subject_id, enrollment_id, marks, grade")
      .eq("exam_id", id)
      .eq("business_unit_id", businessUnitId);
    if (marksRes.error && !isSchoolUnconfiguredRead(marksRes.error)) mapSchoolDbError(marksRes.error, "load");
    const marks: SchoolExamMark[] = (marksRes.data ?? []).map((row) => ({
      studentId: String(row.student_id),
      subjectId: String(row.subject_id),
      enrollmentId: String(row.enrollment_id),
      marks: Number(row.marks),
      grade: row.grade ? String(row.grade) : null,
    }));

    const gradingConfigured = Boolean(scaleRes.data?.id);
    const schoolName = str(profileRes.data?.name) || str(buRes.data?.name) || "School Management";
    return {
      ok: true as const,
      detail: {
        exam: mapExam(examRow as Record<string, unknown>, catalog, subjects.length),
        schoolName,
        subjects,
        students,
        marks,
        gradingConfigured,
        gradingMessage: gradingConfigured
          ? null
          : "No current grading scale is configured. Marks can be saved, but letter grades will not be assigned.",
      } satisfies SchoolExamDetail,
      capabilities,
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolExamResultsAction(input: {
  examId: string;
  marks: Array<{ studentId: string; subjectId: string; enrollmentId: string; marks: number }>;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([ENTER, MANAGE]);
    const examId = str(input.examId);
    if (!examId) throw new SchoolError("Exam was not found.", "NOT_FOUND");
    const marks = (input.marks ?? []).filter((row) => Number.isFinite(Number(row.marks)));
    if (!marks.length) throw new SchoolError("Enter at least one mark.", "VALIDATION");
    const { error } = await supabase.rpc("sch_upsert_exam_results", {
      p_exam_id: examId,
      p_marks: marks.map((row) => ({
        studentId: str(row.studentId),
        subjectId: str(row.subjectId),
        enrollmentId: str(row.enrollmentId),
        marks: Number(row.marks),
      })),
    });
    if (error) mapRpcError(error);
    await writeAuditEvent({
      action: "school.exam_results_saved",
      module: "school",
      description: `Saved ${marks.length} exam result${marks.length === 1 ? "" : "s"}`,
      severity: "medium",
      entityType: "sch_exam_results",
      entityId: examId,
      businessUnitId,
      metadata: { count: marks.length },
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function publishSchoolExamAction(examId: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([PUBLISH, MANAGE]);
    const id = str(examId);
    if (!id) throw new SchoolError("Exam was not found.", "NOT_FOUND");
    const { error } = await supabase
      .from("sch_exams")
      .update({ status: "published", published_by: userId, published_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapSchoolDbError(error);
    await writeAuditEvent({
      action: "school.exam_published",
      module: "school",
      description: "Published exam results",
      severity: "high",
      entityType: "sch_exams",
      entityId: id,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
