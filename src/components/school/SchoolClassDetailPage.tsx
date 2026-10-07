"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import {
  archiveSchoolStreamAction,
  getSchoolClassDetailAction,
  saveSchoolStreamAction,
  type SchoolClassRow,
  type SchoolLevelRow,
  type SchoolStreamRow,
} from "@/actions/school/classes";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolConfirmDialog, SchoolField, SchoolGlassModal, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import type { SchoolListFilter, SchoolPageMeta } from "@/lib/school/pagination";

function streamCountLabel(count: number) {
  return `${count} ${count === 1 ? "stream" : "streams"}`;
}

export function SchoolClassDetailPage({
  level,
  classRow: initialClass,
  streams: initialStreams,
  page: initialPage,
  canManage,
  error,
}: {
  level: SchoolLevelRow | null;
  classRow: SchoolClassRow | null;
  streams: SchoolStreamRow[];
  page: SchoolPageMeta;
  canManage: boolean;
  error: string | null;
}) {
  const [classRow, setClassRow] = useState(initialClass);
  const [streams, setStreams] = useState(initialStreams);
  const [page, setPage] = useState(initialPage);
  const [filter, setFilter] = useState<SchoolListFilter>("active");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const editing = streams.find((row) => row.id === editId) ?? null;
  const nextOrder = Math.max(0, ...streams.map((row) => row.sortOrder)) + 1;

  function load(nextPage: number, nextFilter: SchoolListFilter) {
    if (!level || !classRow) return;
    void getSchoolClassDetailAction(level.id, classRow.id, { page: nextPage, status: nextFilter }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setClassRow(result.classRow);
      setStreams(result.streams);
      setPage(result.page);
      setFilter(nextFilter);
      replaceSchoolPageParam(result.page.page);
    });
  }

  if (!level || !classRow) {
    return (
      <div className="min-w-0 max-w-full space-y-4 pb-10">
        <Link href="/school/classes" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition duration-200 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Classes
        </Link>
        <p className="text-[13px] text-[#c45b66]">{error ?? "Class was not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link
        href={`/school/classes/${level.id}`}
        className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition duration-200 hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        {level.name}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <SchoolIconWell icon={Layers} />
          <div>
            <p className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-slate-400">{level.name}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.045em] text-navy">{classRow.name}</h1>
            <p className="mt-1 text-[13.5px] text-slate-500">{streamCountLabel(classRow.streamCount)}</p>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setEditId(null);
              setConfirmed(false);
              setSaveError(null);
              setModal("create");
            }}
          >
            + Add Stream
          </button>
        ) : null}
      </header>

      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <section className={glassPanel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Streams</h2>
          <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1">
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
                onClick={() => load(1, id)}
                className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200 ${
                  filter === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {streams.length === 0 ? (
          <div className="py-6">
            <p className="text-[13.5px] text-slate-500">
              {filter === "archived" ? "No archived streams for this class." : "No streams configured for this class yet."}
            </p>
          </div>
        ) : (
          <div className={tableScrollClass}>
            <table className="min-w-full text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Stream</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Class Teacher</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {streams.map((row) => (
                  <tr key={row.id} className="border-t border-black/[0.04]">
                    <td className="px-4 py-2.5 font-medium text-navy">{row.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.code}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.classTeacherName ?? "Not assigned"}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canManage ? (
                        <CompactActionsMenu
                          ariaLabel={`${row.name} actions`}
                          items={[
                            {
                              label: "Edit",
                              onSelect: () => {
                                setEditId(row.id);
                                setConfirmed(false);
                                setSaveError(null);
                                setModal("edit");
                              },
                            },
                            ...(row.isActive ? [{ label: "Archive", onSelect: () => setArchiveId(row.id) }] : []),
                          ]}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4">
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next, filter)} />
        </div>
      </section>

      {modal && classRow ? (
        <StreamForm
          key={editId ?? "new"}
          title={modal === "edit" ? "Edit stream" : "Add stream"}
          parentClassName={classRow.name}
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
            if (lock.current || !classRow) return;
            lock.current = true;
            setBusy(true);
            setConfirmed(false);
            setSaveError(null);
            void saveSchoolStreamAction({
              id: editId ?? undefined,
              classId: classRow.id,
              ...values,
            }).then((result) => {
              lock.current = false;
              setBusy(false);
              if (!result.ok) {
                setSaveError(result.error);
                return;
              }
              setConfirmed(true);
              const exists = streams.some((row) => row.id === result.stream.id);
              if (exists) {
                setStreams((current) => current.map((row) => (row.id === result.stream.id ? result.stream : row)));
              } else {
                load(1, filter);
              }
              setModal(null);
              setEditId(null);
              setConfirmed(false);
            });
          }}
        />
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(archiveId)}
        title={`Archive “${streams.find((row) => row.id === archiveId)?.name ?? "this stream"}”?`}
        message="This stream will no longer appear in the active school structure."
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
          void archiveSchoolStreamAction(archiveId).then((result) => {
            lock.current = false;
            setBusy(false);
            if (!result.ok) {
              setSaveError(result.error);
              setArchiveId(null);
              return;
            }
            const id = archiveId;
            setStreams((current) => current.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
            setArchiveId(null);
          });
        }}
      />
    </div>
  );
}

function StreamForm({
  title,
  parentClassName,
  initial,
  nextOrder,
  busy,
  confirmed,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  parentClassName: string;
  initial: SchoolStreamRow | null;
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
      subtitle={`Class: ${parentClassName}`}
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
      <SchoolField label="Stream name">
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
