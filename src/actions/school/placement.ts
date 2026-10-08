"use server";

import { requireAnySchoolPermission, schoolActionError } from "@/lib/school/access";
import { loadActiveClasses, loadActiveLevels, loadActiveStreams } from "@/lib/school/placement-query";

const PLACEMENT_VIEW = ["school.students.view", "school.parents.view", "school.classes.view", "school.admissions.view"];

export async function getSchoolPlacementLevelsAction() {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    return { ok: true as const, levels: await loadActiveLevels(ctx) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), levels: [] as Array<{ id: string; name: string }> };
  }
}

export async function getSchoolPlacementClassesAction(levelId: string) {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    return { ok: true as const, classes: await loadActiveClasses(ctx, levelId) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), classes: [] as Array<{ id: string; name: string }> };
  }
}

export async function getSchoolPlacementStreamsAction(classId: string) {
  try {
    const ctx = await requireAnySchoolPermission(PLACEMENT_VIEW);
    return { ok: true as const, streams: await loadActiveStreams(ctx, classId) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error), streams: [] as Array<{ id: string; name: string }> };
  }
}
