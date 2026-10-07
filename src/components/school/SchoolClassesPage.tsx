"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, GraduationCap } from "lucide-react";
import {
  archiveSchoolLevelAction,
  saveSchoolLevelAction,
  type SchoolLevelRow,
} from "@/actions/school/classes";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { glassCard, glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { SchoolConfirmDialog, SchoolField, SchoolGlassModal, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";

type Filter = "active" | "archived" | "all";

function classCountLabel(count: number) {
  return `${count} ${count === 1 ? "class" : "classes"}`;
}

export function SchoolClassesPage({
  levels: initialLevels,
  canManage,
  error,
}: {
  levels: SchoolLevelRow[];
  canManage: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [levels, setLevels] = useState(initialLevels);
  const [filter, setFilter] = useState<Filter>("active");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const editing = levels.find((row) => row.id === editId) ?? null;
  const visible = useMemo(
    () =>
      levels
        .filter((row) => (filter === "active" ? row.isActive : filter === "archived" ? !row.isActive : true))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [filter, levels],
  );
  const nextOrder = Math.max(0, ...levels.map((row) => row.sortOrder)) + 1;

  function openCreate() {
    setEditId(null);
    setConfirmed(false);
    setSaveError(null);
    setModal("create");
  }

  function openEdit(id: string) {
    setEditId(id);
    setConfirmed(false);
    setSaveError(null);
    setModal("edit");
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Classes</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Manage school levels, classes, and streams.</p>
        </div>
        {canManage ? (
          <button type="button" className={primaryButton} onClick={openCreate}>
            + Add Level
          </button>
        ) : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
        {(
          [
            ["active", "Active"],
            ["archived", "Archived"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
              filter === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!error && visible.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={GraduationCap} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">Academic Structure</h2>
          <p className="text-[13.5px] text-slate-500">
            {filter === "archived" ? "No archived school levels." : "No school levels configured yet."}
          </p>
          {canManage && filter !== "archived" ? (
            <button type="button" className={primaryButton} onClick={openCreate}>
              + Add Level
            </button>
          ) : null}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((level) => (
            <article
              key={level.id}
              className={cn(
                glassCard,
                "relative px-5 py-5 transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
              )}
            >
              <Link href={`/school/classes/${level.id}`} className="block min-w-0 pr-10">
                <SchoolIconWell icon={GraduationCap} />
                <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em] text-navy">{level.name}</p>
                <p className="mt-1 text-[13px] text-slate-400">{classCountLabel(level.classCount)}</p>
              </Link>
              <ChevronRight className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              {canManage ? (
                <div className="absolute right-3 top-3" onClick={(event) => event.stopPropagation()}>
                  <CompactActionsMenu
                    ariaLabel={`${level.name} actions`}
                    items={[
                      { label: "View", onSelect: () => router.push(`/school/classes/${level.id}`) },
                      { label: "Edit", onSelect: () => openEdit(level.id) },
                      ...(level.isActive ? [{ label: "Archive", onSelect: () => setArchiveId(level.id) }] : []),
                    ]}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      {modal ? (
        <LevelForm
          key={editId ?? "new"}
          title={modal === "edit" ? "Edit level" : "Add level"}
          initial={editing}
          nextOrder={nextOrder}
          busy={busy}
          confirmed={confirmed}
          error={saveError}
          onClose={() => {
            if (busy) return;
            setModal(null);
            setEditId(null);
          }}
          onSubmit={(values) => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setConfirmed(false);
            setSaveError(null);
            void saveSchoolLevelAction({
              id: editId ?? undefined,
              ...values,
            }).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setSaveError(result.error);
                return;
              }
              setConfirmed(true);
              setLevels((current) => {
                const next = current.some((row) => row.id === result.level.id)
                  ? current.map((row) => (row.id === result.level.id ? { ...row, ...result.level, classCount: row.classCount } : row))
                  : [...current, { ...result.level, classCount: 0 }];
                return next;
              });
              window.setTimeout(() => {
                setModal(null);
                setEditId(null);
                setConfirmed(false);
              }, 180);
            });
          }}
        />
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(archiveId)}
        title={`Archive “${levels.find((row) => row.id === archiveId)?.name ?? "this level"}”?`}
        message="This level will no longer appear in the active class structure."
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setArchiveId(null);
        }}
        onConfirm={() => {
          if (!archiveId || lock.current) return;
          lock.current = true;
          setBusy(true);
          void archiveSchoolLevelAction(archiveId).then((result) => {
            lock.current = false;
            setBusy(false);
            if (!result.ok) {
              setSaveError(result.error);
              setArchiveId(null);
              return;
            }
            const id = archiveId;
            setLevels((current) => current.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
            setArchiveId(null);
          });
        }}
      />
    </div>
  );
}

function LevelForm({
  title,
  initial,
  nextOrder,
  busy,
  confirmed,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: SchoolLevelRow | null;
  nextOrder: number;
  busy: boolean;
  confirmed: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; code: string; sortOrder: number; isActive: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? nextOrder));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  return (
    <SchoolGlassModal
      title={title}
      footer={
        <>
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            confirmed={confirmed}
            idleLabel="Save"
            onClick={() => onSubmit({ name, code, sortOrder: Number(sortOrder), isActive })}
          />
        </>
      }
      onClose={onClose}
    >
      <SchoolField label="Level name">
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      </SchoolField>
      <SchoolField label="Code">
        <input className={inputClass} value={code} onChange={(event) => setCode(event.target.value)} />
      </SchoolField>
      <SchoolField label="Order">
        <input className={inputClass} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
      </SchoolField>
      <label className="flex items-center gap-3 text-[14px] text-navy">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        Active
      </label>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
    </SchoolGlassModal>
  );
}
