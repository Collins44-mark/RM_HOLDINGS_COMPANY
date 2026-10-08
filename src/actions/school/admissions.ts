"use server";

import { writeAuditEvent, writeAuditEvents, type WriteAuditEventInput } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { hasPermission, isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { identityFromUser } from "@/lib/auth/types";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { allowsStream, loadSchoolStructureScope } from "@/lib/school/structure-scope";
import { schoolPageMeta, schoolPageRange, parseSchoolPageSize } from "@/lib/school/pagination";
import { findApplicableFeeStructure, type ApplicableFeeStructure } from "@/lib/school/fee-structure";
import { loadPlacementByStreamIds } from "@/lib/school/placement-query";
import { loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";

const VIEW = "school.admissions.view";
const MANAGE = "school.admissions.manage";

export type AdmissionStatus = "draft" | "completed" | "cancelled";

export type AdmissionListRow = {
  id: string;
  admissionNumber: string;
  studentName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  studentNumber: string | null;
  levelName: string;
  className: string;
  streamName: string;
  admissionDate: string;
  status: AdmissionStatus;
};

export type ApplicableFeeRow = {
  configured: boolean;
  annualAmount: number | null;
  currentTermName: string | null;
  currentTermAmount: number | null;
  termCount: number;
  message: string;
};

export type AdmissionDetail = {
  id: string;
  admissionNumber: string;
  status: AdmissionStatus;
  admissionDate: string;
  academicYearId: string;
  academicYearName: string;
  termId: string;
  termName: string;
  levelId: string;
  levelName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: string;
  phone: string;
  email: string;
  guardianFullName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianAddress: string;
  guardianOccupation: string;
  studentId: string | null;
  studentNumber: string | null;
  attendanceEligible: boolean;
  fee: ApplicableFeeRow;
};

export type AdmissionFormInput = {
  id?: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: string;
  phone: string;
  email: string;
  academicYearId: string;
  termId: string;
  levelId: string;
  classId: string;
  streamId: string;
  admissionDate: string;
  guardianFullName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianAddress: string;
  guardianOccupation: string;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function asStatus(value: unknown): AdmissionStatus {
  const next = str(value);
  if (next === "draft" || next === "completed" || next === "cancelled") return next;
  return "draft";
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

function canConfigureAcademic(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  const identity = identityFromUser(user);
  return hasPermission(identity, "school.settings.view") || hasPermission(identity, "school.settings.manage");
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>) {
  return {
    canView: true,
    canManage: canManage(user),
    canConfigureAcademic: canConfigureAcademic(user),
  };
}

function studentName(first: string, middle: string, last: string) {
  return [first, middle, last].filter(Boolean).join(" ");
}

async function audit(input: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  businessUnitId: string;
}) {
  await writeAuditEvent({
    ...input,
    module: "school",
    severity: "medium",
  });
}

function scopedIds(ids: Set<string>, schoolWide: boolean) {
  if (schoolWide) return null;
  return ids.size ? [...ids] : ["00000000-0000-0000-0000-000000000000"];
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

function genderValue(value: unknown) {
  const next = str(value).toLowerCase();
  if (!next) return null;
  if (next === "female" || next === "male" || next === "other") return next;
  throw new SchoolError("Choose a valid gender.", "VALIDATION");
}

function dateValue(value: unknown, label: string, required = false) {
  const next = str(value);
  if (!next) {
    if (required) throw new SchoolError(`${label} is required.`, "VALIDATION");
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new SchoolError(`${label} is invalid.`, "VALIDATION");
  return next;
}

async function assertPlacement(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  input: { levelId: string; classId: string; streamId: string; academicYearId: string; termId: string },
) {
  const streamId = str(input.streamId);
  const classId = str(input.classId);
  const levelId = str(input.levelId);
  const yearId = str(input.academicYearId);
  if (!yearId) throw new SchoolError("Academic year is required.", "VALIDATION");
  if (!levelId || !classId || !streamId) throw new SchoolError("Level, class, and stream are required.", "VALIDATION");

  const termId = str(input.termId);
  const [streamRes, classRes, yearRes, termRes] = await Promise.all([
    supabase
      .from("sch_class_streams")
      .select("id, class_id, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("id", streamId)
      .maybeSingle(),
    supabase
      .from("sch_classes")
      .select("id, level_id, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("id", classId)
      .maybeSingle(),
    supabase
      .from("sch_academic_years")
      .select("id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", yearId)
      .maybeSingle(),
    termId
      ? supabase
          .from("sch_terms")
          .select("id, academic_year_id")
          .eq("business_unit_id", businessUnitId)
          .eq("id", termId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (streamRes.error && !isSchoolUnconfiguredRead(streamRes.error)) mapSchoolDbError(streamRes.error, "save");
  if (classRes.error && !isSchoolUnconfiguredRead(classRes.error)) mapSchoolDbError(classRes.error, "save");
  if (!yearRes.data?.id) throw new SchoolError("Academic year was not found.", "VALIDATION");
  if (!streamRes.data?.id || !classRes.data?.id) {
    throw new SchoolError("The selected academic placement is not valid.", "VALIDATION");
  }
  if (String(streamRes.data.class_id) !== classId) {
    throw new SchoolError("The selected stream does not belong to that class.", "VALIDATION");
  }
  if (String(classRes.data.level_id) !== levelId) {
    throw new SchoolError("The selected class does not belong to that level.", "VALIDATION");
  }
  if (termId && (!termRes.data?.id || String(termRes.data.academic_year_id) !== yearId)) {
    throw new SchoolError("The selected term does not belong to that academic year.", "VALIDATION");
  }
}

function admissionPayload(input: AdmissionFormInput, businessUnitId: string) {
  const firstName = str(input.firstName);
  const lastName = str(input.lastName);
  if (!firstName || !lastName) throw new SchoolError("First and last name are required.", "VALIDATION");
  const guardianFullName = str(input.guardianFullName);
  const guardianRelationship = str(input.guardianRelationship);
  const guardianPhone = str(input.guardianPhone);
  return {
    business_unit_id: businessUnitId,
    first_name: firstName.slice(0, 80),
    middle_name: str(input.middleName).slice(0, 80),
    last_name: lastName.slice(0, 80),
    date_of_birth: dateValue(input.dateOfBirth, "Date of birth"),
    gender: genderValue(input.gender),
    nationality: str(input.nationality).slice(0, 80),
    address: str(input.address).slice(0, 240),
    phone: "",
    email: "",
    academic_year_id: str(input.academicYearId) || null,
    term_id: str(input.termId) || null,
    stream_id: str(input.streamId) || null,
    admission_date: dateValue(input.admissionDate, "Admission date", true),
    guardian_full_name: guardianFullName.slice(0, 160),
    guardian_relationship: guardianRelationship.slice(0, 40),
    guardian_phone: guardianPhone.slice(0, 40),
    guardian_email: str(input.guardianEmail).slice(0, 160),
    guardian_address: str(input.guardianAddress).slice(0, 240),
    guardian_occupation: str(input.guardianOccupation).slice(0, 80),
  };
}

function feeRowFromStructure(structure: ApplicableFeeStructure | null): ApplicableFeeRow {
  if (!structure) {
    return {
      configured: false,
      annualAmount: null,
      currentTermName: null,
      currentTermAmount: null,
      termCount: 0,
      message: "Fee structure not configured for this class.",
    };
  }
  return {
    configured: true,
    annualAmount: structure.annualAmount,
    currentTermName: structure.currentTermName,
    currentTermAmount: structure.currentTermAmount,
    termCount: structure.terms.length,
    message: "",
  };
}

async function loadApplicableFees(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  classId: string,
  academicYearId: string,
  termId: string,
): Promise<ApplicableFeeRow> {
  const structure = await findApplicableFeeStructure({
    supabase,
    businessUnitId,
    academicYearId,
    classId,
    termId,
  });
  return feeRowFromStructure(structure);
}

export async function getAdmissionFormOptionsAction(mode: "view" | "manage" = "view") {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(mode === "manage" ? MANAGE : VIEW);
    const [catalog, scope] = await Promise.all([
      loadSchoolStructureCatalog(ctx),
      isOwnerRole(user.roleCode) ? Promise.resolve(null) : loadSchoolStructureScope(ctx),
    ]);
    const levels = catalog.levels.filter((row) => !scope || scope.schoolWide || scope.levelIds.has(row.id));
    const classes = catalog.classes.filter((row) => !scope || scope.schoolWide || scope.classIds.has(row.id));
    const streams = catalog.streams.filter((row) => !scope || scope.schoolWide || scope.streamIds.has(row.id));
    return {
      ok: true as const,
      years: catalog.years,
      terms: catalog.terms,
      levels,
      classes,
      streams,
      today: new Date().toISOString().slice(0, 10),
      capabilities: caps(user),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listSchoolAdmissionsAction(input: { page?: number; pageSize?: number; q?: string; status?: string } = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const pageSize = parseSchoolPageSize(input.pageSize);
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const status = str(input.status);
    let query = supabase
      .from("sch_admissions")
      .select(
        "id, admission_number, status, admission_date, first_name, middle_name, last_name, student_id, stream_id",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (status === "draft" || status === "completed" || status === "cancelled") query = query.eq("status", status);
    const streamScope = scopedIds(scope.streamIds, scope.schoolWide);
    if (streamScope) query = query.in("stream_id", streamScope);
    if (q) {
      const students = await supabase
        .from("sch_students")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .ilike("student_number", `%${q}%`);
      const ids = (students.data ?? []).map((row) => String(row.id));
      const studentFilter = ids.length ? `,student_id.in.(${ids.join(",")})` : "";
      query = query.or(
        `admission_number.ilike.%${q}%,first_name.ilike.%${q}%,middle_name.ilike.%${q}%,last_name.ilike.%${q}%${studentFilter}`,
      );
    }
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    const raw = ((result.data ?? []) as Record<string, unknown>[]);
    const placement = await loadPlacementByStreamIds(
      ctx,
      raw.map((row) => str(row.stream_id)),
    );
    const rows = raw.map((row) => {
      const place = placement.get(str(row.stream_id));
      return {
        id: String(row.id),
        admissionNumber: str(row.admission_number),
        studentName: studentName(str(row.first_name), str(row.middle_name), str(row.last_name)) || "—",
        firstName: str(row.first_name),
        middleName: str(row.middle_name),
        lastName: str(row.last_name),
        studentNumber: null,
        levelName: place?.levelName ?? "",
        className: place?.className ?? "",
        streamName: place?.streamName ?? "",
        admissionDate: String(row.admission_date ?? ""),
        status: asStatus(row.status),
      };
    });
    return {
      ok: true as const,
      admissions: rows,
      page: schoolPageMeta(page, result.count ?? rows.length, pageSize),
      capabilities: caps(user),
    };
  } catch (error) {
    try {
      const user = await requireAuth();
      return {
        ok: false as const,
        error: schoolActionError(error),
        admissions: [] as AdmissionListRow[],
        page: schoolPageMeta(1, 0),
        capabilities: caps(user),
      };
    } catch {
      return { ok: false as const, error: schoolActionError(error) };
    }
  }
}

export async function getSchoolAdmissionAction(id: string) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const admissionId = str(id);
    if (!admissionId) throw new SchoolError("Admission was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_admissions")
      .select(
        "id, admission_number, status, admission_date, academic_year_id, term_id, stream_id, student_id, first_name, middle_name, last_name, date_of_birth, gender, nationality, address, guardian_full_name, guardian_relationship, guardian_phone, guardian_email, guardian_address, guardian_occupation",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("id", admissionId)
      .maybeSingle();
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    if (!result.data) throw new SchoolError("Admission was not found.", "NOT_FOUND");
    const row = result.data as Record<string, unknown>;
    let streamId = str(row.stream_id);
    if (streamId && !allowsStream(scope, streamId) && !scope.schoolWide) {
      throw new SchoolError("Admission was not found.", "NOT_FOUND");
    }

    const studentId = str(row.student_id);
    const [yearRes, termRes, studentRes, enrollmentRes, initialPlacement] = await Promise.all([
      row.academic_year_id
        ? supabase.from("sch_academic_years").select("name").eq("id", String(row.academic_year_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      row.term_id
        ? supabase.from("sch_terms").select("name").eq("id", String(row.term_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      studentId
        ? supabase.from("sch_students").select("id, student_number, status").eq("id", studentId).maybeSingle()
        : Promise.resolve({ data: null }),
      studentId
        ? supabase
            .from("sch_student_enrollments")
            .select("id, stream_id, status")
            .eq("business_unit_id", businessUnitId)
            .eq("student_id", studentId)
            .eq("status", "active")
            .maybeSingle()
        : Promise.resolve({ data: null }),
      streamId ? loadPlacementByStreamIds(ctx, [streamId]) : Promise.resolve(new Map()),
    ]);
    if (!streamId) streamId = str(enrollmentRes.data?.stream_id);
    let placement = streamId ? initialPlacement.get(streamId) : undefined;
    if (!placement && streamId) {
      placement = (await loadPlacementByStreamIds(ctx, [streamId])).get(streamId);
    }
    const levelId = placement?.levelId ?? "";
    const classId = placement?.classId ?? "";
    const levelName = placement?.levelName ?? "";
    const className = placement?.className ?? "";
    const streamName = placement?.streamName ?? "";
    const fees = await loadApplicableFees(supabase, businessUnitId, classId, str(row.academic_year_id), str(row.term_id));
    const attendanceEligible = str(studentRes.data?.status) === "active" && Boolean(enrollmentRes.data?.id);

    const detail: AdmissionDetail = {
      id: String(row.id),
      admissionNumber: str(row.admission_number),
      status: asStatus(row.status),
      admissionDate: String(row.admission_date ?? ""),
      academicYearId: str(row.academic_year_id),
      academicYearName: str(yearRes.data?.name),
      termId: str(row.term_id),
      termName: str(termRes.data?.name),
      levelId,
      levelName,
      classId,
      className,
      streamId,
      streamName,
      firstName: str(row.first_name),
      middleName: str(row.middle_name),
      lastName: str(row.last_name),
      dateOfBirth: String(row.date_of_birth ?? ""),
      gender: str(row.gender),
      nationality: str(row.nationality),
      address: str(row.address),
      phone: str(row.phone),
      email: str(row.email),
      guardianFullName: str(row.guardian_full_name),
      guardianRelationship: str(row.guardian_relationship),
      guardianPhone: str(row.guardian_phone),
      guardianEmail: str(row.guardian_email),
      guardianAddress: str(row.guardian_address),
      guardianOccupation: str(row.guardian_occupation),
      studentId: row.student_id ? String(row.student_id) : null,
      studentNumber: studentRes.data?.student_number ? String(studentRes.data.student_number) : null,
      attendanceEligible,
      fee: fees,
    };
    return { ok: true as const, admission: detail, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

async function upsertDraftAdmission(
  ctx: Awaited<ReturnType<typeof requireSchoolPermission>>,
  input: AdmissionFormInput,
  options?: { skipPlacementAssert?: boolean },
) {
  const { supabase, businessUnitId, userId } = ctx;
  const payload = admissionPayload(input, businessUnitId);
  if (payload.stream_id && !options?.skipPlacementAssert) {
    await assertPlacement(supabase, businessUnitId, {
      levelId: input.levelId,
      classId: input.classId,
      streamId: input.streamId,
      academicYearId: input.academicYearId,
      termId: input.termId,
    });
  }
  const existingId = str(input.id);
  if (existingId) {
    const current = await supabase
      .from("sch_admissions")
      .select("id, status, admission_number")
      .eq("business_unit_id", businessUnitId)
      .eq("id", existingId)
      .maybeSingle();
    if (!current.data) throw new SchoolError("Admission was not found.", "NOT_FOUND");
    if (String(current.data.status) === "completed") {
      return { id: existingId, admissionNumber: String(current.data.admission_number), created: false, alreadyCompleted: true };
    }
    if (String(current.data.status) !== "draft") throw new SchoolError("Only a draft admission can be edited.", "VALIDATION");
    const updated = await supabase.from("sch_admissions").update(payload).eq("id", existingId).select("id, admission_number").maybeSingle();
    if (updated.error) mapSchoolDbError(updated.error, "save");
    return { id: existingId, admissionNumber: String(current.data.admission_number), created: false, alreadyCompleted: false };
  }

  const { data: number, error: numError } = await supabase.rpc("sch_next_document_number", {
    p_business_unit_id: businessUnitId,
    p_doc_type: "admission",
    p_prefix: "ADM",
  });
  if (numError || !number) throw new SchoolError("Couldn't allocate an admission number.", "DATABASE");
  const inserted = await supabase
    .from("sch_admissions")
    .insert({ ...payload, admission_number: String(number), status: "draft", created_by: userId })
    .select("id, admission_number")
    .maybeSingle();
  if (inserted.error || !inserted.data) mapSchoolDbError(inserted.error, "save");
  return {
    id: String(inserted.data!.id),
    admissionNumber: String(inserted.data!.admission_number),
    created: true,
    alreadyCompleted: false,
  };
}

export async function saveSchoolAdmissionAction(input: AdmissionFormInput) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const saved = await upsertDraftAdmission(ctx, input);
    await audit({
      action: saved.created ? "school.admission_created" : "school.admission_updated",
      description: `Admission ${saved.created ? "created" : "updated"} · ${saved.admissionNumber}`,
      entityType: "sch_admissions",
      entityId: saved.id,
      businessUnitId: ctx.businessUnitId,
    });
    return { ok: true as const, id: saved.id, admissionNumber: saved.admissionNumber };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function completeSchoolAdmissionAction(input: AdmissionFormInput & { acknowledgeDuplicate?: boolean }) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const payload = admissionPayload(input, businessUnitId);
    if (!payload.stream_id || !payload.academic_year_id) {
      throw new SchoolError("Academic year, level, class, and stream are required to complete admission.", "VALIDATION");
    }
    if (!str(input.guardianFullName) || !str(input.guardianRelationship) || !str(input.guardianPhone)) {
      throw new SchoolError("Guardian name, relationship, and phone are required to complete admission.", "VALIDATION");
    }
    const saved = await upsertDraftAdmission(ctx, input, { skipPlacementAssert: true });
    const { data, error } = await supabase.rpc("sch_complete_admission", {
      p_admission_id: saved.id,
      p_acknowledge_duplicate: Boolean(input.acknowledgeDuplicate),
    });
    if (error) {
      const message = error.message ?? "";
      if (message.startsWith("SCH_DUP:")) {
        const parts = message.split(":");
        return {
          ok: false as const,
          error: "A matching active student already exists. Review before completing this admission.",
          duplicate: { studentId: parts[1] ?? "", studentNumber: parts[2] ?? "" },
          id: saved.id,
        };
      }
      throw new SchoolError(message || "Couldn't complete this admission.", "DATABASE");
    }
    const result = (data ?? {}) as Record<string, unknown>;
    const alreadyCompleted = Boolean(result.already_completed);
    let enrollmentId = result.enrollment_id ? String(result.enrollment_id) : null;
    const studentId = result.student_id ? String(result.student_id) : null;
    if (!enrollmentId && studentId) {
      const enrollment = await supabase
        .from("sch_student_enrollments")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .eq("student_id", studentId)
        .eq("status", "active")
        .maybeSingle();
      enrollmentId = enrollment.data?.id ? String(enrollment.data.id) : null;
    }
    const actor = { id: user.id, name: user.name, email: user.email };
    const events: WriteAuditEventInput[] = [
      {
        action: "school.admission_completed",
        description: `Admission completed · ${saved.admissionNumber}`,
        entityType: "sch_admissions",
        entityId: saved.id,
        businessUnitId,
        module: "school",
        severity: "medium",
        actor,
      },
    ];
    if (result.student_number) {
      events.push({
        action: "school.student_created",
        description: `Student created · ${String(result.student_number)}`,
        entityType: "sch_students",
        entityId: result.student_id ? String(result.student_id) : saved.id,
        businessUnitId,
        module: "school",
        severity: "medium",
        actor,
      });
    }
    if (result.guardian_id) {
      events.push({
        action: "school.guardian_linked",
        description: `Guardian linked · ${saved.admissionNumber}`,
        entityType: "sch_student_guardians",
        entityId: result.guardian_id ? String(result.guardian_id) : saved.id,
        businessUnitId,
        module: "school",
        severity: "medium",
        actor,
      });
    }
    if (!alreadyCompleted) void writeAuditEvents(events);
    return {
      ok: true as const,
      id: saved.id,
      admissionNumber: saved.admissionNumber,
      studentId,
      studentNumber: result.student_number ? String(result.student_number) : null,
      enrollmentId,
      guardianId: result.guardian_id ? String(result.guardian_id) : null,
      academicYearId: str(input.academicYearId),
      levelId: str(input.levelId),
      classId: str(input.classId),
      streamId: str(input.streamId),
      admissionDate: str(input.admissionDate),
      status: "completed" as const,
      studentName: studentName(str(input.firstName), str(input.middleName), str(input.lastName)),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function cancelSchoolAdmissionAction(id: string) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const admissionId = str(id);
    const current = await supabase
      .from("sch_admissions")
      .select("id, status, admission_number")
      .eq("business_unit_id", businessUnitId)
      .eq("id", admissionId)
      .maybeSingle();
    if (!current.data) throw new SchoolError("Admission was not found.", "NOT_FOUND");
    if (String(current.data.status) !== "draft") throw new SchoolError("Only a draft admission can be cancelled.", "VALIDATION");
    const updated = await supabase.from("sch_admissions").update({ status: "cancelled" }).eq("id", admissionId);
    if (updated.error) mapSchoolDbError(updated.error, "save");
    await audit({
      action: "school.admission_cancelled",
      description: `Admission cancelled · ${String(current.data.admission_number)}`,
      entityType: "sch_admissions",
      entityId: admissionId,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getAdmissionClassesAction(levelId: string) {
  try {
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const id = str(levelId);
    if (!id) return { ok: true as const, classes: [] as Array<{ id: string; name: string }> };
    const result = await supabase
      .from("sch_classes")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("level_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      classes: (result.data ?? [])
        .filter((row) => scope.schoolWide || scope.classIds.has(String(row.id)))
        .map((row) => ({ id: String(row.id), name: String(row.name) })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getAdmissionStreamsAction(classId: string) {
  try {
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const id = str(classId);
    if (!id) return { ok: true as const, streams: [] as Array<{ id: string; name: string }> };
    const result = await supabase
      .from("sch_class_streams")
      .select("id, name")
      .eq("business_unit_id", businessUnitId)
      .eq("class_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      streams: (result.data ?? [])
        .filter((row) => scope.schoolWide || scope.streamIds.has(String(row.id)))
        .map((row) => ({ id: String(row.id), name: String(row.name) })),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function resolveAdmissionFeesAction(input: { classId: string; academicYearId: string; termId: string }) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const fee = await loadApplicableFees(supabase, businessUnitId, str(input.classId), str(input.academicYearId), str(input.termId));
    return { ok: true as const, fee };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
