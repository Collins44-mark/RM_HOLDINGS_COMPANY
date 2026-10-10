"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolConfirmDialog, SchoolField, SchoolGlassModal, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { parseSchoolPage, parseSchoolPageSize, type SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import {
  consumeAdmissionFlash,
  peekAdmissionsListSnapshot,
  writeAdmissionView,
  writeAdmissionsListSnapshot,
} from "@/lib/school/admission-flash";
import { prefetchSchoolAdmission } from "@/lib/school/admission-prefetch";

const STATUS_FILTERS: Array<{ id: "all" | AdmissionStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function readListUrl() {
  const url = new URL(window.location.href);
  return {
    status: url.searchParams.get("status") || "all",
    q: url.searchParams.get("q") || "",
    page: parseSchoolPage(url.searchParams.get("page")),
    pageSize: parseSchoolPageSize(url.searchParams.get("pageSize")),
  };
}

export function SchoolAdmissionsPage({
  admissions: initialRows,
  page: initialPage,
  canManage,
  canCancel = false,
  query,
  status,
  error,
  pending = false,
}: {
  admissions: AdmissionListRow[];
  page: SchoolPageMeta;
  canManage: boolean;
  canCancel?: boolean;
  query: string;
  status: string;
  error: string | null;
  pending?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [q, setQ] = useState(query);
  const [filter, setFilter] = useState(status || "all");
  const [requestedStatus, setRequestedStatus] = useState<string | null>(null);
  const [requestedSize, setRequestedSize] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const reqId = useRef(0);
  const confirmed = useRef({ filter: status || "all", q: query, page: initialPage.page, pageSize: initialPage.pageSize });

  function persist(nextRows: AdmissionListRow[], nextPage: SchoolPageMeta, nextFilter: string, nextQ: string, nextSize: number) {
    confirmed.current = { filter: nextFilter, q: nextQ, page: nextPage.page, pageSize: nextSize };
    writeAdmissionsListSnapshot({
      rows: nextRows,
      page: nextPage,
      pageSize: nextSize,
      filter: nextFilter,
      q: nextQ,
    });
  }

  function syncUrl(nextPage: number, nextQ: string, nextStatus: string, nextSize: number) {
    replaceSchoolPageParam(nextPage, nextSize, { status: nextStatus, q: nextQ });
  }

  function load(
    nextPage: number,
    nextQ: string,
    nextStatus: string,
    nextSize = pageSize,
    options: { skipUrl?: boolean; quiet?: boolean } = {},
  ) {
    const id = ++reqId.current;
    if (!options.quiet) {
      setRequestedStatus(nextStatus);
      setRequestedSize(nextSize);
      setPaging(true);
    }
    void listSchoolAdmissionsAction({
      page: nextPage,
      pageSize: nextSize,
      q: nextQ,
      status: nextStatus === "all" ? "" : nextStatus,
    }).then((result) => {
      if (id !== reqId.current) return;
      setPaging(false);
      setRequestedStatus(null);
      setRequestedSize(null);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setFilter(nextStatus);
      setQ(nextQ);
      setRows(result.admissions);
      setPage(result.page);
      setPageSize(result.page.pageSize);
      persist(result.admissions, result.page, nextStatus, nextQ, result.page.pageSize);
      if (!options.skipUrl) syncUrl(result.page.page, nextQ, nextStatus, result.page.pageSize);
    });
  }

  useLayoutEffect(() => {
    const url = readListUrl();
    const snapshot = peekAdmissionsListSnapshot();
    const matchesSnapshot =
      snapshot &&
      snapshot.filter === url.status &&
      snapshot.q === url.q &&
      snapshot.page.page === url.page &&
      snapshot.pageSize === url.pageSize;
    queueMicrotask(() => {
      if (matchesSnapshot && snapshot) {
        setRows(snapshot.rows);
        setPage(snapshot.page);
        setPageSize(snapshot.pageSize);
        setFilter(snapshot.filter);
        setQ(snapshot.q);
        confirmed.current = {
          filter: snapshot.filter,
          q: snapshot.q,
          page: snapshot.page.page,
          pageSize: snapshot.pageSize,
        };
        load(url.page, url.q, url.status, url.pageSize, { skipUrl: true, quiet: true });
        return;
      }
      if (url.status !== "all" || url.q || url.page > 1 || url.pageSize !== initialPage.pageSize) {
        load(url.page, url.q, url.status, url.pageSize, { skipUrl: true });
        return;
      }
      persist(initialRows, initialPage, status || "all", query, initialPage.pageSize);
    });
    // Restore URL/list on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const flash = consumeAdmissionFlash();
    if (!flash) return;
    const activeFilter = confirmed.current.filter || "all";
    if (activeFilter !== "all" && activeFilter !== flash.status) return;
    queueMicrotask(() => {
      setRows((current) => {
        if (current.some((row) => row.id === flash.id)) return current;
        setPage((meta) => {
          const next = { ...meta, total: meta.total + 1 };
          persist([flash, ...current.filter((row) => row.id !== flash.id)], next, confirmed.current.filter, confirmed.current.q, confirmed.current.pageSize);
          return next;
        });
        return [flash, ...current];
      });
    });
  }, []);

  useEffect(() => {
    function onPop() {
      const url = readListUrl();
      load(url.page, url.q, url.status, url.pageSize, { skipUrl: true });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runCancel() {
    if (!cancelId || lock.current || cancelReason.trim().length < 3) return;
    lock.current = true;
    setBusy(true);
    void cancelSchoolAdmissionAction(cancelId, cancelReason).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setCancelId(null);
      setCancelReason("");
      load(confirmed.current.page, confirmed.current.q, confirmed.current.filter, confirmed.current.pageSize);
    });
  }

  const completing = rows.find((row) => row.id === completeId) ?? null;
  const waiting = pending || paging;
  const showEmpty = rows.length === 0 && !waiting;

  function openAdmission(row: AdmissionListRow) {
    writeAdmissionView(row);
    prefetchSchoolAdmission(row.id);
  }

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
              aria-pressed={filter === item.id}
              aria-busy={requestedStatus === item.id && paging}
              disabled={paging && requestedStatus === item.id}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                filter === item.id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
                requestedStatus === item.id && paging && filter !== item.id ? "text-navy ring-1 ring-navy/15" : null,
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
            onChange={(event) => {
              const value = event.target.value;
              setQ(value);
              if (searchTimer.current) window.clearTimeout(searchTimer.current);
              searchTimer.current = window.setTimeout(() => load(1, value, filter), 280);
            }}
          />
        </form>
      </div>

      {showEmpty ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={UserPlus} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No admissions yet</h2>
          <p className="text-[13.5px] text-slate-500">Create your first student admission to get started.</p>
        </section>
      ) : (
        <section className={cn(glassPanel, paging && "opacity-80")}>
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
                      <Link
                        href={`/school/admissions/${row.id}`}
                        prefetch
                        className="font-semibold hover:underline"
                        onMouseEnter={() => openAdmission(row)}
                        onFocus={() => openAdmission(row)}
                        onClick={() => openAdmission(row)}
                      >
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
                          {
                            label: "View",
                            href: `/school/admissions/${row.id}`,
                            onSelect: () => openAdmission(row),
                          },
                          ...(canManage && row.status === "draft"
                            ? [
                                { label: "Edit", href: `/school/admissions/${row.id}/edit` },
                                { label: "Complete", onSelect: () => setCompleteId(row.id) },
                              ]
                            : []),
                          ...(canCancel && row.status === "draft"
                            ? [{ label: "Cancel Admission", onSelect: () => setCancelId(row.id) }]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination
            page={page.page}
            total={page.total}
            pageSize={pageSize}
            pendingPageSize={requestedSize}
            onPage={(next) => load(next, q, filter)}
            onPageSize={(size) => load(1, q, filter, size)}
          />
        </section>
      )}

      {cancelId ? (
        <SchoolGlassModal
          title="Cancel admission"
          subtitle="This draft will be cancelled and kept under Cancelled. It will not create a student."
          onClose={() => {
            if (busy) return;
            setCancelId(null);
            setCancelReason("");
          }}
          footer={
            <>
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => {
                  setCancelId(null);
                  setCancelReason("");
                }}
              >
                Keep draft
              </button>
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Cancel admission"
                busyLabel="Saving"
                disabled={cancelReason.trim().length < 3}
                onClick={runCancel}
              />
            </>
          }
        >
          <SchoolField label="Cancellation reason">
            <textarea className={inputClass} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </SchoolField>
        </SchoolGlassModal>
      ) : null}
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
