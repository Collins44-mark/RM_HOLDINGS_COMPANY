"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { archiveSchoolStaffAction, type StaffListRow } from "@/actions/school/staff";
import {
  consumeStaffFlash,
  peekStaffListSnapshot,
  writeStaffListSnapshot,
  writeStaffView,
} from "@/lib/school/staff-flash";
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
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";

function needle(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(row: StaffListRow, q: string) {
  const next = needle(q);
  if (!next) return true;
  return [row.name, row.staffNumber, row.phone, row.jobTitle, row.positionName, row.roleName].some((value) =>
    String(value ?? "").toLowerCase().includes(next),
  );
}

function filterRows(rows: StaffListRow[], status: string, q: string) {
  return rows.filter((row) => {
    if (status === "active" || status === "inactive") {
      if (row.status !== status) return false;
    }
    return matchesQuery(row, q);
  });
}

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
  const [rows, setRows] = useState(() => {
    const snapshot = peekStaffListSnapshot();
    return snapshot?.rows.length ? snapshot.rows : initialRows;
  });
  const [q, setQ] = useState(query);
  const [filter, setFilter] = useState(status || "active");
  const [pageNumber, setPageNumber] = useState(initialPage.page);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const flash = consumeStaffFlash();
    if (!flash) return;
    queueMicrotask(() => {
      setRows((current) => {
        if (current.some((row) => row.id === flash.id)) {
          return current.map((row) => (row.id === flash.id ? { ...row, ...flash } : row));
        }
        return [flash, ...current];
      });
    });
  }, []);

  const filtered = useMemo(() => filterRows(rows, filter, q), [rows, filter, q]);
  const page = schoolPageMeta(pageNumber, filtered.length, initialPage.pageSize);
  const visible = filtered.slice(page.from ? page.from - 1 : 0, page.to);

  useEffect(() => {
    writeStaffListSnapshot({ rows, page, q, status: filter });
    replaceSchoolPageParam(page.page, undefined, { status: filter, q });
  }, [filter, page, q, rows]);

  useEffect(() => {
    function onPop() {
      const url = new URL(window.location.href);
      setFilter(url.searchParams.get("status") || "active");
      setQ(url.searchParams.get("q") ?? "");
      const nextPage = Number(url.searchParams.get("page") ?? "1");
      setPageNumber(Number.isInteger(nextPage) && nextPage > 0 ? nextPage : 1);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function applyFilter(nextStatus: string) {
    setFilter(nextStatus);
    setPageNumber(1);
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
              onClick={() => applyFilter(id)}
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
            setPageNumber(1);
          }}
        >
          <input
            className={inputClass}
            value={q}
            placeholder="Search staff no., name, or phone"
            onChange={(event) => {
              setQ(event.target.value);
              setPageNumber(1);
            }}
          />
        </form>
      </div>
      {rows.length === 0 && !error ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Users} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No staff members added yet.</h2>
          <p className="text-[13.5px] text-slate-500">Add a staff member. Teachers, drivers, and support roles share one staff record.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className={cn(glassPanel, "px-4 py-8")}>
          <p className="text-[13.5px] text-slate-500">No staff members match this filter.</p>
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
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-4 py-3">
                      <Link
                        href={`/school/staff/${row.id}`}
                        prefetch
                        className="font-semibold hover:underline"
                        onMouseEnter={() => writeStaffView(row)}
                      >
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
                        onOpen={() => writeStaffView(row)}
                        items={[
                          { label: "View", href: `/school/staff/${row.id}` },
                          ...(canManage ? [{ label: "Edit", href: `/school/staff/${row.id}/edit` }] : []),
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
                                      setRows((current) =>
                                        current.map((item) => (item.id === row.id ? { ...item, status: "inactive" as const } : item)),
                                      );
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
          <SchoolPagination page={page.page} total={page.total} onPage={setPageNumber} />
        </section>
      )}
    </div>
  );
}
