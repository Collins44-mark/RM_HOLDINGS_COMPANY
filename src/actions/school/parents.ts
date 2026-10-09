"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeAuditEvent } from "@/lib/audit";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireSchoolPermission,
  schoolActionError,
  SchoolError,
  type SchoolContext,
} from "@/lib/school/access";
import { schoolPageMeta, schoolPageRange, parseSchoolPageSize } from "@/lib/school/pagination";
import {
  enrollmentPlacementOr,
  loadPlacementByClassIds,
  loadPlacementByStreamIds,
  resolveEnrollmentPlacementFilterFromCatalog,
} from "@/lib/school/placement-query";
import { catalogLookup, loadSchoolStructureCatalog } from "@/lib/school/structure-catalog";
import { loadSchoolStructureScope } from "@/lib/school/structure-scope";

const VIEW = "school.parents.view";
const MANAGE = "school.parents.manage";

export type GuardianStudentLink = {
  studentId: string;
  name: string;
  levelName: string;
  className: string;
  streamName: string;
  relationship: string;
};

export type GuardianListRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  students: GuardianStudentLink[];
};

export type GuardianPlacementOption = { id: string; name: string };

export type GuardianSaveFields = Partial<Record<"fullName" | "phone" | "email" | "relationship", string>>;

function str(value: unknown) {
  return String(value ?? "").trim();
}

function canManage(user: Awaited<ReturnType<typeof requireAuth>>) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(MANAGE, matcher));
}

function searchNeedle(value: unknown) {
  return str(value).replace(/[%_,()]/g, " ").slice(0, 80);
}

function studentSearchOr(q: string) {
  const parts = q.split(/\s+/).filter(Boolean);
  const clauses = [
    `first_name.ilike.%${q}%`,
    `middle_name.ilike.%${q}%`,
    `last_name.ilike.%${q}%`,
    `student_number.ilike.%${q}%`,
    `admission_number.ilike.%${q}%`,
  ];
  if (parts.length >= 2) {
    clauses.push(`and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`);
  }
  return clauses.join(",");
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseGuardianPage(payload: unknown) {
  const parsed = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  const row = (parsed ?? {}) as { total?: unknown; ids?: unknown };
  const ids = Array.isArray(row.ids) ? row.ids.map((id) => str(id)).filter(Boolean) : [];
  const total = Number(row.total);
  return { ids, total: Number.isFinite(total) && total >= 0 ? total : ids.length };
}

async function hydrateGuardians(ctx: SchoolContext, ids: string[]): Promise<GuardianListRow[]> {
  if (!ids.length) return [];
  const { supabase, businessUnitId } = ctx;
  const [guardiansRes, linksRes, catalog] = await Promise.all([
    supabase
      .from("sch_guardians")
      .select("id, full_name, phone, email, address, occupation")
      .eq("business_unit_id", businessUnitId)
      .in("id", ids),
    supabase
      .from("sch_student_guardians")
      .select("guardian_id, student_id, relationship")
      .eq("business_unit_id", businessUnitId)
      .in("guardian_id", ids),
    loadSchoolStructureCatalog(ctx),
  ]);
  if (guardiansRes.error && !isSchoolUnconfiguredRead(guardiansRes.error)) mapSchoolDbError(guardiansRes.error, "load");
  const studentIds = [...new Set((linksRes.data ?? []).map((row) => String(row.student_id)).filter(Boolean))];
  const [studentsRes, enrollmentsRes] = studentIds.length
    ? await Promise.all([
        supabase
          .from("sch_students")
          .select("id, first_name, middle_name, last_name")
          .eq("business_unit_id", businessUnitId)
          .in("id", studentIds),
        supabase
          .from("sch_student_enrollments")
          .select("student_id, stream_id, class_id")
          .eq("business_unit_id", businessUnitId)
          .eq("status", "active")
          .in("student_id", studentIds),
      ])
    : [{ data: [] as Array<Record<string, unknown>> }, { data: [] as Array<Record<string, unknown>> }];
  const lookup = catalogLookup(catalog);
  const missingStreams = (enrollmentsRes.data ?? [])
    .map((row) => str(row.stream_id))
    .filter((id) => id && !lookup.placement(id));
  const missingClasses = (enrollmentsRes.data ?? [])
    .filter((row) => !str(row.stream_id))
    .map((row) => str(row.class_id))
    .filter((id) => id && !lookup.placementByClass(id));
  const [byStream, byClass] = await Promise.all([
    missingStreams.length ? loadPlacementByStreamIds(ctx, missingStreams) : Promise.resolve(new Map()),
    missingClasses.length ? loadPlacementByClassIds(ctx, missingClasses) : Promise.resolve(new Map()),
  ]);
  const studentNames = new Map<string, string>();
  for (const row of studentsRes.data ?? []) {
    studentNames.set(
      String(row.id),
      [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" "),
    );
  }
  const placements = new Map<string, { levelName: string; className: string; streamName: string }>();
  for (const row of enrollmentsRes.data ?? []) {
    const nextStreamId = str(row.stream_id);
    const nextClassId = str(row.class_id);
    const place = nextStreamId
      ? lookup.placement(nextStreamId) ?? byStream.get(nextStreamId)
      : lookup.placementByClass(nextClassId) ?? byClass.get(nextClassId);
    placements.set(String(row.student_id), {
      levelName: place?.levelName ?? "",
      className: place?.className ?? "",
      streamName: place?.streamName ?? "",
    });
  }
  const names = new Map<string, GuardianStudentLink[]>();
  for (const row of linksRes.data ?? []) {
    const studentId = str(row.student_id);
    const label = studentNames.get(studentId) ?? "";
    const place = placements.get(studentId);
    const list = names.get(String(row.guardian_id)) ?? [];
    list.push({
      studentId,
      name: label,
      levelName: place?.levelName ?? "",
      className: place?.className ?? "",
      streamName: place?.streamName ?? "",
      relationship: str(row.relationship),
    });
    names.set(String(row.guardian_id), list);
  }
  const byId = new Map(
    (guardiansRes.data ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        fullName: str(row.full_name),
        phone: str(row.phone),
        email: str(row.email),
        address: str(row.address),
        occupation: str(row.occupation),
        students: names.get(String(row.id)) ?? [],
      } satisfies GuardianListRow,
    ]),
  );
  return ids.map((id) => byId.get(id)).filter((row): row is GuardianListRow => Boolean(row));
}

