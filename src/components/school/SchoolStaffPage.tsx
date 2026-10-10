"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { archiveSchoolStaffAction, listSchoolStaffAction, type StaffListRow } from "@/actions/school/staff";
import { consumeStaffFlash } from "@/lib/school/staff-flash";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  primaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination, replaceSchoolPageParam } from "@/components/school/SchoolPagination";
import type { SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

export function SchoolStaffPage({
  staff: initialRows,
  page: initialPage,
  canManage,
  canViewPayroll = false,
  query,
  status,
  error,
}: {
  staff: StaffListRow[];
  page: SchoolPageMeta;
  canManage: boolean;
  canManageSystemAccess: boolean;
  canViewPayroll?: boolean;
  query: string;
  status: string;
  error: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(query);
  const [filter, setFilter] = useState(status || "active");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const flash = consumeStaffFlash();
    if (!flash) return;
    const activeFilter = status || "active";
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
    void listSchoolStaffAction({ page: nextPage, q: nextQ, status: nextStatus === "all" ? "" : nextStatus }).then((result) => {
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setRows(result.staff);
      setPage(result.page);
      setFilter(nextStatus);
      replaceSchoolPageParam(result.page.page);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Staff</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">One employee record per person. Job title is employment; application roles are optional.</p>
        </div>
        {canManage ? (
          <Link href="/school/staff/new" className={primaryButton}>
            + Add Staff
          </Link>
        ) : null}
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
          {(
            [
              ["active", "Active"],
              ["inactive", "Inactive"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => load(1, q, id)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                filter === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
              )}
            >
              {label}
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
          <input className={inputClass} value={q} placeholder="Search staff no., name, or phone" onChange={(event) => setQ(event.target.value)} />
        </form>
      </div>
      {rows.length === 0 && !error ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Users} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No staff members added yet.</h2>
          <p className="text-[13.5px] text-slate-500">Add a staff member. Teachers, drivers, and support roles share one staff record.</p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className={tableHead}>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Job title</th>
                  <th className="px-4 py-3 font-semibold">Access role</th>
                  {canViewPayroll ? <th className="px-4 py-3 font-semibold">Monthly salary</th> : null}
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link href={`/school/staff/${row.id}`} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.jobTitle || row.positionName || row.typeName || "—"}</td>
                    <td className="px-4 py-3">{row.roleName || "—"}</td>
                    {canViewPayroll ? (
                      <td className="px-4 py-3">{row.monthlySalary == null ? "—" : row.monthlySalary.toLocaleString("en-TZ")}</td>
                    ) : null}
                    <td className="px-4 py-3">
                      <StatusPill value={row.status === "active" ? "Active" : "Inactive"} />
                    </td>
                    <td className="px-4 py-3">{row.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.name} actions`}
                        items={[
                          { label: "View", onSelect: () => router.push(`/school/staff/${row.id}`) },
                          ...(canManage
                            ? [{ label: "Edit", onSelect: () => router.push(`/school/staff/${row.id}/edit`) }]
                            : []),
                          ...(canManage && row.status === "active"
                            ? [
                                {
                                  label: "Deactivate",
                                  onSelect: () => {
                                    void archiveSchoolStaffAction(row.id).then((result) => {
                                      if (!result.ok) {
                                        setSaveError(result.error);
                                        return;
                                      }
                                      load(page.page, q, filter);
                                    });
                                  },
                                },
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
    </div>
  );
}
