"use server";

import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolEmptyRead,
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import {
  allowsClass,
  allowsLevel,
  allowsStream,
  canWriteClass,
  canWriteLevel,
  canWriteStream,
  loadSchoolStructureScope,
} from "@/lib/school/structure-scope";
import { invalidateSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import {
  applyActiveFilter,
  schoolPageMeta,
  schoolPageRange,
  type SchoolListFilter,
} from "@/lib/school/pagination";

const VIEW = "school.classes.view";
const MANAGE = "school.classes.manage";

export type SchoolLevelRow = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  classCount: number;
};

export type SchoolClassRow = {
  id: string;
  levelId: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  streamCount: number;
};

export type SchoolStreamRow = {
  id: string;
  classId: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  classTeacherName: string | null;
};

function str(value: unknown) {
  return String(value ?? "").trim();
}

function requiredName(value: unknown, label: string, max = 80) {
  const next = str(value);
  if (!next) throw new SchoolError(`${label} is required.`, "VALIDATION");
  if (next.length > max) throw new SchoolError(`${label} is too long.`, "VALIDATION");
  return next;
}

function sortValue(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new SchoolError("Order must be 1 or greater.", "VALIDATION");
  return n;
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

function mapStructureError(error: { message: string; code?: string } | null, kind: "level" | "class" | "stream"): never {
  if (error && isSchoolUnconfiguredRead(error) && !isSchoolEmptyRead(error)) {
    throw new SchoolError(
      kind === "stream"
        ? "Streams aren't available on this database yet."
        : kind === "class"
          ? "Classes aren't available on this database yet."
          : "Levels aren't available on this database yet.",
      "NOT_CONFIGURED",
    );
  }
  if (error?.code === "23505") {
    throw new SchoolError(
      kind === "level"
        ? "This level code is already in use."
        : kind === "class"
          ? "This class code already exists in this level."
          : "This stream code already exists in this class.",
      "CONFLICT",
    );
  }
  if (error?.code === "23503") {
    throw new SchoolError(
      kind === "stream" ? "A stream must belong to a valid class." : "A class must belong to a valid level.",
      "VALIDATION",
    );
  }
  mapSchoolDbError(error);
}

function mapLevel(row: Record<string, unknown>, classCount = 0): SchoolLevelRow {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    classCount,
  };
}

function mapClass(row: Record<string, unknown>, streamCount = 0): SchoolClassRow {
  return {
    id: String(row.id),
    levelId: String(row.level_id),
    name: String(row.name),
    code: String(row.code),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    streamCount,
  };
}

function mapStream(row: Record<string, unknown>, classTeacherName: string | null = null): SchoolStreamRow {
  return {
    id: String(row.id),
    classId: String(row.class_id),
    name: String(row.name),
    code: String(row.code),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    classTeacherName,
  };
}

function denyUnless(ok: boolean, message: string): void {
  if (!ok) throw new SchoolError(message, "NOT_FOUND");
}