async function pageGuardianIds(
  ctx: SchoolContext,
  input: { q: string; allowedIds: string[] | null; from: number; pageSize: number },
) {
  const { supabase, businessUnitId } = ctx;
  const paged = await supabase.rpc("sch_page_guardian_ids", {
    p_bu: businessUnitId,
    p_q: input.q,
    p_student_ids: input.allowedIds,
    p_offset: input.from,
    p_limit: input.pageSize,
  });
  if (!paged.error && paged.data) return parseGuardianPage(paged.data);

  const matching = new Set<string>();
  if (input.q) {
    const [guardianMatch, studentMatch] = await Promise.all([
      supabase
        .from("sch_guardians")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .or(`full_name.ilike.%${input.q}%,phone.ilike.%${input.q}%,email.ilike.%${input.q}%`),
      supabase
        .from("sch_students")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .or(studentSearchOr(input.q)),
    ]);
    if (guardianMatch.error && !isSchoolUnconfiguredRead(guardianMatch.error)) mapSchoolDbError(guardianMatch.error, "load");
    if (studentMatch.error && !isSchoolUnconfiguredRead(studentMatch.error)) mapSchoolDbError(studentMatch.error, "load");
    for (const row of guardianMatch.data ?? []) matching.add(String(row.id));
    const studentIds = (studentMatch.data ?? []).map((row) => String(row.id));
    if (studentIds.length) {
      const links = await supabase
        .from("sch_student_guardians")
        .select("guardian_id")
        .eq("business_unit_id", businessUnitId)
        .in("student_id", studentIds);
      for (const row of links.data ?? []) matching.add(String(row.guardian_id));
    }
  }

  let query = supabase
    .from("sch_guardians")
    .select("id", { count: "exact" })
    .eq("business_unit_id", businessUnitId)
    .order("full_name")
    .range(input.from, input.from + input.pageSize - 1);
  if (input.allowedIds) query = query.in("id", input.allowedIds);
  if (input.q) {
    const ids = input.allowedIds ? [...matching].filter((id) => input.allowedIds?.includes(id)) : [...matching];
    if (!ids.length) return { ids: [] as string[], total: 0 };
    query = query.in("id", ids);
  }
  const result = await query;
  if (result.error && !isSchoolUnconfiguredRead(result.error)) mapSchoolDbError(result.error, "load");
  return {
    ids: (result.data ?? []).map((row) => String(row.id)),
    total: result.count ?? result.data?.length ?? 0,
  };
}

