"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createSchoolExamAction,
  getSchoolExamDetailAction,
  getSchoolExamsWorkspaceAction,
  listSchoolClassAssignedSubjectsAction,
  publishSchoolExamAction,
  saveSchoolExamResultsAction,
  type SchoolExamDetail,
  type SchoolExamRow,
  type SchoolExamSubjectOption,
  type SchoolExamsWorkspace,
} from "@/actions/school/exams";
import { SCHOOL_EXAM_TYPES } from "@/lib/school/exam-types";
import {
  examGradeFromAverage,
  examMarkStatus,
  formatExamAverage,
  formatExamPosition,
  parseEnteredMark,
  rankExamAverages,
  studentExamAverage,
  type ExamResultSort,
} from "@/lib/school/exam-ranking";
import { writeExamsListSnapshot } from "@/lib/school/exam-flash";
import { downloadExamResultsPdf } from "@/lib/school/exam-results-pdf";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  filterClass,
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { SchoolConfirmDialog, SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { schoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import { ChevronLeft, ClipboardList } from "lucide-react";

const markInputClass =
  "h-8 w-[3.4rem] rounded-[10px] border border-[#dbe4ef] bg-white px-1.5 text-center text-[13px] tabular-nums text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

const backButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/80 bg-white/72 px-3 text-[12.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b82c4]/15 active:translate-y-px";

const EXAM_TYPE_LABEL: Record<(typeof SCHOOL_EXAM_TYPES)[number], string> = {
  midterm: "Midterm",
  final: "Final",
  test: "Test",
  assessment: "Assessment",
  other: "Other",
};

function emptyWorkspace(): SchoolExamsWorkspace {
  return {
    exams: [],
    page: schoolPageMeta(1, 0),
    query: "",
    classId: "",
    catalog: { years: [], terms: [], levels: [], classes: [], streams: [] },
    classSubjects: [],
    capabilities: { canView: true, canManage: false, canEnter: false, canPublish: false },
  };
}

export function SchoolExamsPage({
  workspace: initial,
  error: initialError,
  pending = false,
}: {
  workspace: SchoolExamsWorkspace | null;
  error: string | null;
  pending?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initial ?? emptyWorkspace());
  const [error, setError] = useState(initialError);
  const [query, setQuery] = useState(workspace.query);
  const [classId, setClassId] = useState(workspace.classId);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SchoolExamDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const detailSeq = useRef(0);
  const lock = useRef(false);
  const debounce = useRef<number | null>(null);
  const detailCache = useRef(new Map<string, SchoolExamDetail>());
  const detailInflight = useRef(new Map<string, Promise<Awaited<ReturnType<typeof getSchoolExamDetailAction>>>>());

  useEffect(() => {
    if (workspace.exams.length) writeExamsListSnapshot(workspace);
  }, [workspace]);

  function load(next: { page?: number; pageSize?: number; q?: string; classId?: string }) {
    const token = ++seq.current;
    const q = next.q ?? query;
    const nextClassId = next.classId ?? classId;
    void getSchoolExamsWorkspaceAction({
      page: next.page ?? 1,
      pageSize: next.pageSize ?? workspace.page.pageSize,
      q,
      classId: nextClassId,
    }).then((result) => {
      if (token !== seq.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setWorkspace(result.workspace);
      replaceSchoolPageParam(result.workspace.page.page, result.workspace.page.pageSize, { q, classId: nextClassId });
    });
  }

  function requestExamDetail(examId: string) {
    const cached = detailCache.current.get(examId);
    if (cached) return Promise.resolve({ ok: true as const, detail: cached });
    const inflight = detailInflight.current.get(examId);
    if (inflight) return inflight;
    const request = getSchoolExamDetailAction(examId).then((result) => {
      detailInflight.current.delete(examId);
      if (result.ok) detailCache.current.set(examId, result.detail);
      return result;
    });
    detailInflight.current.set(examId, request);
    return request;
  }

  function openExam(exam: SchoolExamRow) {
    const token = ++detailSeq.current;
    const cached = detailCache.current.get(exam.id);
    if (cached) {
      setOpeningId(null);
      setError(null);
      setDetail(cached);
      return;
    }
    setOpeningId(exam.id);
    setError(null);
    void requestExamDetail(exam.id).then((result) => {
      if (token !== detailSeq.current) return;
      setOpeningId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDetail(result.detail);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Exams & Results</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            Create exams from subjects assigned to a class, then enter marks for enrolled students.
          </p>
        </div>
        {workspace.capabilities.canManage ? (
          <button type="button" className={primaryButton} onClick={() => setCreateOpen(true)}>
            + Create Exam
          </button>
        ) : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      {detail ? (
        <ExamResultsPanel
          key={detail.exam.id}
          detail={detail}
          canEnter={workspace.capabilities.canEnter}
          canPublish={workspace.capabilities.canPublish}
          busy={busy}
          onBack={() => {
            detailSeq.current += 1;
            setOpeningId(null);
            setDetail(null);
          }}
          onSave={(marks) => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            const examId = detail.exam.id;
            const token = ++detailSeq.current;
            void saveSchoolExamResultsAction({ examId, marks }).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              void getSchoolExamDetailAction(examId).then((next) => {
                if (token !== detailSeq.current) return;
                if (!next.ok) {
                  setError(next.error);
                  return;
                }
                detailCache.current.set(examId, next.detail);
                setDetail(next.detail);
              });
            });
          }}
          onPublish={() => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            const examId = detail.exam.id;
            const token = ++detailSeq.current;
            void publishSchoolExamAction(examId).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              void getSchoolExamDetailAction(examId).then((next) => {
                if (token !== detailSeq.current) return;
                if (next.ok) {
                  detailCache.current.set(examId, next.detail);
                  setDetail(next.detail);
                }
              });
              load({ page: workspace.page.page });
            });
          }}
        />
      ) : (
        <section className={cn(glassPanel, "p-0 overflow-hidden")}>
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.04] px-4 py-3">
            <input
              className={cn(filterClass, "max-w-xs")}
              placeholder="Search exams"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (debounce.current) window.clearTimeout(debounce.current);
                debounce.current = window.setTimeout(() => load({ page: 1, q: value }), 220);
              }}
            />
            <select
              className={cn(filterClass, "max-w-[220px]")}
              value={classId}
              onChange={(event) => {
                const value = event.target.value;
                setClassId(value);
                load({ page: 1, classId: value });
              }}
            >
              <option value="">All classes</option>
              {workspace.catalog.classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          {workspace.exams.length === 0 && !pending ? (
            <div className="px-5 py-10">
              <SchoolIconWell icon={ClipboardList} />
              <h2 className="mt-3 text-[18px] font-semibold tracking-[-0.04em] text-navy">No exams yet</h2>
              <p className="mt-1 text-[13.5px] text-slate-500">No exam records have been created.</p>
            </div>
          ) : workspace.exams.length === 0 ? null : (
            <div className={tableScrollClass}>
              <table className="min-w-full text-left">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3">Exam</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Subjects</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {workspace.exams.map((exam) => (
                    <tr key={exam.id} className="border-t border-black/[0.04] text-[13.5px] text-navy">
                      <td className="px-4 py-3 font-medium">{exam.name}</td>
                      <td className="px-4 py-3 text-slate-500">{EXAM_TYPE_LABEL[exam.examType]}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {exam.levelName} · {exam.className}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{exam.examDate}</td>
                      <td className="px-4 py-3 text-slate-500">{exam.subjectCount}</td>
                      <td className="px-4 py-3 text-slate-500">{exam.status === "published" ? "Published" : "Draft"}</td>
                      <td className="px-4 py-3 text-right">
                        <CompactActionsMenu
                          ariaLabel={`${exam.name} actions`}
                          onOpen={() => {
                            void requestExamDetail(exam.id);
                          }}
                          items={[
                            {
                              label: openingId === exam.id ? "Opening…" : "Open results",
                              disabled: Boolean(openingId) && openingId !== exam.id,
                              onSelect: () => openExam(exam),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-3">
            <SchoolPagination
              page={workspace.page.page}
              total={workspace.page.total}
              pageSize={workspace.page.pageSize}
              onPage={(page) => load({ page })}
              onPageSize={(pageSize) => load({ page: 1, pageSize })}
            />
          </div>
        </section>
      )}

      {createOpen ? (
        <CreateExamDrawer
          workspace={workspace}
          busy={busy}
          error={error}
          onClose={() => {
            if (busy) return;
            setCreateOpen(false);
          }}
          onSave={(payload) => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            void createSchoolExamAction(payload).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setCreateOpen(false);
              load({ page: 1 });
            });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateExamDrawer({
  workspace,
  busy,
  error,
  onClose,
  onSave,
}: {
  workspace: SchoolExamsWorkspace;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    examType: string;
    academicYearId: string;
    termId?: string;
    examDate: string;
    classId: string;
    maxMarks: number;
    subjectIds: string[];
  }) => void;
}) {
  const currentYear = workspace.catalog.years.find((row) => row.isCurrent)?.id ?? workspace.catalog.years[0]?.id ?? "";
  const [name, setName] = useState("");
  const [examType, setExamType] = useState<(typeof SCHOOL_EXAM_TYPES)[number]>("midterm");
  const [academicYearId, setAcademicYearId] = useState(currentYear);
  const [termId, setTermId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<SchoolExamSubjectOption[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const classOptions = workspace.catalog.classes.filter((row) => !levelId || row.levelId === levelId);
  const terms = workspace.catalog.terms.filter((row) => row.academicYearId === academicYearId);
  const seq = useRef(0);

  function selectClass(nextClassId: string) {
    setClassId(nextClassId);
    setSubjectIds([]);
    if (!nextClassId) {
      setSubjects([]);
      setSubjectsError(null);
      return;
    }
    const token = ++seq.current;
    void listSchoolClassAssignedSubjectsAction(nextClassId).then((result) => {
      if (token !== seq.current) return;
      if (!result.ok) {
        setSubjectsError(result.error);
        setSubjects([]);
        return;
      }
      setSubjectsError(null);
      setSubjects(result.subjects);
    });
  }

  return (
    <ContainedDrawer
      title="Create exam"
      subtitle="Subjects come from the selected class assignment list."
      dirty={Boolean(name || classId || subjectIds.length)}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            disabled={!name.trim() || !classId || !examDate || !academicYearId || subjectIds.length === 0}
            idleLabel="Create exam"
            onClick={() =>
              onSave({
                name,
                examType,
                academicYearId,
                termId: termId || undefined,
                examDate,
                classId,
                maxMarks: Number(maxMarks) || 100,
                subjectIds,
              })
            }
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Exam name">
          <input className={inputClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </SchoolField>
        <SchoolField label="Exam type">
          <select className={inputClass} value={examType} onChange={(event) => setExamType(event.target.value as (typeof SCHOOL_EXAM_TYPES)[number])}>
            {SCHOOL_EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {EXAM_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Academic year">
          <select className={inputClass} value={academicYearId} onChange={(event) => {
            setAcademicYearId(event.target.value);
            setTermId("");
          }}>
            <option value="">Select year</option>
            {workspace.catalog.years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Term">
          <select className={inputClass} value={termId} onChange={(event) => setTermId(event.target.value)}>
            <option value="">Optional</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Exam date">
          <input type="date" className={inputClass} value={examDate} onChange={(event) => setExamDate(event.target.value)} />
        </SchoolField>
        <SchoolField label="Level">
          <select className={inputClass} value={levelId} onChange={(event) => {
            setLevelId(event.target.value);
            setClassId("");
          }}>
            <option value="">Select level</option>
            {workspace.catalog.levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Class">
          <select className={inputClass} value={classId} onChange={(event) => selectClass(event.target.value)}>
            <option value="">Select class</option>
            {classOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Maximum marks">
          <input className={inputClass} value={maxMarks} onChange={(event) => setMaxMarks(event.target.value)} inputMode="decimal" />
        </SchoolField>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-slate-500">Subjects assigned to this class</p>
          {subjectsError ? <p className="text-[13px] text-[#c45b66]">{subjectsError}</p> : null}
          {classId && subjects.length === 0 && !subjectsError ? (
            <p className="text-[13.5px] text-slate-500">
              No subjects are assigned to this class.{" "}
              <Link href="/school/subjects" className="font-semibold text-navy underline-offset-2 hover:underline">
                Open Subjects
              </Link>
            </p>
          ) : (
            <div className="space-y-1.5">
              {subjects.map((subject) => (
                <label key={subject.id} className="flex items-center gap-2 text-[13.5px] text-navy">
                  <input
                    type="checkbox"
                    checked={subjectIds.includes(subject.id)}
                    onChange={(event) => {
                      setSubjectIds((current) =>
                        event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id),
                      );
                    }}
                  />
                  {subject.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </ContainedDrawer>
  );
}

function savedMarkMap(detail: SchoolExamDetail) {
  const next = new Map<string, number>();
  for (const mark of detail.marks) {
    next.set(`${mark.studentId}:${mark.subjectId}`, mark.marks);
  }
  return next;
}

function hasUnsavedExamMarks(detail: SchoolExamDetail, values: Record<string, string>) {
  const saved = savedMarkMap(detail);
  for (const student of detail.students) {
    for (const subject of detail.subjects) {
      const key = `${student.studentId}:${subject.id}`;
      const live = parseEnteredMark(values[key]);
      const stored = saved.get(key) ?? null;
      if (live !== stored) return true;
    }
  }
  return false;
}

function collectEnteredMarks(detail: SchoolExamDetail, values: Record<string, string>) {
  const marks: Array<{ studentId: string; subjectId: string; enrollmentId: string; marks: number }> = [];
  for (const student of detail.students) {
    for (const subject of detail.subjects) {
      const status = examMarkStatus(values[`${student.studentId}:${subject.id}`], detail.exam.maxMarks);
      if (status.invalid) {
        throw new Error(`Marks must be between 0 and ${detail.exam.maxMarks}.`);
      }
      if (status.value == null) continue;
      marks.push({
        studentId: student.studentId,
        subjectId: subject.id,
        enrollmentId: student.enrollmentId,
        marks: status.value,
      });
    }
  }
  return marks;
}

function ExamResultsPanel({
  detail,
  canEnter,
  canPublish,
  busy,
  onBack,
  onSave,
  onPublish,
}: {
  detail: SchoolExamDetail;
  canEnter: boolean;
  canPublish: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: (marks: Array<{ studentId: string; subjectId: string; enrollmentId: string; marks: number }>) => void;
  onPublish: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const mark of detail.marks) {
      next[`${mark.studentId}:${mark.subjectId}`] = String(mark.marks);
    }
    return next;
  });
  const [sort, setSort] = useState<ExamResultSort>("alpha");
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmExport, setConfirmExport] = useState(false);

  const previewRows = detail.students.map((student) => {
    const statuses = detail.subjects.map((subject) =>
      examMarkStatus(values[`${student.studentId}:${subject.id}`], detail.exam.maxMarks),
    );
    const subjectMarks = statuses.map((status) => status.value);
    const stats = studentExamAverage(subjectMarks);
    return {
      student,
      subjectMarks,
      invalid: statuses.map((status) => status.invalid),
      average: stats.average,
      complete: stats.complete && statuses.every((status) => !status.invalid),
    };
  });
  const previewPositions = rankExamAverages(
    previewRows.map((row) => ({ id: row.student.studentId, average: row.average, complete: row.complete })),
  );
  const orderedPreview = [...previewRows].sort((a, b) => {
    if (sort === "alpha") return a.student.name.localeCompare(b.student.name);
    const posA = previewPositions.get(a.student.studentId);
    const posB = previewPositions.get(b.student.studentId);
    if (posA != null && posB != null) return posA - posB || a.student.name.localeCompare(b.student.name);
    if (posA != null) return -1;
    if (posB != null) return 1;
    return a.student.name.localeCompare(b.student.name);
  });

  function confirmedPdfRows() {
    const saved = savedMarkMap(detail);
    const rows = detail.students.map((student) => {
      const subjectMarks = detail.subjects.map((subject) => saved.get(`${student.studentId}:${subject.id}`) ?? null);
      const stats = studentExamAverage(subjectMarks);
      return {
        studentName: student.name,
        marks: subjectMarks,
        average: stats.average,
        complete: stats.complete,
        studentId: student.studentId,
      };
    });
    const positions = rankExamAverages(rows.map((row) => ({ id: row.studentId, average: row.average, complete: row.complete })));
    const ordered = [...rows].sort((a, b) => {
      if (sort === "alpha") return a.studentName.localeCompare(b.studentName);
      const posA = positions.get(a.studentId);
      const posB = positions.get(b.studentId);
      if (posA != null && posB != null) return posA - posB || a.studentName.localeCompare(b.studentName);
      if (posA != null) return -1;
      if (posB != null) return 1;
      return a.studentName.localeCompare(b.studentName);
    });
    return ordered.map((row) => ({
      studentName: row.studentName,
      marks: row.marks,
      grade: examGradeFromAverage(row.average, detail.exam.maxMarks, detail.gradingBands ?? []),
      average: row.average,
      position: positions.get(row.studentId) ?? null,
    }));
  }

  function exportPdf() {
    setExportError(null);
    if (hasUnsavedExamMarks(detail, values)) {
      setConfirmExport(true);
      return;
    }
    downloadExamResultsPdf({
      detail,
      schoolName: detail.schoolName,
      rows: confirmedPdfRows(),
      sortLabel: sort === "alpha" ? "Sorted alphabetically (A-Z)" : "Sorted by position (highest average first)",
    });
  }

  return (
    <section className={cn(glassPanel, "p-0 overflow-hidden")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.04] px-5 py-4">
        <div className="min-w-0">
          <button type="button" className={backButtonClass} onClick={onBack} aria-label="Back to all exams">
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            All exams
          </button>
          <h2 className="mt-3 text-[18px] font-semibold tracking-[-0.03em] text-navy">{detail.exam.name}</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {detail.exam.levelName} · {detail.exam.className} · {detail.exam.examDate} · Max {detail.exam.maxMarks}
            {detail.exam.status !== "published" ? " · Draft" : ""}
          </p>
          {detail.gradingMessage ? <p className="mt-2 text-[13px] text-amber-700">{detail.gradingMessage}</p> : null}
          {exportError ? <p className="mt-2 text-[13px] text-[#c45b66]">{exportError}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEnter ? (
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Save marks"
              onClick={() => {
                try {
                  setExportError(null);
                  onSave(collectEnteredMarks(detail, values));
                } catch (error) {
                  setExportError(error instanceof Error ? error.message : "Check the marks entered.");
                }
              }}
            />
          ) : null}
          <button type="button" className={secondaryButton} disabled={busy} onClick={exportPdf}>
            Export Results
          </button>
          {canPublish && detail.exam.status !== "published" ? (
            <SchoolWorkflowButton className={secondaryButton} busy={busy} idleLabel="Publish" onClick={onPublish} />
          ) : null}
        </div>
      </div>
      {detail.students.length === 0 ? (
        <div className="px-5 py-10">
          <p className="text-[13.5px] text-slate-500">No students are enrolled in this class for the exam’s academic year.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.04] px-5 py-3">
            <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
              {(
                [
                  ["alpha", "Alphabetical (A–Z)"],
                  ["position", "Position (Highest average first)"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  className={cn(
                    "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                    sort === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={tableScrollClass}>
            <table className="min-w-full text-left">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">No.</th>
                  <th className="sticky left-0 z-[1] bg-[#eef3f8]/95 px-3 py-2.5">Student</th>
                  {detail.subjects.map((subject) => (
                    <th key={subject.id} className="px-2 py-2.5 text-right whitespace-nowrap">
                      {subject.name}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-right">Grade</th>
                  <th className="px-2 py-2.5 text-right">Avg.</th>
                  <th className="px-2 py-2.5 text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {orderedPreview.map((row, index) => (
                  <tr key={row.student.studentId} className="border-t border-black/[0.04] text-[13px] text-navy">
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{index + 1}</td>
                    <td className="sticky left-0 z-[1] bg-white/92 px-3 py-2 font-medium whitespace-nowrap">
                      {row.student.name}
                    </td>
                    {detail.subjects.map((subject, index) => {
                      const key = `${row.student.studentId}:${subject.id}`;
                      return (
                        <td key={subject.id} className="px-2 py-2 text-right">
                          {canEnter ? (
                            <input
                              className={cn(markInputClass, row.invalid[index] && "border-[#c45b66] focus:border-[#c45b66] focus:ring-[#c45b66]/15")}
                              value={values[key] ?? ""}
                              inputMode="decimal"
                              aria-invalid={row.invalid[index]}
                              aria-label={`${row.student.name} ${subject.name}`}
                              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                            />
                          ) : (
                            <span className="inline-block min-w-[3.4rem] tabular-nums">
                              {row.subjectMarks[index] == null ? "—" : String(row.subjectMarks[index])}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                      {examGradeFromAverage(row.average, detail.exam.maxMarks, detail.gradingBands ?? [])}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{formatExamAverage(row.average)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                      {formatExamPosition(previewPositions.get(row.student.studentId) ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <SchoolConfirmDialog
        open={confirmExport}
        title="Save marks before exporting?"
        message="There are unsaved mark edits. Export uses confirmed saved results only. Save first, or discard the export request and keep editing."
        confirmLabel="OK"
        busy={busy}
        onCancel={() => setConfirmExport(false)}
        onConfirm={() => setConfirmExport(false)}
      />
    </section>
  );
}
