"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";
import { listSchoolGuardiansAction, type GuardianListRow } from "@/actions/school/parents";
import { glassPanel, inputClass, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import type { SchoolPageMeta } from "@/lib/school/pagination";

export function SchoolParentsPage({
  guardians: initialRows,
  page: initialPage,
  query,
  error,
}: {
  guardians: GuardianListRow[];
  page: SchoolPageMeta;
  query: string;
  error: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [saveError, setSaveError] = useState<string | null>(null);

  function load(nextPage: number, nextQ: string) {
    void listSchoolGuardiansAction({ page: nextPage, q: nextQ }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setRows(result.guardians);
      setPage(result.page);
      replaceSchoolPageParam(result.page.page);
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(1, q);
        }}
      >
        <input className={inputClass} value={q} placeholder="Search name, phone, or email" onChange={(event) => setQ(event.target.value)} />
      </form>
      {rows.length === 0 && !error ? (
        <section className={`${glassPanel} flex flex-col items-start gap-3 py-10`}>
          <SchoolIconWell icon={UsersRound} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No parents recorded yet.</h2>
          <p className="text-[13.5px] text-slate-500">Complete an admission to add a guardian.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[640px] text-left">
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
                    <td className="px-4 py-3">{row.students || "—"}</td>
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
