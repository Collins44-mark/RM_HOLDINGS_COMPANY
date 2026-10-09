"use client";

import { useRef, useState } from "react";
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
import { SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { schoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import { ClipboardList } from "lucide-react";

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
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const lock = useRef(false);
  const debounce = useRef<number | null>(null);

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
          key={`${detail.exam.id}-${detail.exam.status}-${detail.marks.length}`}
          detail={detail}
          canEnter={workspace.capabilities.canEnter}
          canPublish={workspace.capabilities.canPublish}
          busy={busy}
          onBack={() => setDetail(null)}
          onReload={() => {
            void getSchoolExamDetailAction(detail.exam.id).then((result) => {
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDetail(result.detail);
            });
          }}
          onSave={(marks) => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            void saveSchoolExamResultsAction({ examId: detail.exam.id, marks }).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              void getSchoolExamDetailAction(detail.exam.id).then((next) => {
                if (next.ok) setDetail(next.detail);
              });
            });
          }}
          onPublish={() => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            void publishSchoolExamAction(detail.exam.id).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              void getSchoolExamDetailAction(detail.exam.id).then((next) => {
                if (next.ok) setDetail(next.detail);
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
          ) : (
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
                          items={[{ label: "Open results", onSelect: () => openDetail(exam, setDetail, setError) }]}
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

function openDetail(
  exam: SchoolExamRow,
  setDetail: (detail: SchoolExamDetail | null) => void,
  setError: (error: string | null) => void,
) {
  void getSchoolExamDetailAction(exam.id).then((result) => {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDetail(result.detail);
  });
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

function ExamResultsPanel({
  detail,
  canEnter,
  canPublish,
  busy,
  onBack,
  onReload,
  onSave,
  onPublish,
}: {
  detail: SchoolExamDetail;
  canEnter: boolean;
  canPublish: boolean;
  busy: boolean;
  onBack: () => void;
  onReload: () => void;
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

  function gradeFor(studentId: string, subjectId: string) {
    return detail.marks.find((row) => row.studentId === studentId && row.subjectId === subjectId)?.grade ?? "—";
  }

  return (
    <section className={cn(glassPanel, "p-0 overflow-hidden")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.04] px-5 py-4">
        <div>
          <button type="button" className="text-[12.5px] font-semibold text-slate-500 hover:text-navy" onClick={onBack}>
            ← All exams
          </button>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">{detail.exam.name}</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {detail.exam.levelName} · {detail.exam.className} · {detail.exam.examDate} · Max {detail.exam.maxMarks}
          </p>
          {detail.gradingMessage ? <p className="mt-2 text-[13px] text-amber-700">{detail.gradingMessage}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEnter ? (
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Save marks"
              onClick={() => {
                const marks = [];
                for (const student of detail.students) {
                  for (const subject of detail.subjects) {
                    const raw = values[`${student.studentId}:${subject.id}`];
                    if (raw === undefined || raw === "") continue;
                    const amount = Number(raw);
                    if (!Number.isFinite(amount)) continue;
                    marks.push({
                      studentId: student.studentId,
                      subjectId: subject.id,
                      enrollmentId: student.enrollmentId,
                      marks: amount,
                    });
                  }
                }
                onSave(marks);
              }}
            />
          ) : null}
          {canPublish && detail.exam.status !== "published" ? (
            <SchoolWorkflowButton className={secondaryButton} busy={busy} idleLabel="Publish" onClick={onPublish} />
          ) : null}
          <button type="button" className={secondaryButton} onClick={onReload}>
            Refresh
          </button>
        </div>
      </div>
      {detail.students.length === 0 ? (
        <div className="px-5 py-10">
          <p className="text-[13.5px] text-slate-500">No students are enrolled in this class for the exam’s academic year.</p>
        </div>
      ) : (
        <div className={tableScrollClass}>
          <table className="min-w-full text-left">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3">Admission</th>
                <th className="px-4 py-3">Student</th>
                {detail.subjects.map((subject) => (
                  <th key={subject.id} className="px-4 py-3">
                    {subject.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.students.map((student) => (
                <tr key={student.studentId} className="border-t border-black/[0.04] text-[13.5px] text-navy">
                  <td className="px-4 py-3 text-slate-500">{student.admissionNumber || "—"}</td>
                  <td className="px-4 py-3 font-medium">{student.name}</td>
                  {detail.subjects.map((subject) => {
                    const key = `${student.studentId}:${subject.id}`;
                    return (
                      <td key={subject.id} className="px-4 py-3">
                        {canEnter ? (
                          <input
                            className={cn(inputClass, "h-10 w-24")}
                            value={values[key] ?? ""}
                            inputMode="decimal"
                            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                          />
                        ) : (
                          <span>
                            {values[key] || "—"}
                            {detail.gradingConfigured ? ` · ${gradeFor(student.studentId, subject.id)}` : ""}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
