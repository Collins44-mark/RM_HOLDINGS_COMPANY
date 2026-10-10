import type { SchoolReportKind, SchoolReportWorkspace } from "@/lib/school/report-types";

const KEY = "school.reports.workspace";
const TTL_MS = 45_000;

type Snapshot = {
  at: number;
  workspace: SchoolReportWorkspace;
};

function readAll(): Partial<Record<SchoolReportKind, Snapshot>> {
  if (typeof window === "undefined") return {};
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<SchoolReportKind, Snapshot>>;
  } catch {
    return {};
  }
}

export function writeSchoolReportSnapshot(workspace: SchoolReportWorkspace) {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[workspace.kind] = { at: Date.now(), workspace };
  sessionStorage.setItem(KEY, JSON.stringify(all));
}

export function peekSchoolReportSnapshot(kind: SchoolReportKind | null | undefined): SchoolReportWorkspace | null {
  if (!kind || typeof window === "undefined") return null;
  const row = readAll()[kind];
  if (!row?.workspace?.kind || row.workspace.kind !== kind) return null;
  if (Date.now() - row.at > TTL_MS) return null;
  return row.workspace;
}
