"use server";

import { writeAuditEvent } from "@/lib/audit";
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
import { schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";

const VIEW = "school.admissions.view";
const MANAGE = "school.admissions.manage";

export type AdmissionStatus = "draft" | "completed" | "cancelled";

export type AdmissionListRow = {
  id: string;
  admissionNumber: string;
  studentName: string;
  studentNumber: string | null;
  levelName: string;
  className: string;
  streamName: string;
  admissionDate: string;
  status: AdmissionStatus;
};

export type ApplicableFeeRow = {
  id: string;
  feeName: string;
  amount: string;
  frequency: string;
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
  fees: ApplicableFeeRow[];
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

  const [streamRes, classRes, yearRes] = await Promise.all([
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

  const termId = str(input.termId);
  if (termId) {
    const termRes = await supabase
      .from("sch_terms")
      .select("id, academic_year_id")
      .eq("business_unit_id", businessUnitId)
      .eq("id", termId)
      .maybeSingle();
    if (!termRes.data?.id || String(termRes.data.academic_year_id) !== yearId) {
      throw new SchoolError("The selected term does not belong to that academic year.", "VALIDATION");
    }
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
    phone: str(input.phone).slice(0, 40),
    email: str(input.email).slice(0, 160),
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

async function loadApplicableFees(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  classId: string,
  academicYearId: string,
  termId: string,
) {
  if (!classId || !academicYearId) return [];
  const result = await supabase
    .from("sch_fee_assignments")
    .select("id, fee_category_id, amount, frequency, term_id")
    .eq("business_unit_id", businessUnitId)
    .eq("class_id", classId)
    .eq("academic_year_id", academicYearId)
    .eq("is_active", true);
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  const rows = (result.data ?? []).filter((row) => !row.term_id || String(row.term_id) === termId || !termId);
  const categoryIds = [...new Set(rows.map((row) => String(row.fee_category_id)))];
  const names = new Map<string, string>();
  if (categoryIds.length) {
    const cats = await supabase.from("sch_fee_categories").select("id, name").in("id", categoryIds);
    for (const row of cats.data ?? []) names.set(String(row.id), String(row.name));
  }
  return rows.map((row) => ({
    id: String(row.id),
    feeName: names.get(String(row.fee_category_id)) ?? "Fee",
    amount: String(row.amount),
    frequency: String(row.frequency),
  }));
}

async function loadPlacementNames(
  supabase: Awaited<ReturnType<typeof requireSchoolPermission>>["supabase"],
  businessUnitId: string,
  streamIds: string[],
) {
  const names = new Map<string, { levelName: string; className: string; streamName: string }>();
  const ids = [...new Set(streamIds.filter(Boolean))];
  if (!ids.length) return names;
  const streams = await supabase
    .from("sch_class_streams")
    .select("id, name, class_id")
    .eq("business_unit_id", businessUnitId)
    .in("id", ids);
  if (streams.error && !isSchoolUnconfiguredRead(streams.error)) return names;
  const classIds = [...new Set((streams.data ?? []).map((row) => str(row.class_id)).filter(Boolean))];
  const classes = classIds.length
    ? await supabase.from("sch_classes").select("id, name, level_id").eq("business_unit_id", businessUnitId).in("id", classIds)
    : { data: [] as Array<{ id: string; name: string; level_id: string }>, error: null };
  if (classes.error && !isSchoolUnconfiguredRead(classes.error)) return names;
  const levelIds = [...new Set((classes.data ?? []).map((row) => str(row.level_id)).filter(Boolean))];
  const levels = levelIds.length
    ? await supabase.from("sch_class_levels").select("id, name").eq("business_unit_id", businessUnitId).in("id", levelIds)
    : { data: [] as Array<{ id: string; name: string }>, error: null };
  const classMap = new Map((classes.data ?? []).map((row) => [String(row.id), row]));
  const levelMap = new Map((levels.data ?? []).map((row) => [String(row.id), str(row.name)]));
  for (const stream of streams.data ?? []) {
    const classRow = classMap.get(str(stream.class_id));
    names.set(String(stream.id), {
      streamName: str(stream.name),
      className: str(classRow?.name),
      levelName: classRow ? levelMap.get(str(classRow.level_id)) ?? "" : "",
    });
  }
  return names;
}

export async function getAdmissionFormOptionsAction(mode: "view" | "manage" = "view") {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(mode === "manage" ? MANAGE : VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const [yearsRes, termsRes, levelsRes] = await Promise.all([
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
    ]);
    if (yearsRes.error && !isSchoolUnconfiguredRead(yearsRes.error)) mapSchoolDbError(yearsRes.error, "load");
    if (termsRes.error && !isSchoolUnconfiguredRead(termsRes.error)) mapSchoolDbError(termsRes.error, "load");
    if (levelsRes.error && !isSchoolUnconfiguredRead(levelsRes.error)) mapSchoolDbError(levelsRes.error, "load");
    const levels = (levelsRes.data ?? [])
      .filter((row) => scope.schoolWide || scope.levelIds.has(String(row.id)))
      .map((row) => ({ id: String(row.id), name: String(row.name) }));
    return {
      ok: true as const,
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
      levels,
      today: new Date().toISOString().slice(0, 10),
      capabilities: caps(user),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function listSchoolAdmissionsAction(input: { page?: number; q?: string; status?: string } = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
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
    const placement = await loadPlacementNames(
      supabase,
      businessUnitId,
      raw.map((row) => str(row.stream_id)),
    );
    const studentIds = [...new Set(raw.map((row) => str(row.student_id)).filter(Boolean))];
    const numbers = new Map<string, string>();
    if (studentIds.length) {
      const students = await supabase
        .from("sch_students")
        .select("id, student_number")
        .eq("business_unit_id", businessUnitId)
        .in("id", studentIds);
      for (const row of students.data ?? []) numbers.set(String(row.id), str(row.student_number));
    }
    const rows = raw.map((row) => {
      const place = placement.get(str(row.stream_id));
      return {
        id: String(row.id),
        admissionNumber: str(row.admission_number),
        studentName: studentName(str(row.first_name), str(row.middle_name), str(row.last_name)) || "—",
        studentNumber: numbers.get(str(row.student_id)) || null,
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
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .eq("id", admissionId)
      .maybeSingle();
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    if (!result.data) throw new SchoolError("Admission was not found.", "NOT_FOUND");
    const row = result.data as Record<string, unknown>;
    const streamId = str(row.stream_id);
    if (streamId && !allowsStream(scope, streamId) && !scope.schoolWide) {
      throw new SchoolError("Admission was not found.", "NOT_FOUND");
    }

    let levelId = "";
    let classId = "";
    let levelName = "";
    let className = "";
    let streamName = "";
    if (streamId) {
      const streamRes = await supabase
        .from("sch_class_streams")
        .select("id, name, class_id, sch_classes(id, name, level_id, sch_class_levels(id, name))")
        .eq("id", streamId)
        .maybeSingle();
      const stream = streamRes.data as
        | {
            name?: string;
            class_id?: string;
            sch_classes?: { id?: string; name?: string; level_id?: string; sch_class_levels?: { id?: string; name?: string } | null };
          }
        | null;
      streamName = str(stream?.name);
      classId = str(stream?.class_id ?? stream?.sch_classes?.id);
      className = str(stream?.sch_classes?.name);
      levelId = str(stream?.sch_classes?.level_id ?? stream?.sch_classes?.sch_class_levels?.id);
      levelName = str(stream?.sch_classes?.sch_class_levels?.name);
    }

    const [yearRes, termRes, studentRes, fees] = await Promise.all([
      row.academic_year_id
        ? supabase.from("sch_academic_years").select("id, name").eq("id", String(row.academic_year_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      row.term_id
        ? supabase.from("sch_terms").select("id, name").eq("id", String(row.term_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      row.student_id
        ? supabase.from("sch_students").select("id, student_number, status").eq("id", String(row.student_id)).maybeSingle()
        : Promise.resolve({ data: null }),
      loadApplicableFees(supabase, businessUnitId, classId, str(row.academic_year_id), str(row.term_id)),
    ]);

    let attendanceEligible = false;
    if (row.student_id) {
      const enrollmentRes = await supabase
        .from("sch_student_enrollments")
        .select("id")
        .eq("student_id", String(row.student_id))
        .eq("status", "active")
        .limit(1);
      attendanceEligible = str(studentRes.data?.status) === "active" && Boolean(enrollmentRes.data?.length);
    }

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
      fees,
    };
    return { ok: true as const, admission: detail, capabilities: caps(user) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolAdmissionAction(input: AdmissionFormInput) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId, userId } = ctx;
    const payload = admissionPayload(input, businessUnitId);
    if (payload.stream_id) {
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
      if (String(current.data.status) !== "draft") throw new SchoolError("Only a draft admission can be edited.", "VALIDATION");
      const updated = await supabase.from("sch_admissions").update(payload).eq("id", existingId).select("id, admission_number").maybeSingle();
      if (updated.error) mapSchoolDbError(updated.error, "save");
      await audit({
        action: "school.admission_updated",
        description: `Admission updated · ${String(current.data.admission_number)}`,
        entityType: "sch_admissions",
        entityId: existingId,
        businessUnitId,
      });
      return { ok: true as const, id: existingId, admissionNumber: String(current.data.admission_number) };
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
    await audit({
      action: "school.admission_created",
      description: `Admission created · ${String(inserted.data!.admission_number)}`,
      entityType: "sch_admissions",
      entityId: String(inserted.data!.id),
      businessUnitId,
    });
    return { ok: true as const, id: String(inserted.data!.id), admissionNumber: String(inserted.data!.admission_number) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function completeSchoolAdmissionAction(input: AdmissionFormInput & { acknowledgeDuplicate?: boolean }) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const saved = await saveSchoolAdmissionAction(input);
    if (!saved.ok) return saved;
    const payload = admissionPayload(input, businessUnitId);
    if (!payload.stream_id || !payload.academic_year_id) {
      throw new SchoolError("Academic year, level, class, and stream are required to complete admission.", "VALIDATION");
    }
    if (!str(input.guardianFullName) || !str(input.guardianRelationship) || !str(input.guardianPhone)) {
      throw new SchoolError("Guardian name, relationship, and phone are required to complete admission.", "VALIDATION");
    }
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
    await audit({
      action: "school.admission_completed",
      description: `Admission completed · ${saved.admissionNumber}`,
      entityType: "sch_admissions",
      entityId: saved.id,
      businessUnitId,
    });
    if (result.student_number) {
      await audit({
        action: "school.student_created",
        description: `Student created · ${String(result.student_number)}`,
        entityType: "sch_students",
        entityId: result.student_id ? String(result.student_id) : null,
        businessUnitId,
      });
    }
    if (result.guardian_id) {
      await audit({
        action: "school.guardian_linked",
        description: `Guardian linked · ${saved.admissionNumber}`,
        entityType: "sch_student_guardians",
        entityId: result.guardian_id ? String(result.guardian_id) : null,
        businessUnitId,
      });
    }
    return {
      ok: true as const,
      id: saved.id,
      admissionNumber: saved.admissionNumber,
      studentId: result.student_id ? String(result.student_id) : null,
      studentNumber: result.student_number ? String(result.student_number) : null,
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
    const fees = await loadApplicableFees(supabase, businessUnitId, str(input.classId), str(input.academicYearId), str(input.termId));
    return { ok: true as const, fees };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
