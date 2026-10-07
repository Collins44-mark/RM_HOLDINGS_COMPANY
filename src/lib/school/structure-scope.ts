import type { SchoolContext } from "@/lib/school/access";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";
import { isOwnerRole } from "@/lib/auth/rbac";
import { requireAuth } from "@/lib/auth/session";

export type SchoolStructureScope = {
  schoolWide: boolean;
  levelIds: Set<string>;
  classIds: Set<string>;
  streamIds: Set<string>;
  writeLevelIds: Set<string>;
  writeClassIds: Set<string>;
  writeStreamIds: Set<string>;
};

const schoolWide = (): SchoolStructureScope => ({
  schoolWide: true,
  levelIds: new Set(),
  classIds: new Set(),
  streamIds: new Set(),
  writeLevelIds: new Set(),
  writeClassIds: new Set(),
  writeStreamIds: new Set(),
});

export async function loadSchoolStructureScope(ctx: SchoolContext): Promise<SchoolStructureScope> {
  const user = await requireAuth();
  if (isOwnerRole(user.roleCode)) return schoolWide();

  const accessRes = await ctx.supabase
    .from("sch_academic_access")
    .select("scope_kind, target_id")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("user_id", ctx.userId);
  if (accessRes.error && !isSchoolUnconfiguredRead(accessRes.error)) return schoolWide();
  const rows = accessRes.data ?? [];
  if (rows.length === 0 || rows.some((row) => row.scope_kind === "school")) return schoolWide();

  const assignedLevels = [...new Set(rows.filter((row) => row.scope_kind === "level" && row.target_id).map((row) => String(row.target_id)))];
  const assignedClasses = [...new Set(rows.filter((row) => row.scope_kind === "class" && row.target_id).map((row) => String(row.target_id)))];
  const assignedStreams = [...new Set(rows.filter((row) => row.scope_kind === "stream" && row.target_id).map((row) => String(row.target_id)))];

  const levelIds = new Set(assignedLevels);
  const classIds = new Set(assignedClasses);
  const streamIds = new Set(assignedStreams);
  const writeLevelIds = new Set(assignedLevels);
  const writeClassIds = new Set(assignedClasses);
  const writeStreamIds = new Set(assignedStreams);

  if (assignedLevels.length) {
    const levelClasses = await ctx.supabase
      .from("sch_classes")
      .select("id")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("level_id", assignedLevels);
    const descendantClassIds = (levelClasses.data ?? []).map((row) => String(row.id));
    descendantClassIds.forEach((id) => {
      classIds.add(id);
      writeClassIds.add(id);
    });
    if (descendantClassIds.length) {
      const levelStreams = await ctx.supabase
        .from("sch_class_streams")
        .select("id")
        .eq("business_unit_id", ctx.businessUnitId)
        .in("class_id", descendantClassIds);
      for (const row of levelStreams.data ?? []) {
        streamIds.add(String(row.id));
        writeStreamIds.add(String(row.id));
      }
    }
  }

  if (assignedClasses.length) {
    const classStreams = await ctx.supabase
      .from("sch_class_streams")
      .select("id")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("class_id", assignedClasses);
    for (const row of classStreams.data ?? []) {
      streamIds.add(String(row.id));
      writeStreamIds.add(String(row.id));
    }
    const classParents = await ctx.supabase
      .from("sch_classes")
      .select("level_id")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("id", assignedClasses);
    for (const row of classParents.data ?? []) levelIds.add(String(row.level_id));
  }

  if (assignedStreams.length) {
    const streamParents = await ctx.supabase
      .from("sch_class_streams")
      .select("class_id")
      .eq("business_unit_id", ctx.businessUnitId)
      .in("id", assignedStreams);
    const parentClassIds = [...new Set((streamParents.data ?? []).map((row) => String(row.class_id)))];
    parentClassIds.forEach((id) => classIds.add(id));
    if (parentClassIds.length) {
      const classParents = await ctx.supabase
        .from("sch_classes")
        .select("level_id")
        .eq("business_unit_id", ctx.businessUnitId)
        .in("id", parentClassIds);
      for (const row of classParents.data ?? []) levelIds.add(String(row.level_id));
    }
  }

  return { schoolWide: false, levelIds, classIds, streamIds, writeLevelIds, writeClassIds, writeStreamIds };
}

export function allowsLevel(scope: SchoolStructureScope, levelId: string) {
  return scope.schoolWide || scope.levelIds.has(levelId);
}

export function allowsClass(scope: SchoolStructureScope, classId: string) {
  return scope.schoolWide || scope.classIds.has(classId);
}

export function allowsStream(scope: SchoolStructureScope, streamId: string) {
  return scope.schoolWide || scope.streamIds.has(streamId);
}

export function canWriteLevel(scope: SchoolStructureScope, levelId?: string) {
  if (scope.schoolWide) return true;
  return Boolean(levelId && scope.writeLevelIds.has(levelId));
}

export function canWriteClass(scope: SchoolStructureScope, classId?: string) {
  if (scope.schoolWide) return true;
  return Boolean(classId && scope.writeClassIds.has(classId));
}

export function canWriteStream(scope: SchoolStructureScope, streamId?: string) {
  if (scope.schoolWide) return true;
  return Boolean(streamId && scope.writeStreamIds.has(streamId));
}
