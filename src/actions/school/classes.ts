"use server";

import { writeAuditEvent } from "@/lib/audit";
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

function mapStructureError(error: { message: string; code?: string } | null, kind: "level" | "class"): never {
  if (error?.code === "23505") {
    throw new SchoolError(
      kind === "level" ? "This level code is already in use." : "This class code already exists in this level.",
      "CONFLICT",
    );
  }
  if (error?.code === "23503") {
    throw new SchoolError("A class must belong to a valid level.", "VALIDATION");
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

function mapClass(row: Record<string, unknown>): SchoolClassRow {
  return {
    id: String(row.id),
    levelId: String(row.level_id),
    name: String(row.name),
    code: String(row.code),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
  };
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

export async function getSchoolLevelsAction() {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const [levelsRes, classesRes] = await Promise.all([
      supabase
        .from("sch_class_levels")
        .select("id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order"),
      supabase.from("sch_classes").select("id, level_id, is_active").eq("business_unit_id", businessUnitId),
    ]);
    if (levelsRes.error && !isSchoolUnconfiguredRead(levelsRes.error)) mapSchoolDbError(levelsRes.error, "load");
    if (classesRes.error && !isSchoolUnconfiguredRead(classesRes.error)) mapSchoolDbError(classesRes.error, "load");
    const counts = new Map<string, number>();
    for (const row of classesRes.data ?? []) {
      if (!row.is_active) continue;
      const levelId = String(row.level_id);
      counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
    }
    return {
      ok: true as const,
      levels: (levelsRes.data ?? []).map((row) => mapLevel(row, counts.get(String(row.id)) ?? 0)),
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function getSchoolLevelDetailAction(levelId: string) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireSchoolPermission(VIEW);
    const id = str(levelId);
    if (!id) throw new SchoolError("Level was not found.", "NOT_FOUND");
    const [levelRes, classesRes] = await Promise.all([
      supabase
        .from("sch_class_levels")
        .select("id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("sch_classes")
        .select("id, level_id, name, code, sort_order, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("level_id", id)
        .order("sort_order"),
    ]);
    if (levelRes.error && !isSchoolUnconfiguredRead(levelRes.error)) mapSchoolDbError(levelRes.error, "load");
    if (!levelRes.data) throw new SchoolError("Level was not found.", "NOT_FOUND");
    if (classesRes.error && !isSchoolUnconfiguredRead(classesRes.error)) mapSchoolDbError(classesRes.error, "load");
    const classes = (classesRes.data ?? []).map((row) => mapClass(row));
    return {
      ok: true as const,
      level: mapLevel(levelRes.data, classes.filter((row) => row.isActive).length),
      classes,
      capabilities: { canView: true, canManage: canManage(user) },
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
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
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
    return { ok: true as const, level: mapLevel(result.data) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolLevelAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
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
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
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
    return { ok: true as const, classRow: mapClass(result.data) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function archiveSchoolClassAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSchoolPermission(MANAGE);
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
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
