import type { SchoolExamsWorkspace } from "@/actions/school/exams";

const LIST_KEY = "school.exams.list";

export function writeExamsListSnapshot(workspace: SchoolExamsWorkspace) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    LIST_KEY,
    JSON.stringify({
      exams: workspace.exams,
      page: workspace.page,
      query: workspace.query,
      classId: workspace.classId,
      catalog: workspace.catalog,
      capabilities: workspace.capabilities,
    } satisfies Pick<SchoolExamsWorkspace, "exams" | "page" | "query" | "classId" | "catalog" | "capabilities">),
  );
}

export function peekExamsListSnapshot(): SchoolExamsWorkspace | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(LIST_KEY);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as SchoolExamsWorkspace;
    if (!Array.isArray(row?.exams)) return null;
    return { ...row, classSubjects: row.classSubjects ?? [] };
  } catch {
    return null;
  }
}
