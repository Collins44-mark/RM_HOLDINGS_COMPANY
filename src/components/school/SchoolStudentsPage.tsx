"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import {
  getSchoolPlacementClassesAction,
  getSchoolPlacementStreamsAction,
} from "@/actions/school/placement";
import { listSchoolStudentsAction, type StudentListRow } from "@/actions/school/students";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { glassPanel, StatusPill, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import { SchoolPlacementFilterBar, type PlacementChoice } from "@/components/school/SchoolPlacementFilterBar";
import { consumeStudentFlash } from "@/lib/school/admission-flash";
import { formatCompactStudentNumber } from "@/lib/school/student-number";
import { SCHOOL_PAGE_SIZE, type SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

export function SchoolStudentsPage({
  students: initialRows,
  page: initialPage,
  levels: initialLevels,
  query,
  levelId: initialLevelId,
  classId: initialClassId,
  streamId: initialStreamId,
  pageSize: initialPageSize,
  error,
  pending = false,
}: {
  students: StudentListRow[];
  page: SchoolPageMeta;
  levels: PlacementChoice[];
  query: string;
  levelId: string;
  classId: string;
  streamId: string;
  pageSize: number;
  error: string | null;
  pending?: boolean;
}) {
  const router = useRouter();
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
  const [paging, setPaging] = useState(false);

  useEffect(() => {
    const flash = consumeStudentFlash();
    if (!flash) return;
    queueMicrotask(() => {
      setRows((current) => (current.some((row) => row.id === flash.id) ? current : [flash, ...current]));
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
    setPaging(true);
    void listSchoolStudentsAction({
      page: nextPage,
      pageSize: nextSize,
      q: nextQ,
      levelId: nextLevel,
      classId: nextClass,
      streamId: nextStream,
    }).then((result) => {
      setPaging(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setRows(result.students);
      setPage(result.page);
      setPageSize(nextSize);
      replaceSchoolPageParam(result.page.page, nextSize);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Students</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">Students are created when an admission is completed.</p>
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
        searchPlaceholder="Search name, student no., or admission no."
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
      {rows.length === 0 && !error && !pending ? (
        <section className={`${glassPanel} flex flex-col items-start gap-3 py-10`}>
          <SchoolIconWell icon={Users} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No students yet</h2>
          <p className="text-[13.5px] text-slate-500">Complete an admission to create the first student profile.</p>
        </section>
      ) : (
        <section className={cn(glassPanel, paging && "opacity-80")}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[920px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Student No.</th>
                  <th className="px-4 py-3 font-semibold">Admission No.</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold">Guardian</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/students/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatCompactStudentNumber(row.studentNumber)}</td>
                    <td className="px-4 py-3">{row.admissionNumber || "—"}</td>
                    <td className="px-4 py-3">{row.levelName || "—"}</td>
                    <td className="px-4 py-3">{row.className || "—"}</td>
                    <td className="px-4 py-3">{row.streamName || "—"}</td>
                    <td className="px-4 py-3">{row.guardianName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.status === "active" ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.name} actions`}
                        items={[{ label: "View", onSelect: () => router.push(`/school/students/${row.id}`) }]}
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
            onPage={(next) => load({ page: next })}
            onPageSize={(size) => load({ page: 1, pageSize: size })}
          />
        </section>
      )}
    </div>
  );
}
