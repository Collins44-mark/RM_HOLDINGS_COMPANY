import { ROLE_CODES } from "@/lib/config/permissions";

export function isSchoolTeacherRole(code: string | null | undefined) {
  return String(code ?? "").trim() === ROLE_CODES.TEACHER;
}

export function isTeacherEmployee(input: { typeKind?: string | null; roleCode?: string | null }) {
  return String(input.typeKind ?? "").trim() === "academic" || isSchoolTeacherRole(input.roleCode);
}

export function countDistinctTeachers(
  rows: Array<{ id: string; typeKind?: string | null; roleCode?: string | null }>,
) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || !isTeacherEmployee(row)) continue;
    ids.add(row.id);
  }
  return ids.size;
}

export function schoolRoleCodeForAssignment(input: {
  assignedModules: string[];
  roleCode: string;
  moduleRoles?: Record<string, string>;
}) {
  if (input.assignedModules.includes("*") || input.assignedModules.includes("school")) {
    return String(input.moduleRoles?.school ?? input.roleCode).trim();
  }
  return "";
}
