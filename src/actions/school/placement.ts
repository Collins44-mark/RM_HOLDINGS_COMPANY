"use server";

import { requireAnySchoolPermission, schoolActionError } from "@/lib/school/access";
import { loadActiveClasses, loadActiveLevels, loadActiveStreams } from "@/lib/school/placement-query";
import { allowsClass, allowsLevel, allowsStream, loadSchoolStructureScope } from "@/lib/school/structure-scope";

const PLACEMENT_VIEW = ["school.students.view", "school.parents.view", "school.classes.view", "school.admissions.view"];

export async function getSchoolPlacementLevelsAction() {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    const scope = await loadSchoolStructureScope(ctx);
    const levels = (await loadActiveLevels(ctx)).filter((row) => allowsLevel(scope, row.id));
    return { ok: true as const, levels };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), levels: [] as Array<{ id: string; name: string }> };
  }
}

export async function getSchoolPlacementClassesAction(levelId: string) {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    const scope = await loadSchoolStructureScope(ctx);
    if (!allowsLevel(scope, levelId)) return { ok: true as const, classes: [] as Array<{ id: string; name: string }> };
    const classes = (await loadActiveClasses(ctx, levelId)).filter((row) => allowsClass(scope, row.id));
    return { ok: true as const, classes };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), classes: [] as Array<{ id: string; name: string }> };
  }
}

export async function getSchoolPlacementStreamsAction(classId: string) {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    const scope = await loadSchoolStructureScope(ctx);
    if (!allowsClass(scope, classId)) return { ok: true as const, streams: [] as Array<{ id: string; name: string }> };
    const streams = (await loadActiveStreams(ctx, classId)).filter((row) => allowsStream(scope, row.id));
    return { ok: true as const, streams };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), streams: [] as Array<{ id: string; name: string }> };
  }
}
