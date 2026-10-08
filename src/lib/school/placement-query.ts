import type { SchoolContext } from "@/lib/school/access";
import { isSchoolUnconfiguredRead } from "@/lib/school/access";
import type { SchoolStructureScope } from "@/lib/school/structure-scope";

export type PlacementOption = { id: string; name: string };

function str(value: unknown) {
  return String(value ?? "").trim();
}

export async function loadActiveLevels(ctx: SchoolContext): Promise<PlacementOption[]> {
  const result = await ctx.supabase
    .from("sch_class_levels")
    .select("id, name")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("is_active", true)
    .order("sort_order");
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  return (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function loadActiveClasses(ctx: SchoolContext, levelId: string): Promise<PlacementOption[]> {
  const id = str(levelId);
  if (!id) return [];
  const result = await ctx.supabase
    .from("sch_classes")
    .select("id, name")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("level_id", id)
    .eq("is_active", true)
    .order("sort_order");
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  return (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function loadActiveStreams(ctx: SchoolContext, classId: string): Promise<PlacementOption[]> {
  const id = str(classId);
  if (!id) return [];
  const result = await ctx.supabase
    .from("sch_class_streams")
    .select("id, name")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("class_id", id)
    .eq("is_active", true)
    .order("sort_order");
  if (result.error && !isSchoolUnconfiguredRead(result.error)) return [];
  return (result.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function resolvePlacementStreamIds(
  ctx: SchoolContext,
  input: { levelId?: string; classId?: string; streamId?: string },
  scope?: SchoolStructureScope | null,
): Promise<string[] | null> {
  const streamId = str(input.streamId);
  const classId = str(input.classId);
  const levelId = str(input.levelId);
  if (!streamId && !classId && !levelId) {
    if (!scope || scope.schoolWide) return null;
    return [...scope.streamIds];
  }

  let ids: string[] = [];
  if (streamId) {
    ids = [streamId];
  } else if (classId) {
    const streams = await loadActiveStreams(ctx, classId);
    ids = streams.map((row) => row.id);
  } else {
    const classes = await loadActiveClasses(ctx, levelId);
    if (!classes.length) return [];
    const streams = await ctx.supabase
      .from("sch_class_streams")
      .select("id")
      .eq("business_unit_id", ctx.businessUnitId)
      .eq("is_active", true)
      .in(
        "class_id",
        classes.map((row) => row.id),
      );
    if (streams.error && !isSchoolUnconfiguredRead(streams.error)) return [];
    ids = (streams.data ?? []).map((row) => String(row.id));
  }

  if (scope && !scope.schoolWide) ids = ids.filter((id) => scope.streamIds.has(id));
  return ids;
}

export function placementLabel(levelName: string, className: string, streamName: string) {
  return [levelName, className, streamName].filter(Boolean).join(" · ");
}

export async function loadPlacementByStreamIds(ctx: SchoolContext, streamIds: string[]) {
  const names = new Map<string, { levelName: string; className: string; streamName: string }>();
  const ids = [...new Set(streamIds.filter(Boolean))];
  if (!ids.length) return names;
  const streams = await ctx.supabase
    .from("sch_class_streams")
    .select("id, name, class_id")
    .eq("business_unit_id", ctx.businessUnitId)
    .in("id", ids);
  if (streams.error && !isSchoolUnconfiguredRead(streams.error)) return names;
  const classIds = [...new Set((streams.data ?? []).map((row) => str(row.class_id)).filter(Boolean))];
  const classes = classIds.length
    ? await ctx.supabase.from("sch_classes").select("id, name, level_id").eq("business_unit_id", ctx.businessUnitId).in("id", classIds)
    : { data: [] as Array<{ id: string; name: string; level_id: string }>, error: null };
  if (classes.error && !isSchoolUnconfiguredRead(classes.error)) return names;
  const levelIds = [...new Set((classes.data ?? []).map((row) => str(row.level_id)).filter(Boolean))];
  const levels = levelIds.length
    ? await ctx.supabase.from("sch_class_levels").select("id, name").eq("business_unit_id", ctx.businessUnitId).in("id", levelIds)
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
