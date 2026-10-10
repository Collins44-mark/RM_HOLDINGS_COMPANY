"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { catalogLookup, loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { findApplicableFeeStructure } from "@/lib/school/fee-structure";
import { loadPlacementByClassIds, loadPlacementByStreamIds } from "@/lib/school/placement-query";

const STUDENTS_MANAGE = "school.students.manage";
const STUDENTS_WITHDRAW = "school.students.withdraw";
const STUDENTS_TRANSFER = "school.students.transfer";
const PROMOTIONS_VIEW = "school.promotions.view";
const PROMOTIONS_MANAGE = "school.promotions.manage";

export type ProgressionOutcome = "PROMOTE" | "RETAIN" | "TRANSFER" | "GRADUATE" | "EXCLUDE";

export type PromotionPreviewStudent = {
  studentId: string;
  name: string;
  studentNumber: string;
  admissionNumber: string;
  enrollmentId: string;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  suggestedOutcome: ProgressionOutcome;
  needsSelection: boolean;
  suggestedLevelId: string;
  suggestedClassId: string;
  suggestedClassName: string;
  suggestedLevelName: string;
  suggestionNote: string;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function dateValue(value: unknown, label: string) {
  const next = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new SchoolError(`${label} is invalid.`, "VALIDATION");
  return next;
}

function reasonValue(value: unknown, label: string) {
  const next = str(value);
  if (next.length < 3) throw new SchoolError(`${label} is required.`, "VALIDATION");
  if (next.length > 400) throw new SchoolError(`${label} is too long.`, "VALIDATION");
  return next;
}

function rpcError(error: { message?: string; code?: string } | null, fallback: string): never {
  const message = str(error?.message);
  if (message && !/schema cache|does not exist|permission denied|PGRST/i.test(message)) {
    throw new SchoolError(message.slice(0, 240), "VALIDATION");
  }
  mapSchoolDbError(error ? { message: error.message ?? fallback, code: error.code } : null, "save");
  throw new SchoolError(fallback, "DATABASE");
}

function revalidateLifecycle(studentId?: string) {
  revalidatePath("/school");
  revalidatePath("/school/students");
  revalidatePath("/school/admissions");
  revalidatePath("/school/promotions");
  revalidatePath("/school/reports");
  revalidatePath("/school/parents");
  revalidatePath("/school/fees");
  if (studentId) revalidatePath(`/school/students/${studentId}`);
}

export async function withdrawSchoolStudentAction(input: {
  studentId: string;
  withdrawnOn: string;
  reason: string;
  requestId: string;
}) {
  try {
    const ctx = await requireAnySchoolPermission([STUDENTS_WITHDRAW, STUDENTS_MANAGE]);
    const { supabase, businessUnitId, userId } = ctx;
    const studentId = str(input.studentId);
    const { data, error } = await supabase.rpc("sch_withdraw_student", {
      p_student_id: studentId,
      p_withdrawn_on: dateValue(input.withdrawnOn, "Withdrawal date"),
      p_reason: reasonValue(input.reason, "Withdrawal reason"),
      p_request_id: str(input.requestId) || crypto.randomUUID(),
      p_actor_id: userId,
    });
    if (error) rpcError(error, "Couldn't withdraw this student.");
    const result = (data ?? {}) as Record<string, unknown>;
    if (!result.duplicate) {
      await writeAuditEvent({
        action: "school.student_withdrawn",
        description: `Student withdrawn · ${studentId}`,
        entityType: "sch_students",
        entityId: studentId,
        businessUnitId,
        module: "school",
        severity: "medium",
      });
    }
    revalidateLifecycle(studentId);
    return { ok: true as const, duplicate: Boolean(result.duplicate) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function changeSchoolStudentClassAction(input: {
  studentId: string;
  academicYearId: string;
  levelId: string;
  classId: string;
  streamId: string;
  effectiveOn: string;
  reason: string;
  requestId: string;
}) {
  try {
    const ctx = await requireAnySchoolPermission([STUDENTS_TRANSFER, STUDENTS_MANAGE]);
    const { supabase, businessUnitId, userId } = ctx;
    const studentId = str(input.studentId);
    const { data, error } = await supabase.rpc("sch_change_student_class", {
      p_student_id: studentId,
      p_year_id: str(input.academicYearId),
      p_level_id: str(input.levelId),
      p_class_id: str(input.classId),
      p_stream_id: str(input.streamId) || null,
      p_effective_on: dateValue(input.effectiveOn, "Effective date"),
      p_reason: reasonValue(input.reason, "Reason"),
      p_request_id: str(input.requestId) || crypto.randomUUID(),
      p_actor_id: userId,
    });
    if (error) rpcError(error, "Couldn't change this student's class.");
    const result = (data ?? {}) as Record<string, unknown>;
    if (!result.duplicate) {
      await writeAuditEvent({
        action: "school.student_class_changed",
        description: `Student class changed · ${studentId}`,
        entityType: "sch_students",
        entityId: studentId,
        businessUnitId,
        module: "school",
        severity: "medium",
      });
    }
    revalidateLifecycle(studentId);
    return { ok: true as const, duplicate: Boolean(result.duplicate), enrollmentId: result.enrollment_id ? String(result.enrollment_id) : null };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

function suggestNextClass(
  catalog: Awaited<ReturnType<typeof loadSchoolStructureCatalog>>,
  levelId: string,
  classId: string,
) {
  const levelName = catalog.levels.find((row) => row.id === levelId)?.name ?? "";
  const levelClasses = catalog.classes.filter((row) => row.levelId === levelId);
  const index = levelClasses.findIndex((row) => row.id === classId);
  if (index >= 0 && index < levelClasses.length - 1) {
    const next = levelClasses[index + 1];
    return {
      suggestedOutcome: "PROMOTE" as const,
      needsSelection: false,
      suggestedLevelId: levelId,
      suggestedClassId: next.id,
      suggestedClassName: next.name,
      suggestedLevelName: levelName,
      suggestionNote: `Suggested next class in ${levelName || "this level"}.`,
    };
  }
  const levelIndex = catalog.levels.findIndex((row) => row.id === levelId);
  const hasNextLevel = levelIndex >= 0 && levelIndex < catalog.levels.length - 1;
  return {
    suggestedOutcome: (hasNextLevel ? "EXCLUDE" : "GRADUATE") as ProgressionOutcome,
    needsSelection: true,
    suggestedLevelId: "",
    suggestedClassId: "",
    suggestedClassName: "",
    suggestedLevelName: hasNextLevel ? catalog.levels[levelIndex + 1]?.name ?? "" : "",
    suggestionNote: hasNextLevel
      ? "This is the last class in the current level. Choose a destination or exclude the student."
      : "This is the last class in the school structure. Mark as graduated/completed or exclude.",
  };
}

export async function previewSchoolPromotionsAction(input: { fromYearId: string; toYearId: string }) {
  try {
    const ctx = await requireAnySchoolPermission([PROMOTIONS_VIEW, PROMOTIONS_MANAGE, STUDENTS_MANAGE]);
    const { supabase, businessUnitId } = ctx;
    const fromYearId = str(input.fromYearId);
    const toYearId = str(input.toYearId);
    if (!fromYearId || !toYearId) throw new SchoolError("Select current and target academic years.", "VALIDATION");
    if (fromYearId === toYearId) throw new SchoolError("Target academic year must be different from the current year.", "VALIDATION");
    const catalog = await loadSchoolStructureCatalog(ctx);
    const lookup = catalogLookup(catalog);
    if (!catalog.years.some((row) => row.id === fromYearId)) throw new SchoolError("The current academic year was not found.", "NOT_FOUND");
    const toYear = catalog.years.find((row) => row.id === toYearId);
    if (!toYear) throw new SchoolError("The target academic year is not active.", "VALIDATION");

    const enrollments = await supabase
      .from("sch_student_enrollments")
      .select("id, student_id, class_id, stream_id, sch_students!inner(id, student_number, admission_number, first_name, middle_name, last_name, status)")
      .eq("business_unit_id", businessUnitId)
      .eq("academic_year_id", fromYearId)
      .eq("status", "active")
      .eq("sch_students.status", "active");
    if (enrollments.error && !isSchoolUnconfiguredRead(enrollments.error)) mapSchoolDbError(enrollments.error, "load");

    const existingTarget = await supabase
      .from("sch_student_enrollments")
      .select("student_id")
      .eq("business_unit_id", businessUnitId)
      .eq("academic_year_id", toYearId)
      .eq("status", "active");
    const alreadyPromoted = new Set((existingTarget.data ?? []).map((row) => String(row.student_id)));

    const classIds = [...new Set((enrollments.data ?? []).map((row) => str(row.class_id)).filter(Boolean))];
    const streamIds = [...new Set((enrollments.data ?? []).map((row) => str(row.stream_id)).filter(Boolean))];
    const [byClass, byStream, subjectRes, feeRes] = await Promise.all([
      loadPlacementByClassIds(ctx, classIds),
      loadPlacementByStreamIds(ctx, streamIds),
      classIds.length
        ? supabase
            .from("sch_class_subjects")
            .select("class_id, is_active, sch_subjects(name)")
            .eq("business_unit_id", businessUnitId)
            .eq("is_active", true)
            .in("class_id", classIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      Promise.all(
        classIds.map(async (classId) => {
          const fee = await findApplicableFeeStructure({
            supabase,
            businessUnitId,
            academicYearId: toYearId,
            classId,
          });
          return [classId, fee] as const;
        }),
      ),
    ]);
    const feesByClass = new Map(feeRes);
    const subjectsByClass = new Map<string, string[]>();
    for (const row of subjectRes.data ?? []) {
      const classId = str((row as { class_id?: string }).class_id);
      const subject = (row as { sch_subjects?: { name?: string } | { name?: string }[] | null }).sch_subjects;
      const name = Array.isArray(subject) ? str(subject[0]?.name) : str(subject?.name);
      if (!classId || !name) continue;
      const list = subjectsByClass.get(classId) ?? [];
      list.push(name);
      subjectsByClass.set(classId, list);
    }

    const students: PromotionPreviewStudent[] = [];
    for (const row of enrollments.data ?? []) {
      const student = row.sch_students as Record<string, unknown> | Record<string, unknown>[] | null;
      const profile = Array.isArray(student) ? student[0] : student;
      if (!profile) continue;
      const studentId = str(profile.id);
      if (alreadyPromoted.has(studentId)) continue;
      const streamId = str(row.stream_id);
      const classId = str(row.class_id);
      const place = streamId ? lookup.placement(streamId) ?? byStream.get(streamId) : lookup.placementByClass(classId) ?? byClass.get(classId);
      const levelId = place?.levelId ?? "";
      const suggestion = suggestNextClass(catalog, levelId, classId);
      students.push({
        studentId,
        name: [str(profile.first_name), str(profile.middle_name), str(profile.last_name)].filter(Boolean).join(" "),
        studentNumber: str(profile.student_number),
        admissionNumber: str(profile.admission_number),
        enrollmentId: str(row.id),
        levelId,
        levelName: place?.levelName ?? "",
        classId,
        className: place?.className ?? "",
        streamId,
        streamName: place?.streamName ?? "",
        ...suggestion,
      });
    }

    const destClasses = catalog.classes.map((row) => ({
      id: row.id,
      name: row.name,
      levelId: row.levelId,
      feeConfigured: Boolean(feesByClass.get(row.id)),
      annualAmount: feesByClass.get(row.id)?.annualAmount ?? null,
      subjects: subjectsByClass.get(row.id) ?? [],
    }));

    const priorRuns = await supabase
      .from("sch_promotion_runs")
      .select("id, created_at, promoted_count, retained_count, transferred_count, graduated_count, excluded_count, failed_count")
      .eq("business_unit_id", businessUnitId)
      .eq("from_year_id", fromYearId)
      .eq("to_year_id", toYearId)
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      ok: true as const,
      fromYearId,
      toYearId,
      fromYearName: lookup.yearName(fromYearId),
      toYearName: toYear.name,
      students,
      years: catalog.years,
      levels: catalog.levels,
      classes: destClasses,
      streams: catalog.streams,
      priorRuns: (priorRuns.data ?? []).map((row) => ({
        id: str(row.id),
        createdAt: str(row.created_at),
        promoted: Number(row.promoted_count ?? 0),
        retained: Number(row.retained_count ?? 0),
        transferred: Number(row.transferred_count ?? 0),
        graduated: Number(row.graduated_count ?? 0),
        excluded: Number(row.excluded_count ?? 0),
        failed: Number(row.failed_count ?? 0),
      })),
      alreadyInTarget: alreadyPromoted.size,
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function confirmSchoolPromotionsAction(input: {
  fromYearId: string;
  toYearId: string;
  effectiveOn: string;
  requestId: string;
  students: Array<{
    studentId: string;
    outcome: ProgressionOutcome;
    levelId?: string;
    classId?: string;
    streamId?: string;
    reason?: string;
  }>;
}) {
  try {
    const ctx = await requireAnySchoolPermission([PROMOTIONS_MANAGE, STUDENTS_MANAGE]);
    const user = await requireAuth();
    const { supabase, businessUnitId, userId } = ctx;
    if (!hasPerm(user, PROMOTIONS_MANAGE) && !hasPerm(user, STUDENTS_MANAGE)) {
      throw new SchoolError("This action isn’t available.", "UNAUTHORIZED");
    }
    const { data, error } = await supabase.rpc("sch_apply_promotion_run", {
      p_from_year_id: str(input.fromYearId),
      p_to_year_id: str(input.toYearId),
      p_students: input.students.map((row) => ({
        studentId: str(row.studentId),
        outcome: row.outcome,
        levelId: str(row.levelId),
        classId: str(row.classId),
        streamId: str(row.streamId),
        reason: str(row.reason),
      })),
      p_effective_on: dateValue(input.effectiveOn, "Effective date"),
      p_request_id: str(input.requestId) || crypto.randomUUID(),
      p_actor_id: userId,
    });
    if (error) rpcError(error, "Couldn't save this progression run.");
    const result = (data ?? {}) as Record<string, unknown>;
    if (!result.duplicate) {
      await writeAuditEvent({
        action: "school.promotion_confirmed",
        description: `Academic progression ${str(input.fromYearId)} → ${str(input.toYearId)}`,
        entityType: "sch_promotion_runs",
        entityId: result.id ? String(result.id) : str(input.requestId),
        businessUnitId,
        module: "school",
        severity: "medium",
      });
    }
    revalidateLifecycle();
    return {
      ok: true as const,
      duplicate: Boolean(result.duplicate),
      promoted: Number(result.promoted ?? 0),
      retained: Number(result.retained ?? 0),
      transferred: Number(result.transferred ?? 0),
      graduated: Number(result.graduated ?? 0),
      excluded: Number(result.excluded ?? 0),
      failed: Number(result.failed ?? 0),
      failures: Array.isArray(result.failures)
        ? (result.failures as Array<{ studentId?: string; error?: string }>).map((row) => ({
            studentId: str(row.studentId),
            error: str(row.error),
          }))
        : [],
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function loadSchoolPromotionYearsAction() {
  try {
    const user = await requireAuth();
    const ctx = await requireAnySchoolPermission([PROMOTIONS_VIEW, PROMOTIONS_MANAGE, STUDENTS_MANAGE]);
    const catalog = await loadSchoolStructureCatalog(ctx);
    return {
      ok: true as const,
      years: catalog.years,
      today: new Date().toISOString().slice(0, 10),
      canManage: hasPerm(user, PROMOTIONS_MANAGE) || hasPerm(user, STUDENTS_MANAGE),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), years: [] as Array<{ id: string; name: string; isCurrent: boolean }>, canManage: false };
  }
}

export async function loadSchoolClassChangeOptionsAction() {
  try {
    await requireAnySchoolPermission([STUDENTS_TRANSFER, STUDENTS_MANAGE, STUDENTS_WITHDRAW]);
    const ctx = await requireSchoolPermission("school.students.view");
    const catalog = await loadSchoolStructureCatalog(ctx);
    return {
      ok: true as const,
      years: catalog.years,
      levels: catalog.levels,
      classes: catalog.classes,
      streams: catalog.streams,
      today: new Date().toISOString().slice(0, 10),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
