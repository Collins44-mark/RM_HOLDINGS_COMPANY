"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import {
  getSchoolPlacementClassesAction,
  getSchoolPlacementStreamsAction,
} from "@/actions/school/placement";
import { listSchoolGuardiansAction, type GuardianListRow } from "@/actions/school/parents";
import { glassPanel, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { SchoolPlacementFilterBar, type PlacementChoice } from "@/components/school/SchoolPlacementFilterBar";
import { consumeGuardianFlash } from "@/lib/school/admission-flash";
import { SCHOOL_PAGE_SIZE, type SchoolPageMeta } from "@/lib/school/pagination";

export function SchoolParentsPage({
  guardians: initialRows,
  page: initialPage,
  levels: initialLevels,
  query,
  levelId: initialLevelId,
  classId: initialClassId,
  streamId: initialStreamId,
  pageSize: initialPageSize,
  error,
}: {
  guardians: GuardianListRow[];
  page: SchoolPageMeta;
  levels: PlacementChoice[];
  query: string;
  levelId: string;
  classId: string;
  streamId: string;
  pageSize: number;
  error: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [levelId, setLevelId] = useState(initialLevelId);
  const [classId, setClassId] = useState(initialClassId);
  const [streamId, setStreamId] = useState(initialStreamId);
  const [pageSize, setPageSize] = useState(initialPageSize || SCHOOL_PAGE_SIZE);
  const [levels] = useState(initialLevels);
  const [classes, setClasses] = useState<PlacementChoice[]>([]);
  const [streams, setStreams] = useState<PlacementChoice[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!levelId) return;
    let active = true;
    void getSchoolPlacementClassesAction(levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [levelId]);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    void getSchoolPlacementStreamsAction(classId).then((result) => {
      if (!active || !result.ok) return;
      setStreams(result.streams);
    });
    return () => {
      active = false;
    };
  }, [classId]);

  function load(next: { page?: number; q?: string; levelId?: string; classId?: string; streamId?: string; pageSize?: number }) {
    const nextPage = next.page ?? 1;
    const nextQ = next.q ?? q;
    const nextLevel = next.levelId ?? levelId;
    const nextClass = next.classId ?? classId;
    const nextStream = next.streamId ?? streamId;
    const nextSize = next.pageSize ?? pageSize;
    void listSchoolGuardiansAction({
      page: nextPage,
      pageSize: nextSize,
      q: nextQ,
      levelId: nextLevel,
      classId: nextClass,
      streamId: nextStream,
    }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setRows(result.guardians);
      setPage(result.page);
      setPageSize(nextSize);
      replaceSchoolPageParam(result.page.page, nextSize);
    });
  }

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
        onLevel={(id) => {
          setLevelId(id);
          setClassId("");
          setStreamId("");
          setClasses([]);
          setStreams([]);
          load({ page: 1, levelId: id, classId: "", streamId: "" });
        }}
        onClass={(id) => {
          setClassId(id);
          setStreamId("");
          setStreams([]);
          load({ page: 1, classId: id, streamId: "" });
        }}
        onStream={(id) => {
          setStreamId(id);
          load({ page: 1, streamId: id });
        }}
        onSearch={setQ}
        onSearchSubmit={() => load({ page: 1, q })}
      />
      {rows.length === 0 && !error ? (
        <section className={`${glassPanel} flex flex-col items-start gap-3 py-10`}>
          <SchoolIconWell icon={UsersRound} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No guardians yet</h2>
          <p className="text-[13.5px] text-slate-500">Complete an admission to add a guardian.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Guardian</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Linked students</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3 font-medium">{row.fullName}</td>
                    <td className="px-4 py-3">{row.phone || "—"}</td>
                    <td className="px-4 py-3">{row.email || "—"}</td>
                    <td className="px-4 py-3">
                      {row.students.length === 0
                        ? "—"
                        : row.students.map((student) => (
                            <div key={student.studentId}>
                              {student.name}
                              {student.placement ? ` — ${student.placement}` : ""}
                            </div>
                          ))}
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
            onPage={(next) => load({ page: next })}
            onPageSize={(size) => load({ page: 1, pageSize: size })}
          />
        </section>
      )}
    </div>
  );
}
