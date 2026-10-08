"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  cancelSchoolAdmissionAction,
  listSchoolAdmissionsAction,
  type AdmissionListRow,
  type AdmissionStatus,
} from "@/actions/school/admissions";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolConfirmDialog, SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import type { SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import { consumeAdmissionFlash } from "@/lib/school/admission-flash";

const STATUS_FILTERS: Array<{ id: "all" | AdmissionStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export function SchoolAdmissionsPage({
  admissions: initialRows,
  page: initialPage,
  canManage,
  query,
  status,
  error,
}: {
  admissions: AdmissionListRow[];
  page: SchoolPageMeta;
  canManage: boolean;
  query: string;
  status: string;
  error: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [filter, setFilter] = useState(status || "all");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const flash = consumeAdmissionFlash();
    if (!flash) return;
    const activeFilter = status || "all";
    if (activeFilter !== "all" && activeFilter !== flash.status) return;
    queueMicrotask(() => {
      setRows((current) => {
        if (current.some((row) => row.id === flash.id)) return current;
        setPage((meta) => ({ ...meta, total: meta.total + 1 }));
        return [flash, ...current];
      });
    });
  }, [status]);

  function load(nextPage: number, nextQ: string, nextStatus: string) {
    void listSchoolAdmissionsAction({
      page: nextPage,
      q: nextQ,
      status: nextStatus === "all" ? "" : nextStatus,
    }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setRows(result.admissions);
      setPage(result.page);
      setFilter(nextStatus);
      replaceSchoolPageParam(result.page.page);
    });
  }

  function runCancel() {
    if (!cancelId || lock.current) return;
    lock.current = true;
    setBusy(true);
    void cancelSchoolAdmissionAction(cancelId).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setCancelId(null);
      load(page.page, q, filter);
    });
  }

  const completing = rows.find((row) => row.id === completeId) ?? null;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Admissions</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Register and manage student admissions.</p>
        </div>
        {canManage ? (
          <Link href="/school/admissions/new" className={primaryButton}>
            + New Admission
          </Link>
        ) : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => load(1, q, item.id)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                filter === item.id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="min-w-[200px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            load(1, q, filter);
          }}
        >
          <input
            className={inputClass}
            value={q}
            placeholder="Search admission no., student no., or name"
            onChange={(event) => setQ(event.target.value)}
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={UserPlus} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No admissions yet</h2>
          <p className="text-[13.5px] text-slate-500">Create your first student admission to get started.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Admission No.</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold">Admission Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/admissions/${row.id}`} className="font-semibold hover:underline">
                        {row.admissionNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.studentName}</td>
                    <td className="px-4 py-3">{row.levelName || "—"}</td>
                    <td className="px-4 py-3">{row.className || "—"}</td>
                    <td className="px-4 py-3">{row.streamName || "—"}</td>
                    <td className="px-4 py-3">{row.admissionDate || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.status === "draft" ? "Draft" : row.status === "completed" ? "Completed" : "Cancelled"} />
                    </td>
                    <td className="px-4 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.admissionNumber} actions`}
                        items={[
                          { label: "View", onSelect: () => router.push(`/school/admissions/${row.id}`) },
                          ...(canManage && row.status === "draft"
                            ? [
                                { label: "Edit", onSelect: () => router.push(`/school/admissions/${row.id}/edit`) },
                                { label: "Complete", onSelect: () => setCompleteId(row.id) },
                                { label: "Cancel", onSelect: () => setCancelId(row.id) },
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
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next, q, filter)} />
        </section>
      )}

      <SchoolConfirmDialog
        open={Boolean(cancelId)}
        title="Cancel admission"
        message="This draft will be cancelled. It will not create a student."
        confirmLabel="Cancel admission"
        busy={busy}
        onCancel={() => setCancelId(null)}
        onConfirm={runCancel}
      />
      <SchoolConfirmDialog
        open={Boolean(completeId)}
        title="Complete admission"
        message="Open this admission to review student, placement, and guardian details before completing."
        confirmLabel="Open admission"
        onCancel={() => setCompleteId(null)}
        onConfirm={() => {
          if (completing) router.push(`/school/admissions/${completing.id}/edit`);
          setCompleteId(null);
        }}
      />
    </div>
  );
}