export async function listSchoolGuardiansAction(
  input: { page?: number; pageSize?: number; q?: string; levelId?: string; classId?: string; streamId?: string } = {},
) {
  try {
    const user = await requireAuth();
    const ctx = await requireSchoolPermission(VIEW);
    const { supabase, businessUnitId } = ctx;
    const [catalog, scope] = await Promise.all([
      loadSchoolStructureCatalog(ctx),
      isOwnerRole(user.roleCode) ? Promise.resolve(null) : loadSchoolStructureScope(ctx),
    ]);
    const levels = catalog.levels.filter((row) => !scope || scope.schoolWide || scope.levelIds.has(row.id));
    const pageSize = parseSchoolPageSize(input.pageSize);
    const { page, from } = schoolPageRange(input.page ?? 1, pageSize);
    const q = searchNeedle(input.q);
    const levelId = str(input.levelId);
    const classId = str(input.classId);
    const classes = levelId
      ? catalog.classes
          .filter((row) => row.levelId === levelId && (!scope || scope.schoolWide || scope.classIds.has(row.id)))
          .map((row) => ({ id: row.id, name: row.name }))
      : [];
    const streams = classId
      ? catalog.streams
          .filter((row) => row.classId === classId && (!scope || scope.schoolWide || scope.streamIds.has(row.id)))
          .map((row) => ({ id: row.id, name: row.name }))
      : [];
    const empty = {
      ok: true as const,
      guardians: [] as GuardianListRow[],
      page: schoolPageMeta(1, 0, pageSize),
      levels,
      classes,
      streams,
      capabilities: { canView: true, canManage: canManage(user) },
    };
    const placementFilter = resolveEnrollmentPlacementFilterFromCatalog(catalog, input, scope);
    const placementOr = enrollmentPlacementOr(placementFilter);
    let allowedIds: string[] | null = null;
    if (placementOr) {
      if (placementFilter.kind === "empty") return empty;
      const enrollments = await supabase
        .from("sch_student_enrollments")
        .select("student_id")
        .eq("business_unit_id", businessUnitId)
        .eq("status", "active")
        .or(placementOr);
      const studentIds = [...new Set((enrollments.data ?? []).map((row) => String(row.student_id)))];
      if (!studentIds.length) return empty;
      const links = await supabase
        .from("sch_student_guardians")
        .select("guardian_id")
        .eq("business_unit_id", businessUnitId)
        .in("student_id", studentIds);
      allowedIds = [...new Set((links.data ?? []).map((row) => String(row.guardian_id)))];
      if (!allowedIds.length) return empty;
    }
    const paged = await pageGuardianIds(ctx, { q, allowedIds, from, pageSize });
    const guardians = await hydrateGuardians(ctx, paged.ids);
    return {
      ok: true as const,
      guardians,
      page: schoolPageMeta(page, paged.total, pageSize),
      levels,
      classes,
      streams,
      capabilities: { canView: true, canManage: canManage(user) },
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function updateSchoolGuardianAction(input: {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
  occupation?: string;
  studentId?: string;
  relationship?: string;
}) {
  try {
    const ctx = await requireSchoolPermission(MANAGE);
    const { supabase, businessUnitId } = ctx;
    const id = str(input.id);
    if (!id) throw new SchoolError("Guardian was not found.", "NOT_FOUND");
    const fullName = str(input.fullName);
    const phone = str(input.phone);
    const email = str(input.email);
    const address = str(input.address).slice(0, 240);
    const occupation = str(input.occupation).slice(0, 80);
    const studentId = str(input.studentId);
    const relationship = str(input.relationship);
    const fields: GuardianSaveFields = {};
    if (fullName.length < 2 || fullName.length > 160) fields.fullName = "Enter the guardian’s full name.";
    if (phone.length < 7 || phone.length > 40) fields.phone = "Enter a valid phone number.";
    if (email && !emailLooksValid(email)) fields.email = "Enter a valid email address.";
    if (studentId && !relationship) fields.relationship = "Enter the relationship to the student.";
    if (relationship && relationship.length > 40) fields.relationship = "Enter a valid relationship.";
    if (Object.keys(fields).length) {
      return { ok: false as const, error: Object.values(fields)[0] ?? "Check the highlighted fields.", fields };
    }

    const current = await supabase
      .from("sch_guardians")
      .select("id, full_name")
      .eq("business_unit_id", businessUnitId)
      .eq("id", id)
      .maybeSingle();
    if (current.error && !isSchoolUnconfiguredRead(current.error)) mapSchoolDbError(current.error, "save");
    if (!current.data) throw new SchoolError("Guardian was not found.", "NOT_FOUND");

    const updated = await supabase
      .from("sch_guardians")
      .update({
        full_name: fullName.slice(0, 160),
        phone: phone.slice(0, 40),
        email: email.slice(0, 160),
        address,
        occupation,
      })
      .eq("business_unit_id", businessUnitId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (updated.error) mapSchoolDbError(updated.error, "save");

    if (studentId && relationship) {
      const link = await supabase
        .from("sch_student_guardians")
        .update({ relationship: relationship.slice(0, 40) })
        .eq("business_unit_id", businessUnitId)
        .eq("guardian_id", id)
        .eq("student_id", studentId)
        .select("id")
        .maybeSingle();
      if (link.error) mapSchoolDbError(link.error, "save");
      if (!link.data) throw new SchoolError("That guardian is not linked to this student.", "NOT_FOUND");
    }

    await writeAuditEvent({
      action: "school.guardian_updated",
      module: "school",
      description: `Guardian updated · ${fullName}`,
      severity: "medium",
      entityType: "sch_guardians",
      entityId: id,
      businessUnitId,
    });

    const [guardian] = await hydrateGuardians(ctx, [id]);
    return { ok: true as const, guardian: guardian ?? null };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
