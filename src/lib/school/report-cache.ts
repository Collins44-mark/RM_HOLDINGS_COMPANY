import {
  loadSchoolReportsWorkspaceAction,
  type SchoolReportLoadInput,
  type SchoolReportsWorkspaceResult,
} from "@/actions/school/reports";
import { parseSchoolPageSize } from "@/lib/school/pagination";
import type { SchoolFinanceSlice, SchoolReportKind, SchoolReportWorkspace } from "@/lib/school/report-types";
import { writeSchoolReportSnapshot } from "@/lib/school/report-flash";

const TTL_MS = 45_000;

export const SCHOOL_REPORT_RESET_FILTERS = {
  slice: "all" as SchoolFinanceSlice,
  q: "",
  levelId: "",
  classId: "",
  streamId: "",
  status: "",
  academicYearId: "",
  categoryId: "",
  busId: "",
  page: 1,
};

export function defaultSchoolReportInput(kind: SchoolReportKind): SchoolReportLoadInput {
  return { kind, period: "this-month", ...SCHOOL_REPORT_RESET_FILTERS };
}

export function schoolReportCacheKey(input: SchoolReportLoadInput): string {
  return [
    input.kind ?? "",
    input.period ?? "this-month",
    input.from ?? "",
    input.to ?? "",
    input.slice ?? "all",
    input.q ?? "",
    input.levelId ?? "",
    input.classId ?? "",
    input.streamId ?? "",
    input.status ?? "",
    input.academicYearId ?? "",
    input.categoryId ?? "",
    input.busId ?? "",
    String(input.page ?? 1),
    input.exportAll ? "export" : String(parseSchoolPageSize(input.pageSize)),
  ].join("|");
}

type CacheEntry = {
  at: number;
  promise: Promise<SchoolReportsWorkspaceResult>;
  workspace?: SchoolReportWorkspace;
};

const memory = new Map<string, CacheEntry>();

function live(entry: CacheEntry | undefined): CacheEntry | null {
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry;
}

export function peekSchoolReportCache(input: SchoolReportLoadInput): SchoolReportWorkspace | null {
  const entry = live(memory.get(schoolReportCacheKey(input)));
  return entry?.workspace ?? null;
}

export function loadSchoolReportCached(
  input: SchoolReportLoadInput,
  existing?: Promise<SchoolReportsWorkspaceResult>,
): Promise<SchoolReportsWorkspaceResult> {
  const key = schoolReportCacheKey(input);
  const hit = live(memory.get(key));
  if (hit) return hit.promise;
  const promise = existing ?? loadSchoolReportsWorkspaceAction(input);
  const entry: CacheEntry = { at: Date.now(), promise };
  memory.set(key, entry);
  void promise.then((result) => {
    if (memory.get(key) !== entry) return;
    if (!result.ok) {
      memory.delete(key);
      return;
    }
    entry.workspace = result.workspace;
    writeSchoolReportSnapshot(result.workspace);
  });
  return promise;
}

export function prefetchSchoolReport(kind: SchoolReportKind) {
  return loadSchoolReportCached(defaultSchoolReportInput(kind));
}

export function rememberSchoolReportResult(result: SchoolReportsWorkspaceResult) {
  if (!result.ok) return;
  writeSchoolReportSnapshot(result.workspace);
  const input = defaultSchoolReportInput(result.workspace.kind);
  const key = schoolReportCacheKey(input);
  const promise = Promise.resolve(result);
  memory.set(key, { at: Date.now(), promise, workspace: result.workspace });
}
