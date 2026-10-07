"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { listSchoolStudentsAction, type StudentListRow } from "@/actions/school/students";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { glassPanel, inputClass, StatusPill, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import type { SchoolPageMeta } from "@/lib/school/pagination";

export function SchoolStudentsPage({
  students: initialRows,
  page: initialPage,
  query,
  error,
}: {
  students: StudentListRow[];
  page: SchoolPageMeta;
  query: string;
  error: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [saveError, setSaveError] = useState<string | null>(null);

  function load(nextPage: number, nextQ: string) {
    void listSchoolStudentsAction({ page: nextPage, q: nextQ }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setRows(result.students);
      setPage(result.page);
      replaceSchoolPageParam(result.page.page);
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(1, q);
        }}
      >
        <input className={inputClass} value={q} placeholder="Search student no., admission no., or name" onChange={(event) => setQ(event.target.value)} />
      </form>
      {rows.length === 0 && !error ? (
        <section className={`${glassPanel} flex flex-col items-start gap-3 py-10`}>
          <SchoolIconWell icon={Users} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No students yet.</h2>
          <p className="text-[13.5px] text-slate-500">Complete an admission to create the first student profile.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Student No.</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Level</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Stream</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/students/${row.id}`} className="font-semibold hover:underline">
                        {row.studentNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.levelName || "—"}</td>
                    <td className="px-4 py-3">{row.className || "—"}</td>
                    <td className="px-4 py-3">{row.streamName || "—"}</td>
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
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next, q)} />
        </section>
      )}
    </div>
  );
}