function scopedIds(ids: Set<string>, schoolWide: boolean) {
  if (schoolWide) return null;
  return ids.size ? [...ids] : ["00000000-0000-0000-0000-000000000000"];
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

export async function getSchoolLevelsAction(input: { page?: number; status?: SchoolListFilter } = {}) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const status = input.status ?? "active";
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const levelScope = scopedIds(scope.levelIds, scope.schoolWide);
    let levelsQuery = supabase
      .from("sch_class_levels")
      .select("id, name, code, sort_order, is_active", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .order("sort_order");
    levelsQuery = applyActiveFilter(levelsQuery, status);
    if (levelScope) levelsQuery = levelsQuery.in("id", levelScope);
    const [levelsRes, classesRes] = await Promise.all([
      levelsQuery.range(from, to),
      supabase.from("sch_classes").select("id, level_id, is_active").eq("business_unit_id", businessUnitId).eq("is_active", true),
    ]);
    if (levelsRes.error && !isSchoolUnconfiguredRead(levelsRes.error)) mapSchoolDbError(levelsRes.error, "load");
    if (classesRes.error && !isSchoolUnconfiguredRead(classesRes.error)) mapSchoolDbError(classesRes.error, "load");
    const counts = new Map<string, number>();
    for (const row of classesRes.data ?? []) {
      if (!allowsClass(scope, String(row.id))) continue;
      const levelId = String(row.level_id);
      counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
    }
    const levels = (levelsRes.data ?? [])
      .filter((row) => allowsLevel(scope, String(row.id)))
      .map((row) => mapLevel(row, counts.get(String(row.id)) ?? 0));
    return {
      ok: true as const,
      levels,
      page: schoolPageMeta(page, levelsRes.count ?? levels.length, pageSize),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolLevelDetailAction(
  levelId: string,
  input: { page?: number; status?: SchoolListFilter } = {},
) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const id = str(levelId);
    if (!id) throw new SchoolError("Level was not found.", "NOT_FOUND");
    denyUnless(allowsLevel(scope, id), "Level was not found.");
    const status = input.status ?? "active";
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const classScope = scopedIds(scope.classIds, scope.schoolWide);
    let classesQuery = supabase
      .from("sch_classes")
      .select("id, level_id, name, code, sort_order, is_active", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .eq("level_id", id)
      .order("sort_order");
    classesQuery = applyActiveFilter(classesQuery, status);
    if (classScope) classesQuery = classesQuery.in("id", classScope);
    const [levelRes, classesRes, activeCountRes] = await Promise.all([
      supabase
        .from("sch_class_levels")
        .select("id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", id)
        .maybeSingle(),
      classesQuery.range(from, to),
      supabase
        .from("sch_classes")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("level_id", id)
        .eq("is_active", true),
    ]);
    if (levelRes.error && !isSchoolUnconfiguredRead(levelRes.error)) mapSchoolDbError(levelRes.error, "load");
    if (!levelRes.data) throw new SchoolError("Level was not found.", "NOT_FOUND");
    if (classesRes.error && !isSchoolUnconfiguredRead(classesRes.error)) mapSchoolDbError(classesRes.error, "load");
    const pageClassIds = (classesRes.data ?? []).map((row) => String(row.id));
    const streamsRes = pageClassIds.length
      ? await supabase
          .from("sch_class_streams")
          .select("id, class_id, is_active")
          .eq("business_unit_id", businessUnitId)
          .eq("is_active", true)
          .in("class_id", pageClassIds)
      : { data: [], error: null };
    if (streamsRes.error && !isSchoolUnconfiguredRead(streamsRes.error)) mapSchoolDbError(streamsRes.error, "load");
    const streamCounts = new Map<string, number>();
    for (const row of streamsRes.data ?? []) {
      if (!allowsStream(scope, String(row.id))) continue;
      const classId = String(row.class_id);
      streamCounts.set(classId, (streamCounts.get(classId) ?? 0) + 1);
    }
    const classes = (classesRes.data ?? [])
      .filter((row) => allowsClass(scope, String(row.id)))
      .map((row) => mapClass(row, streamCounts.get(String(row.id)) ?? 0));
    return {
      ok: true as const,
      level: mapLevel(levelRes.data, activeCountRes.count ?? classes.filter((row) => row.isActive).length),
      classes,
      page: schoolPageMeta(page, classesRes.count ?? classes.length, pageSize),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolClassDetailAction(
  levelId: string,
  classId: string,
  input: { page?: number; status?: SchoolListFilter } = {},
) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const nextLevelId = str(levelId);
    const nextClassId = str(classId);
    if (!nextLevelId || !nextClassId) throw new SchoolError("Class was not found.", "NOT_FOUND");
    denyUnless(allowsClass(scope, nextClassId), "Class was not found.");
    const status = input.status ?? "active";
    const { page, from, to, pageSize } = schoolPageRange(input.page ?? 1);
    const streamScope = scopedIds(scope.streamIds, scope.schoolWide);
    let streamsQuery = supabase
      .from("sch_class_streams")
      .select("id, class_id, name, code, sort_order, is_active, class_teacher_user_id", { count: "exact" })
      .eq("business_unit_id", businessUnitId)
      .eq("class_id", nextClassId)
      .order("sort_order");
    streamsQuery = applyActiveFilter(streamsQuery, status);
    if (streamScope) streamsQuery = streamsQuery.in("id", streamScope);
    const [levelRes, classRes, streamsRes, activeCountRes] = await Promise.all([
      supabase
        .from("sch_class_levels")
        .select("id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", nextLevelId)
        .maybeSingle(),
      supabase
        .from("sch_classes")
        .select("id, level_id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", nextClassId)
        .eq("level_id", nextLevelId)
        .maybeSingle(),
      streamsQuery.range(from, to),
      supabase
        .from("sch_class_streams")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", businessUnitId)
        .eq("class_id", nextClassId)
        .eq("is_active", true),
    ]);
    if (levelRes.error && !isSchoolUnconfiguredRead(levelRes.error)) mapSchoolDbError(levelRes.error, "load");
    if (classRes.error && !isSchoolUnconfiguredRead(classRes.error)) mapSchoolDbError(classRes.error, "load");
    if (!levelRes.data || !classRes.data) throw new SchoolError("Class was not found.", "NOT_FOUND");
    if (streamsRes.error && !isSchoolUnconfiguredRead(streamsRes.error)) mapSchoolDbError(streamsRes.error, "load");
    const teacherIds = [...new Set((streamsRes.data ?? []).map((row) => row.class_teacher_user_id).filter(Boolean).map(String))];
    const names = new Map<string, string>();
    if (teacherIds.length) {
      const profiles = await supabase.from("profiles").select("id, full_name").in("id", teacherIds);
      for (const row of profiles.data ?? []) names.set(String(row.id), String(row.full_name));
    }
    const streamIds = (streamsRes.data ?? []).map((row) => String(row.id));
    const assignmentNames = new Map<string, string>();
    if (streamIds.length) {
      const assigns = await supabase
        .from("sch_staff_assignments")
        .select("stream_id, sch_staff(first_name, last_name)")
        .eq("business_unit_id", businessUnitId)
        .eq("assignment_type", "CLASS_TEACHER")
        .eq("is_active", true)
        .eq("is_primary", true)
        .in("stream_id", streamIds);
      if (!assigns.error) {
        for (const row of assigns.data ?? []) {
          const person = row.sch_staff as { first_name?: string; last_name?: string } | null;
          const label = [String(person?.first_name ?? "").trim(), String(person?.last_name ?? "").trim()].filter(Boolean).join(" ");
          if (row.stream_id && label) assignmentNames.set(String(row.stream_id), label);
        }
      }
    }
    const streams = (streamsRes.data ?? [])
      .filter((row) => allowsStream(scope, String(row.id)))
      .map((row) =>
        mapStream(
          row,
          assignmentNames.get(String(row.id)) ??
            (row.class_teacher_user_id ? names.get(String(row.class_teacher_user_id)) ?? null : null),
        ),
      );
    return {
      ok: true as const,
      level: mapLevel(levelRes.data),
      classRow: mapClass(classRes.data, activeCountRes.count ?? streams.filter((row) => row.isActive).length),
      streams,
      page: schoolPageMeta(page, streamsRes.count ?? streams.length, pageSize),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolClassesForLevelAction(levelId: string) {
  try {
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const id = str(levelId);
    if (!id) return { ok: true as const, classes: [] };
    denyUnless(allowsLevel(scope, id), "Level was not found.");
    const classScope = scopedIds(scope.classIds, scope.schoolWide);
    let query = supabase
      .from("sch_classes")
      .select("id, level_id, name, code, sort_order, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("level_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (classScope) query = query.in("id", classScope);
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      classes: (result.data ?? []).filter((row) => allowsClass(scope, String(row.id))).map((row) => mapClass(row, 0)),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolStreamsForClassAction(classId: string) {
  try {
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const id = str(classId);
    if (!id) return { ok: true as const, streams: [] };
    denyUnless(allowsClass(scope, id), "Class was not found.");
    const streamScope = scopedIds(scope.streamIds, scope.schoolWide);
    let query = supabase
      .from("sch_class_streams")
      .select("id, class_id, name, code, sort_order, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("class_id", id)
      .eq("is_active", true)
      .order("sort_order");
    if (streamScope) query = query.in("id", streamScope);
    const result = await query;
    if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
    return {
      ok: true as const,
      streams: (result.data ?? []).filter((row) => allowsStream(scope, String(row.id))).map((row) => mapStream(row)),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolLevelAction(input: {
  id?: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    denyUnless(canWriteLevel(scope, input.id), "Level was not found.");
    const name = requiredName(input.name, "Level name");
    const code = requiredName(input.code, "Code", 40);
    const row = {
      business_unit_id: businessUnitId,
      name,
      code,
      sort_order: sortValue(input.sortOrder),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase
          .from("sch_class_levels")
          .update(row)
          .eq("id", input.id)
          .eq("business_unit_id", businessUnitId)
          .select("id, name, code, sort_order, is_active")
          .maybeSingle()
      : await supabase.from("sch_class_levels").insert(row).select("id, name, code, sort_order, is_active").maybeSingle();
    if (result.error) mapStructureError(result.error, "level");
    if (!result.data) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    await audit({
      action: input.id ? "school.level_updated" : "school.level_created",
      description: input.id ? `Level updated · ${name}` : `Level created · ${name}`,
      entityType: "sch_class_levels",
      entityId: String(result.data.id),
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const, level: mapLevel(result.data) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolLevelAction(id: string) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    denyUnless(canWriteLevel(scope, id), "Level was not found.");
    const existing = await supabase
      .from("sch_class_levels")
      .select("id, name")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (existing.error && !isSchoolUnconfiguredRead(existing.error)) mapSchoolDbError(existing.error);
    if (!existing.data) throw new SchoolError("Level was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_class_levels")
      .update({ is_active: false })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: "school.level_archived",
      description: `Level archived · ${String(existing.data.name)}`,
      entityType: "sch_class_levels",
      entityId: id,
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolClassAction(input: {
  id?: string;
  levelId: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const name = requiredName(input.name, "Class name");
    const code = requiredName(input.code, "Code", 40);
    const levelId = str(input.levelId);
    if (!levelId) throw new SchoolError("A class must belong to a valid level.", "VALIDATION");
    const level = await supabase
      .from("sch_class_levels")
      .select("id")
      .eq("id", levelId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (level.error && !isSchoolUnconfiguredRead(level.error)) mapSchoolDbError(level.error);
    if (!level.data) throw new SchoolError("A class must belong to a valid level.", "VALIDATION");
    denyUnless(input.id ? canWriteClass(scope, input.id) : canWriteLevel(scope, levelId), "Class was not found.");
    const row = {
      business_unit_id: businessUnitId,
      level_id: levelId,
      name,
      code,
      sort_order: sortValue(input.sortOrder),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase
          .from("sch_classes")
          .update(row)
          .eq("id", input.id)
          .eq("business_unit_id", businessUnitId)
          .eq("level_id", levelId)
          .select("id, level_id, name, code, sort_order, is_active")
          .maybeSingle()
      : await supabase.from("sch_classes").insert(row).select("id, level_id, name, code, sort_order, is_active").maybeSingle();
    if (result.error) mapStructureError(result.error, "class");
    if (!result.data) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    await audit({
      action: input.id ? "school.class_updated" : "school.class_created",
      description: input.id ? `Class updated · ${name}` : `Class created · ${name}`,
      entityType: "sch_classes",
      entityId: String(result.data.id),
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const, classRow: mapClass(result.data, 0) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolClassAction(id: string) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    denyUnless(canWriteClass(scope, id), "Class was not found.");
    const existing = await supabase
      .from("sch_classes")
      .select("id, name")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (existing.error && !isSchoolUnconfiguredRead(existing.error)) mapSchoolDbError(existing.error);
    if (!existing.data) throw new SchoolError("Class was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_classes")
      .update({ is_active: false })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: "school.class_archived",
      description: `Class archived · ${String(existing.data.name)}`,
      entityType: "sch_classes",
      entityId: id,
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolStreamAction(input: {
  id?: string;
  classId: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
}) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    const name = requiredName(input.name, "Stream name");
    const code = requiredName(input.code, "Code", 40);
    const classId = str(input.classId);
    if (!classId) throw new SchoolError("A stream must belong to a valid class.", "VALIDATION");
    const parent = await supabase
      .from("sch_classes")
      .select("id")
      .eq("id", classId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (parent.error && !isSchoolUnconfiguredRead(parent.error)) mapSchoolDbError(parent.error);
    if (!parent.data) throw new SchoolError("A stream must belong to a valid class.", "VALIDATION");
    denyUnless(input.id ? canWriteStream(scope, input.id) : canWriteClass(scope, classId), "Stream was not found.");
    const row = {
      business_unit_id: businessUnitId,
      class_id: classId,
      name,
      code,
      sort_order: sortValue(input.sortOrder),
      is_active: Boolean(input.isActive),
    };
    const result = input.id
      ? await supabase
          .from("sch_class_streams")
          .update(row)
          .eq("id", input.id)
          .eq("business_unit_id", businessUnitId)
          .eq("class_id", classId)
          .select("id, class_id, name, code, sort_order, is_active, class_teacher_user_id")
          .maybeSingle()
      : await supabase
          .from("sch_class_streams")
          .insert(row)
          .select("id, class_id, name, code, sort_order, is_active, class_teacher_user_id")
          .maybeSingle();
    if (result.error) mapStructureError(result.error, "stream");
    if (!result.data) throw new SchoolError("Couldn't save. Please try again.", "DATABASE");
    let classTeacherName: string | null = null;
    if (result.data.class_teacher_user_id) {
      const profile = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", result.data.class_teacher_user_id)
        .maybeSingle();
      classTeacherName = profile.data?.full_name ? String(profile.data.full_name) : null;
    }
    await audit({
      action: input.id ? "school.stream_updated" : "school.stream_created",
      description: input.id ? `Stream updated · ${name}` : `Stream created · ${name}`,
      entityType: "sch_class_streams",
      entityId: String(result.data.id),
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const, stream: mapStream(result.data, classTeacherName) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolStreamAction(id: string) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const scope = await loadSchoolStructureScope(ctx);
    denyUnless(canWriteStream(scope, id), "Stream was not found.");
    const existing = await supabase
      .from("sch_class_streams")
      .select("id, name")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (existing.error && !isSchoolUnconfiguredRead(existing.error)) mapSchoolDbError(existing.error);
    if (!existing.data) throw new SchoolError("Stream was not found.", "NOT_FOUND");
    const result = await supabase
      .from("sch_class_streams")
      .update({ is_active: false })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (result.error) mapSchoolDbError(result.error);
    await audit({
      action: "school.stream_archived",
      description: `Stream archived · ${String(existing.data.name)}`,
      entityType: "sch_class_streams",
      entityId: id,
      businessUnitId,
    });
    invalidateSchoolStructureCatalog();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
