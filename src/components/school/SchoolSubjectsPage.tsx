"use client";

import { useRef, useState } from "react";
import {
  archiveSchoolClassSubjectAction,
  assignSchoolClassSubjectsAction,
  getSchoolSubjectsWorkspaceAction,
  updateSchoolSubjectAction,
  type SchoolClassCard,
  type SchoolClassSubjectRow,
  type SchoolLevelCard,
  type SchoolSubjectCatalogItem,
  type SchoolSubjectsWorkspace,
} from "@/actions/school/subjects";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  filterClass,
  glassCard,
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { SchoolConfirmDialog, SchoolField, SchoolGlassModal, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { schoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import { BookOpen, ChevronRight, GraduationCap, Layers } from "lucide-react";

type View = "all" | "levels" | "classes" | "class";
type DrawerMode = { kind: "add"; classId?: string } | { kind: "assign"; subjectId: string; name: string };

const emptyWorkspace = (): SchoolSubjectsWorkspace => ({
  rows: [],
  page: schoolPageMeta(1, 0),
  query: "",
  classId: "",
  levelId: "",
  catalog: [],
  levels: [],
  classes: [],
  capabilities: { canView: true, canManage: false },
});

export function SchoolSubjectsPage({
  workspace: initial,
  error: initialError,
  pending = false,
}: {
  workspace: SchoolSubjectsWorkspace | null;
  error: string | null;
  pending?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initial ?? emptyWorkspace());
  const [error, setError] = useState(initialError);
  const [view, setView] = useState<View>("all");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState(workspace.query);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [edit, setEdit] = useState<SchoolClassSubjectRow | null>(null);
  const [archive, setArchive] = useState<SchoolClassSubjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const lock = useRef(false);
  const canManage = workspace.capabilities.canManage;
  const selectedLevel = workspace.levels.find((row) => row.id === levelId) ?? null;
  const selectedClass = workspace.classes.find((row) => row.id === classId) ?? null;
  const classRows = workspace.rows;

  function load(next: { page?: number; pageSize?: number; q?: string; classId?: string; levelId?: string }) {
    const token = ++seq.current;
    const q = next.q ?? query;
    const nextClassId = next.classId ?? "";
    const nextLevelId = next.levelId ?? "";
    void getSchoolSubjectsWorkspaceAction({
      page: next.page ?? 1,
      pageSize: next.pageSize ?? workspace.page.pageSize,
      q,
      classId: nextClassId,
      levelId: nextClassId ? "" : nextLevelId,
    }).then((result) => {
      if (token !== seq.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setWorkspace(result.workspace);
      replaceSchoolPageParam(result.workspace.page.page, result.workspace.page.pageSize, { q });
    });
  }

  function refresh() {
    load({
      page: workspace.page.page,
      q: query,
      classId: view === "class" ? classId : "",
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Subjects</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Assign canonical subjects to real classes. Streams are optional.</p>
        </div>
        {canManage ? (
          <button type="button" className={primaryButton} onClick={() => setDrawer({ kind: "add", classId: view === "class" ? classId : undefined })}>
            + Add Subjects
          </button>
        ) : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
          {(
            [
              ["all", "All Subjects"],
              ["levels", "By Level"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id);
                setClassId("");
                if (id === "all") setLevelId("");
                load({ page: 1, classId: "", levelId: "" });
              }}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                view === id || (id === "levels" && (view === "classes" || view === "class"))
                  ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]"
                  : "text-slate-500 hover:text-navy",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {view !== "all" ? (
          <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[12.5px] text-slate-500">
            <button type="button" className="font-semibold text-navy" onClick={() => setView("levels")}>
              Levels
            </button>
            {selectedLevel ? (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <button
                  type="button"
                  className={cn("truncate", view === "classes" ? "font-semibold text-navy" : "hover:text-navy")}
                  onClick={() => {
                    setView("classes");
                    setClassId("");
                    load({ page: 1, classId: "", levelId });
                  }}
                >
                  {selectedLevel.name}
                </button>
              </>
            ) : null}
            {selectedClass ? (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="truncate font-semibold text-navy">{selectedClass.name}</span>
              </>
            ) : null}
          </nav>
        ) : null}
      </div>

      {view === "all" ? (
        <AllSubjectsTable
          rows={classRows}
          page={workspace.page}
          query={query}
          pending={pending}
          canManage={canManage}
          onQuery={(value) => {
            setQuery(value);
            load({ page: 1, q: value, classId: "", levelId: "" });
          }}
          onPage={(page) => load({ page, classId: "", levelId: "" })}
          onPageSize={(pageSize) => load({ page: 1, pageSize, classId: "", levelId: "" })}
          onAssign={(row) => setDrawer({ kind: "assign", subjectId: row.subjectId, name: row.name })}
          onEdit={setEdit}
          onArchive={setArchive}
        />
      ) : null}

      {view === "levels" ? (
        <LevelCards
          levels={workspace.levels}
          pending={pending}
          onSelect={(id) => {
            setLevelId(id);
            setView("classes");
            setClassId("");
          }}
        />
      ) : null}

      {view === "classes" ? (
        <ClassCards
          classes={workspace.classes.filter((row) => row.levelId === levelId)}
          pending={pending}
          onSelect={(row) => {
            setClassId(row.id);
            setView("class");
            load({ page: 1, classId: row.id, levelId: "" });
          }}
        />
      ) : null}

      {view === "class" ? (
        <AllSubjectsTable
          rows={classRows}
          page={workspace.page}
          query={query}
          pending={pending}
          canManage={canManage}
          emptyLabel={selectedClass ? `No subjects assigned to ${selectedClass.name} yet.` : "No subjects assigned to this class yet."}
          onQuery={(value) => {
            setQuery(value);
            load({ page: 1, q: value, classId });
          }}
          onPage={(page) => load({ page, classId })}
          onPageSize={(pageSize) => load({ page: 1, pageSize, classId })}
          onAssign={(row) => setDrawer({ kind: "assign", subjectId: row.subjectId, name: row.name })}
          onEdit={setEdit}
          onArchive={setArchive}
        />
      ) : null}

      {drawer ? (
        <AddSubjectsDrawer
          key={`${drawer.kind}-${drawer.kind === "add" ? drawer.classId ?? "new" : drawer.subjectId}`}
          mode={drawer}
          levels={workspace.levels}
          classes={workspace.classes}
          catalog={workspace.catalog}
          initialClassId={drawer.kind === "add" ? drawer.classId ?? classId : ""}
          initialLevelId={levelId}
          busy={busy}
          error={error}
          onClose={() => {
            if (busy) return;
            setDrawer(null);
          }}
          onSave={(payload) => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            void assignSchoolClassSubjectsAction(payload).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDrawer(null);
              refresh();
            });
          }}
        />
      ) : null}

      {edit ? (
        <SchoolGlassModal
          title="Edit subject"
          subtitle="This name is shared everywhere this subject is assigned."
          onClose={() => {
            if (busy) return;
            setEdit(null);
          }}
          footer={
            <>
              <button type="button" className={secondaryButton} disabled={busy} onClick={() => setEdit(null)}>
                Cancel
              </button>
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Save"
                onClick={() => {
                  const name = (document.getElementById("school-subject-name") as HTMLInputElement | null)?.value ?? edit.name;
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError(null);
                  void updateSchoolSubjectAction({ subjectId: edit.subjectId, name }).then((result) => {
                    lock.current = false;
                    setBusy(false);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEdit(null);
                    refresh();
                  });
                }}
              />
            </>
          }
        >
          <SchoolField label="Subject">
            <input id="school-subject-name" className={inputClass} defaultValue={edit.name} maxLength={80} />
          </SchoolField>
        </SchoolGlassModal>
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(archive)}
        title={`Archive “${archive?.name ?? "this subject"}” from ${archive?.className ?? "this class"}?`}
        message="Historical exams and results stay linked to this subject. New exams for this class will no longer offer it."
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setArchive(null);
        }}
        onConfirm={() => {
          if (!archive || lock.current) return;
          lock.current = true;
          setBusy(true);
          void archiveSchoolClassSubjectAction(archive.assignmentId).then((result) => {
            lock.current = false;
            setBusy(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setArchive(null);
            refresh();
          });
        }}
      />
    </div>
  );
}

function AllSubjectsTable({
  rows,
  page,
  query,
  pending,
  canManage,
  emptyLabel,
  onQuery,
  onPage,
  onPageSize,
  onAssign,
  onEdit,
  onArchive,
}: {
  rows: SchoolClassSubjectRow[];
  page: SchoolSubjectsWorkspace["page"];
  query: string;
  pending?: boolean;
  canManage: boolean;
  emptyLabel?: string;
  onQuery: (value: string) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onAssign: (row: SchoolClassSubjectRow) => void;
  onEdit: (row: SchoolClassSubjectRow) => void;
  onArchive: (row: SchoolClassSubjectRow) => void;
}) {
  const debounce = useRef<number | null>(null);
  const [local, setLocal] = useState(query);

  return (
    <section className={cn(glassPanel, "p-0 overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.04] px-4 py-3">
        <input
          className={cn(filterClass, "max-w-xs")}
          placeholder="Search subjects"
          value={local}
          onChange={(event) => {
            const value = event.target.value;
            setLocal(value);
            if (debounce.current) window.clearTimeout(debounce.current);
            debounce.current = window.setTimeout(() => onQuery(value), 220);
          }}
        />
      </div>
      {rows.length === 0 && !pending ? (
        <div className="px-5 py-10">
          <SchoolIconWell icon={BookOpen} />
          <h2 className="mt-3 text-[18px] font-semibold tracking-[-0.04em] text-navy">No subjects yet</h2>
          <p className="mt-1 text-[13.5px] text-slate-500">{emptyLabel ?? "No subjects have been assigned to classes."}</p>
        </div>
      ) : (
        <div className={tableScrollClass}>
          <table className="min-w-full text-left">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Students enrolled</th>
                <th className="px-4 py-3">Assigned teacher</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.assignmentId} className="border-t border-black/[0.04] text-[13.5px] text-navy">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-slate-500">{row.levelName}</td>
                  <td className="px-4 py-3 text-slate-500">{row.className}</td>
                  <td className="px-4 py-3 text-slate-500">{row.studentCount}</td>
                  <td className="px-4 py-3 text-slate-500">{row.teacherName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{row.isActive ? "Active" : "Archived"}</td>
                  <td className="px-4 py-3 text-right">
                    <CompactActionsMenu
                      ariaLabel={`${row.name} actions`}
                      items={[
                        { label: "View details", onSelect: () => onEdit(row) },
                        ...(canManage
                          ? [
                              { label: "Edit subject", onSelect: () => onEdit(row) },
                              { label: "Add to another class", onSelect: () => onAssign(row) },
                              ...(row.isActive ? [{ label: "Archive assignment", onSelect: () => onArchive(row) }] : []),
                            ]
                          : []),
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
        <SchoolPagination page={page.page} total={page.total} pageSize={page.pageSize} onPage={onPage} onPageSize={onPageSize} />
      </div>
    </section>
  );
}

function LevelCards({ levels, pending, onSelect }: { levels: SchoolLevelCard[]; pending?: boolean; onSelect: (id: string) => void }) {
  if (!levels.length && !pending) {
    return (
      <section className={cn(glassPanel, "py-10")}>
        <SchoolIconWell icon={GraduationCap} />
        <h2 className="mt-3 text-[18px] font-semibold text-navy">No levels configured</h2>
        <p className="mt-1 text-[13.5px] text-slate-500">Add levels and classes first, then assign subjects.</p>
      </section>
    );
  }
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {levels.map((level) => (
        <button
          key={level.id}
          type="button"
          onClick={() => onSelect(level.id)}
          className={cn(
            glassCard,
            "px-5 py-5 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
          )}
        >
          <SchoolIconWell icon={GraduationCap} />
          <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em] text-navy">{level.name}</p>
          <p className="mt-1 text-[13px] text-slate-400">
            {level.classCount} {level.classCount === 1 ? "class" : "classes"} · {level.subjectCount}{" "}
            {level.subjectCount === 1 ? "subject" : "subjects"}
          </p>
        </button>
      ))}
    </section>
  );
}

function ClassCards({
  classes,
  pending,
  onSelect,
}: {
  classes: SchoolClassCard[];
  pending?: boolean;
  onSelect: (row: SchoolClassCard) => void;
}) {
  if (!classes.length && !pending) {
    return (
      <section className={cn(glassPanel, "py-10")}>
        <SchoolIconWell icon={Layers} />
        <h2 className="mt-3 text-[18px] font-semibold text-navy">No classes in this level</h2>
      </section>
    );
  }
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {classes.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect(row)}
          className={cn(
            glassCard,
            "px-5 py-5 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
          )}
        >
          <SchoolIconWell icon={Layers} />
          <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em] text-navy">{row.name}</p>
          <p className="mt-1 text-[13px] text-slate-400">{row.levelName}</p>
          <p className="mt-1 text-[13px] text-slate-400">
            {row.subjectCount} {row.subjectCount === 1 ? "subject" : "subjects"}
            {row.streamCount > 0 ? ` · ${row.streamCount} ${row.streamCount === 1 ? "stream" : "streams"}` : ""}
          </p>
        </button>
      ))}
    </section>
  );
}

function AddSubjectsDrawer({
  mode,
  levels,
  classes,
  catalog,
  initialClassId,
  initialLevelId,
  busy,
  error,
  onClose,
  onSave,
}: {
  mode: DrawerMode;
  levels: SchoolLevelCard[];
  classes: SchoolClassCard[];
  catalog: SchoolSubjectCatalogItem[];
  initialClassId: string;
  initialLevelId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: { classId: string; items: Array<{ id?: string; name?: string }> }) => void;
}) {
  const presetClass = classes.find((row) => row.id === initialClassId);
  const [levelId, setLevelId] = useState(presetClass?.levelId || initialLevelId);
  const [classId, setClassId] = useState(initialClassId);
  const [draft, setDraft] = useState("");
  const [existingId, setExistingId] = useState("");
  const [items, setItems] = useState<Array<{ id?: string; name: string }>>(
    mode.kind === "assign" ? [{ id: mode.subjectId, name: mode.name }] : [],
  );
  const classOptions = classes.filter((row) => !levelId || row.levelId === levelId);

  function addDraft() {
    const name = draft.trim();
    if (!name) return;
    if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    const match = catalog.find((item) => item.name.toLowerCase() === name.toLowerCase());
    setItems((current) => [...current, match ? { id: match.id, name: match.name } : { name }]);
    setDraft("");
  }

  function addExisting() {
    const match = catalog.find((item) => item.id === existingId);
    if (!match) return;
    if (items.some((item) => item.id === match.id || item.name.toLowerCase() === match.name.toLowerCase())) return;
    setItems((current) => [...current, { id: match.id, name: match.name }]);
    setExistingId("");
  }

  return (
    <ContainedDrawer
      title={mode.kind === "assign" ? "Add subject to a class" : "Add Subjects"}
      subtitle="Choose a class, then add one or more subjects in a single save."
      dirty={items.length > 0 || Boolean(draft)}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            disabled={!classId || items.length === 0}
            idleLabel="Save subjects"
            onClick={() => onSave({ classId, items })}
          />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Level">
          <select className={inputClass} value={levelId} onChange={(event) => {
            setLevelId(event.target.value);
            setClassId("");
          }}>
            <option value="">Select level</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Class">
          <select className={inputClass} value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Select class</option>
            {classOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </SchoolField>
        {mode.kind === "add" ? (
          <>
            <SchoolField label="Reuse an existing subject">
              <div className="flex gap-2">
                <select className={inputClass} value={existingId} onChange={(event) => setExistingId(event.target.value)}>
                  <option value="">Select subject</option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button type="button" className={secondaryButton} onClick={addExisting} disabled={!existingId}>
                  Add
                </button>
              </div>
            </SchoolField>
            <SchoolField label="Or create a new subject">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={draft}
                  maxLength={80}
                  placeholder="Mathematics"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDraft();
                    }
                  }}
                />
                <button type="button" className={secondaryButton} onClick={addDraft} disabled={!draft.trim()}>
                  Add
                </button>
              </div>
            </SchoolField>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={`${item.id ?? item.name}`} className="inline-flex items-center gap-1 rounded-full bg-[#eef3f8] px-3 py-1 text-[12.5px] font-medium text-navy">
              {item.name}
              {mode.kind === "add" ? (
                <button type="button" className="text-slate-400 hover:text-navy" onClick={() => setItems((current) => current.filter((row) => row !== item))}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </div>
    </ContainedDrawer>
  );
}
