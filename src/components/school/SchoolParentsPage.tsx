"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UsersRound } from "lucide-react";
import { listSchoolGuardiansAction, type GuardianListRow } from "@/actions/school/parents";
import { glassPanel, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { SchoolPlacementFilterBar, type PlacementChoice } from "@/components/school/SchoolPlacementFilterBar";
import { consumeGuardianFlash } from "@/lib/school/admission-flash";
import { parseSchoolPage, parseSchoolPageSize, SCHOOL_PAGE_SIZE, type SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

function readParentsUrl() {
  const url = new URL(window.location.href);
  return {
    q: url.searchParams.get("q") || "",
    levelId: url.searchParams.get("levelId") || "",
    classId: url.searchParams.get("classId") || "",
    streamId: url.searchParams.get("streamId") || "",
    page: parseSchoolPage(url.searchParams.get("page")),
    pageSize: parseSchoolPageSize(url.searchParams.get("pageSize")),
  };
}

export function SchoolParentsPage({
  guardians: initialRows,
  page: initialPage,
  levels: initialLevels,
  classes: initialClasses = [],
  streams: initialStreams = [],
  query,
  levelId: initialLevelId,
  classId: initialClassId,
  streamId: initialStreamId,
  pageSize: initialPageSize,
  error,
  pending = false,
}: {
  guardians: GuardianListRow[];
  page: SchoolPageMeta;
  levels: PlacementChoice[];
  classes?: PlacementChoice[];
  streams?: PlacementChoice[];
  query: string;
  levelId: string;
  classId: string;
  streamId: string;
  pageSize: number;
  error: string | null;
  pending?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [levelId, setLevelId] = useState(initialLevelId);
  const [classId, setClassId] = useState(initialClassId);
  const [streamId, setStreamId] = useState(initialStreamId);
  const [pageSize, setPageSize] = useState(initialPageSize || SCHOOL_PAGE_SIZE);
  const [levels] = useState(initialLevels);
  const [classes, setClasses] = useState<PlacementChoice[]>(initialClasses);
  const [streams, setStreams] = useState<PlacementChoice[]>(initialStreams);
  const [requestedLevelId, setRequestedLevelId] = useState<string | null>(null);
  const [requestedClassId, setRequestedClassId] = useState<string | null>(null);
  const [requestedStreamId, setRequestedStreamId] = useState<string | null>(null);
  const [requestedSize, setRequestedSize] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const reqId = useRef(0);
  const searchTimer = useRef<number | null>(null);

  function syncUrl(nextPage: number, nextQ: string, nextLevel: string, nextClass: string, nextStream: string, nextSize: number) {
    replaceSchoolPageParam(nextPage, nextSize, {
      q: nextQ,
      levelId: nextLevel,
      classId: nextClass,
      streamId: nextStream,
    });
  }

  function load(
    next: { page?: number; q?: string; levelId?: string; classId?: string; streamId?: string; pageSize?: number },
    options: { skipUrl?: boolean } = {},
  ) {
    const id = ++reqId.current;
    const nextPage = next.page ?? 1;
    const nextQ = next.q ?? q;
    const nextLevel = next.levelId ?? levelId;
    const nextClass = next.classId ?? classId;
    const nextStream = next.streamId ?? streamId;
    const nextSize = next.pageSize ?? pageSize;
    setRequestedLevelId(nextLevel);
    setRequestedClassId(nextClass);
    setRequestedStreamId(nextStream);
    setRequestedSize(nextSize);
    setPaging(true);
    void listSchoolGuardiansAction({
      page: nextPage,
      pageSize: nextSize,
      q: nextQ,
      levelId: nextLevel,
      classId: nextClass,
      streamId: nextStream,
    }).then((result) => {
      if (id !== reqId.current) return;
      setPaging(false);
      setRequestedLevelId(null);
      setRequestedClassId(null);
      setRequestedStreamId(null);
      setRequestedSize(null);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setQ(nextQ);
      setLevelId(nextLevel);
      setClassId(nextClass);
      setStreamId(nextStream);
      setRows(result.guardians);
      setPage(result.page);
      setPageSize(result.page.pageSize);
      setClasses(result.classes);
      setStreams(result.streams);
      if (!options.skipUrl) syncUrl(result.page.page, nextQ, nextLevel, nextClass, nextStream, result.page.pageSize);
    });
  }

  useLayoutEffect(() => {
    const url = readParentsUrl();
    queueMicrotask(() => {
      if (url.q || url.levelId || url.classId || url.streamId || url.page > 1 || url.pageSize !== initialPageSize) {
        setQ(url.q);
        load(
          {
            page: url.page,
            q: url.q,
            levelId: url.levelId,
            classId: url.classId,
            streamId: url.streamId,
            pageSize: url.pageSize,
          },
          { skipUrl: true },
        );
      }
    });
    function onPop() {
      const next = readParentsUrl();
      setQ(next.q);
      load(
        {
          page: next.page,
          q: next.q,
          levelId: next.levelId,
          classId: next.classId,
          streamId: next.streamId,
          pageSize: next.pageSize,
        },
        { skipUrl: true },
      );
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const flash = consumeGuardianFlash();
    if (!flash) return;
    queueMicrotask(() => {
      setRows((current) => {
        const existing = current.find((row) => row.id === flash.id);
        if (!existing) return [flash, ...current];
        const studentIds = new Set(existing.students.map((item) => item.studentId));
        const extra = flash.students.filter((item) => !studentIds.has(item.studentId));
        if (!extra.length) return current;
        return current.map((row) => (row.id === flash.id ? { ...row, students: [...row.students, ...extra] } : row));
      });
    });
  }, []);

  const waiting = pending || paging;
  const showEmpty = rows.length === 0 && !waiting && !error;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Parents / Guardians</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">Guardians created during admission appear here automatically.</p>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}
      <SchoolPlacementFilterBar
        levels={levels}
        classes={classes}
        streams={streams}
        levelId={levelId}
        classId={classId}
        streamId={streamId}
        search={q}
        searchPlaceholder="Search name, phone, or email"
        pendingLevelId={requestedLevelId}
        pendingClassId={requestedClassId}
        pendingStreamId={requestedStreamId}
        paging={paging}
        onLevel={(id) => load({ page: 1, levelId: id, classId: "", streamId: "" })}
        onClass={(id) => load({ page: 1, classId: id, streamId: "" })}
        onStream={(id) => load({ page: 1, streamId: id })}
        onSearch={(value) => {
          setQ(value);
          if (searchTimer.current) window.clearTimeout(searchTimer.current);
          searchTimer.current = window.setTimeout(() => load({ page: 1, q: value }), 280);
        }}
        onSearchSubmit={() => load({ page: 1, q })}
      />
      {showEmpty ? (
        <section className={`${glassPanel} flex flex-col items-start gap-3 py-10`}>
          <SchoolIconWell icon={UsersRound} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No guardians yet</h2>
          <p className="text-[13.5px] text-slate-500">Complete an admission to add a guardian.</p>
        </section>
      ) : (
        <section className={cn(glassPanel, paging && "opacity-80")}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Guardian</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((row) => {
                  const links = row.students.length ? row.students : [{ studentId: "", name: "", levelName: "", className: "", streamName: "" }];
                  return links.map((student, index) => (
                    <tr key={`${row.id}-${student.studentId || "none"}-${index}`} className="border-t border-navy/5 text-[13.5px] text-navy">
                      <td className="px-4 py-3 font-medium">{row.fullName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.phone || "—"}</td>
                      <td className="px-4 py-3">{row.email || "—"}</td>
                      <td className="px-4 py-3">{student.name || "—"}</td>
                      <td className="px-4 py-3">{student.levelName || "—"}</td>
                      <td className="px-4 py-3">{student.className || "—"}</td>
                      <td className="px-4 py-3">{student.streamName || "—"}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          <SchoolPagination
            page={page.page}
            total={page.total}
            pageSize={pageSize}
            pendingPageSize={requestedSize}
            onPage={(next) => load({ page: next })}
            onPageSize={(size) => load({ page: 1, pageSize: size })}
          />
        </section>
      )}
    </div>
  );
}
