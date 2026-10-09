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
import { loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";

const VIEW = "school.subjects.view";
const MANAGE = "school.subjects.manage";

export type SchoolSubjectCatalogItem = { id: string; name: string; code: string; isActive: boolean };
export type SchoolLevelCard = { id: string; name: string; classCount: number; subjectCount: number };
export type SchoolClassCard = {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  subjectCount: number;
  streamCount: number;
  studentCount: number;
};
export type SchoolClassSubjectRow = {
  assignmentId: string;
  subjectId: string;
  name: string;
  code: string;
  classId: string;
  className: string;
  levelId: string;
  levelName: string;
  studentCount: number;
  teacherName: string | null;
  isActive: boolean;
};

export type SchoolSubjectsCapabilities = { canView: boolean; canManage: boolean };

export type SchoolSubjectsWorkspace = {
  rows: SchoolClassSubjectRow[];
  page: ReturnType<typeof schoolPageMeta>;
  query: string;
  classId: string;
  levelId: string;
  catalog: SchoolSubjectCatalogItem[];
  levels: SchoolLevelCard[];
  classes: SchoolClassCard[];
  capabilities: SchoolSubjectsCapabilities;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function can(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function mapRpcError(error: { message?: string; code?: string } | null): never {
  const raw = String(error?.message ?? "");
  const message = raw.replace(/^[A-Z0-9]+:\s*/i, "").split("\n")[0]?.slice(0, 180) ?? "";
  if (
    message &&
    !/sql|postgres|relation|column|permission denied|schema cache/i.test(message) &&
    /class|subject|name|code|authenticated|available|found|save|assign|exam|mark|term|year/i.test(message)
  ) {
    throw new SchoolError(message, error?.code === "42501" ? "PRIVILEGE" : "VALIDATION");
  }
  mapSchoolDbError(error ? { message: error.message ?? "", code: error.code } : null);
}

function missingSubjectsSchema(error: { message?: string; code?: string } | null) {
  if (!error || isSchoolEmptyRead(error)) return false;
  return isSchoolUnconfiguredRead(error) && !isSchoolEmptyRead(error);
}

export async function getSchoolSubjectsWorkspaceAction(input?: {
  page?: number;
  pageSize?: number;
  q?: string;
  classId?: string;
  levelId?: string;
}): Promise<{ ok: true; workspace: SchoolSubjectsWorkspace } | { ok: false; error: string }> {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission([VIEW, MANAGE]);
    const capabilities = { canView: can(user, VIEW) || can(user, MANAGE), canManage: can(user, MANAGE) };
    const catalog = await loadSchoolStructureCatalog({ supabase, businessUnitId, userId: user.id });
    const query = str(input?.q).slice(0, 80);
    const classId = str(input?.classId);
    const levelId = str(input?.levelId);
    const { page, from, to, pageSize } = schoolPageRange(parseSchoolPage(input?.page), parseSchoolPageSize(input?.pageSize));

    const [subjectsRes, assignmentRes, enrollRes, teacherRes] = await Promise.all([
      supabase
        .from("sch_subjects")
        .select("id, name, code, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("name"),
      supabase.from("sch_class_subjects").select("id, class_id, subject_id, is_active").eq("business_unit_id", businessUnitId),
      supabase
        .from("sch_student_enrollments")
        .select("class_id")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active"),
      supabase
        .from("sch_staff_assignments")
        .select("class_id, subject_id, staff_id")
        .eq("business_unit_id", businessUnitId)
        .eq("assignment_type", "SUBJECT_TEACHER")
        .eq("is_active", true),
    ]);

    if (missingSubjectsSchema(assignmentRes.error)) {
      throw new SchoolError("Subjects aren't available on this database yet.", "NOT_CONFIGURED");
    }
    if (assignmentRes.error && !isSchoolUnconfiguredRead(assignmentRes.error)) mapSchoolDbError(assignmentRes.error, "load");
    if (subjectsRes.error && !isSchoolUnconfiguredRead(subjectsRes.error)) mapSchoolDbError(subjectsRes.error, "load");

    const subjectById = new Map(
      (subjectsRes.data ?? []).map((row) => [
        String(row.id),
        {
          id: String(row.id),
          name: String(row.name),
          code: String(row.code),
          isActive: Boolean(row.is_active),
        },
      ]),
    );
    const classById = new Map(catalog.classes.map((row) => [row.id, row]));
    const levelById = new Map(catalog.levels.map((row) => [row.id, row]));
    const streamCountByClass = new Map<string, number>();
    for (const stream of catalog.streams) {
      streamCountByClass.set(stream.classId, (streamCountByClass.get(stream.classId) ?? 0) + 1);
    }
    const studentCountByClass = new Map<string, number>();
    for (const row of enrollRes.error ? [] : enrollRes.data ?? []) {
      const id = str(row.class_id);
      if (!id) continue;
      studentCountByClass.set(id, (studentCountByClass.get(id) ?? 0) + 1);
    }
    const teacherStaffIds = [...new Set((teacherRes.error ? [] : teacherRes.data ?? []).map((row) => str(row.staff_id)).filter(Boolean))];
    const staffRes =
      teacherStaffIds.length > 0
        ? await supabase.from("sch_staff").select("id, first_name, last_name").eq("business_unit_id", businessUnitId).in("id", teacherStaffIds)
        : { data: [] as Array<{ id: string; first_name: string; last_name: string }>, error: null };
    const staffNameById = new Map(
      (staffRes.data ?? []).map((row) => [String(row.id), [str(row.first_name), str(row.last_name)].filter(Boolean).join(" ")]),
    );
    const teacherByKey = new Map<string, string>();
    for (const row of teacherRes.error ? [] : teacherRes.data ?? []) {
      const key = `${str(row.class_id)}:${str(row.subject_id)}`;
      const name = staffNameById.get(str(row.staff_id));
      if (!name) continue;
      const previous = teacherByKey.get(key);
      teacherByKey.set(key, previous ? `${previous}, ${name}` : name);
    }

    const assignmentCountByClass = new Map<string, number>();
    const allRows: SchoolClassSubjectRow[] = [];
    for (const row of assignmentRes.data ?? []) {
      const assignmentClassId = String(row.class_id);
      const subjectId = String(row.subject_id);
      const subject = subjectById.get(subjectId);
      const schoolClass = classById.get(assignmentClassId);
      if (!subject || !schoolClass) continue;
      const level = levelById.get(schoolClass.levelId);
      if (row.is_active) {
        assignmentCountByClass.set(assignmentClassId, (assignmentCountByClass.get(assignmentClassId) ?? 0) + 1);
      } else {
        continue;
      }
      allRows.push({
        assignmentId: String(row.id),
        subjectId,
        name: subject.name,
        code: subject.code,
        classId: assignmentClassId,
        className: schoolClass.name,
        levelId: schoolClass.levelId,
        levelName: level?.name ?? "—",
        studentCount: studentCountByClass.get(assignmentClassId) ?? 0,
        teacherName: teacherByKey.get(`${assignmentClassId}:${subjectId}`) ?? null,
        isActive: Boolean(row.is_active),
      });
    }

    const levels: SchoolLevelCard[] = catalog.levels.map((level) => {
      const levelClasses = catalog.classes.filter((row) => row.levelId === level.id);
      return {
        id: level.id,
        name: level.name,
        classCount: levelClasses.length,
        subjectCount: levelClasses.reduce((sum, row) => sum + (assignmentCountByClass.get(row.id) ?? 0), 0),
      };
    });
    const classes: SchoolClassCard[] = catalog.classes.map((row) => ({
      id: row.id,
      name: row.name,
      levelId: row.levelId,
      levelName: levelById.get(row.levelId)?.name ?? "—",
      subjectCount: assignmentCountByClass.get(row.id) ?? 0,
      streamCount: streamCountByClass.get(row.id) ?? 0,
      studentCount: studentCountByClass.get(row.id) ?? 0,
    }));

    const needle = query.toLowerCase();
    const filtered = allRows.filter((row) => {
      if (classId && row.classId !== classId) return false;
      if (levelId && row.levelId !== levelId) return false;
      if (!needle) return true;
      return `${row.name} ${row.className} ${row.levelName} ${row.code}`.toLowerCase().includes(needle);
    });
    filtered.sort((a, b) => a.name.localeCompare(b.name) || a.className.localeCompare(b.className));
    const total = filtered.length;
    const meta = schoolPageMeta(page, total, pageSize);
    const rows = filtered.slice(from, to);

    return {
      ok: true,
      workspace: {
        rows,
        page: meta,
        query,
        classId,
        levelId,
        catalog: [...subjectById.values()].filter((item) => item.isActive),
        levels,
        classes,
        capabilities,
      },
    };
  } catch (error) {
    return { ok: false, error: schoolActionError(error) };
  }
}

export async function assignSchoolClassSubjectsAction(input: {
  classId: string;
  items: Array<{ id?: string; name?: string }>;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([MANAGE]);
    const classId = str(input.classId);
    if (!classId) throw new SchoolError("Select a class.", "VALIDATION");
    const items = (input.items ?? [])
      .map((item) => ({ id: str(item.id) || undefined, name: str(item.name) }))
      .filter((item) => item.id || item.name);
    if (!items.length) throw new SchoolError("Add at least one subject.", "VALIDATION");
    const seen = new Set<string>();
    for (const item of items) {
      const key = (item.id ?? item.name).toLowerCase();
      if (seen.has(key)) throw new SchoolError("The same subject cannot be added twice in one save.", "VALIDATION");
      seen.add(key);
    }
    const { error } = await supabase.rpc("sch_assign_class_subjects", {
      p_class_id: classId,
      p_items: items,
    });
    if (error) mapRpcError(error);
    await writeAuditEvent({
      action: "school.subjects_assigned",
      module: "school",
      description: `Assigned ${items.length} subject${items.length === 1 ? "" : "s"} to a class`,
      severity: "medium",
      entityType: "sch_class_subjects",
      entityId: classId,
      businessUnitId,
      metadata: { count: items.length },
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function updateSchoolSubjectAction(input: { subjectId: string; name: string }) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([MANAGE]);
    const subjectId = str(input.subjectId);
    const name = str(input.name);
    if (!subjectId) throw new SchoolError("Subject was not found.", "NOT_FOUND");
    if (name.length < 1 || name.length > 80) throw new SchoolError("Enter a subject name.", "VALIDATION");
    const { error } = await supabase
      .from("sch_subjects")
      .update({ name })
      .eq("id", subjectId)
      .eq("business_unit_id", businessUnitId);
    if (error) {
      if (error.code === "23505") throw new SchoolError("A subject with this name already exists.", "CONFLICT");
      mapSchoolDbError(error);
    }
    await writeAuditEvent({
      action: "school.subject_updated",
      module: "school",
      description: `Updated subject name · ${name}`,
      severity: "low",
      entityType: "sch_subjects",
      entityId: subjectId,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolClassSubjectAction(assignmentId: string) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([MANAGE]);
    const id = str(assignmentId);
    if (!id) throw new SchoolError("Assignment was not found.", "NOT_FOUND");
    const { data: current, error: loadError } = await supabase
      .from("sch_class_subjects")
      .select("id, class_id, subject_id")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError && !isSchoolEmptyRead(loadError)) mapSchoolDbError(loadError, "load");
    if (!current) throw new SchoolError("Assignment was not found.", "NOT_FOUND");
    const { error } = await supabase
      .from("sch_class_subjects")
      .update({ is_active: false })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapSchoolDbError(error);
    await writeAuditEvent({
      action: "school.class_subject_archived",
      module: "school",
      description: "Archived a class subject assignment",
      severity: "medium",
      entityType: "sch_class_subjects",
      entityId: id,
      businessUnitId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
