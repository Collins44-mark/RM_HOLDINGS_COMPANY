"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { listSchoolFeeAccountsAction, type SchoolFeesWorkspaceResult } from "@/actions/school/fees";
import { listFeeStructureClassesAction } from "@/actions/school/settings";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import {
  glassPanel,
  inputClass,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { cn } from "@/lib/cn";
import { formatAmount, formatTzs } from "@/lib/format/currency";
import {
  feeStatusLabel,
  type FeeAccountListRow,
  type FeeSummary,
} from "@/lib/school/fee-types";
import {
  consumeFeeFlash,
  consumeFeesListRestore,
  peekFeesListSnapshot,
  writeFeeView,
  writeFeesListSnapshot,
} from "@/lib/school/admission-flash";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { formatCompactStudentNumber } from "@/lib/school/student-number";

type Caps = {
  canRecord: boolean;
  canVerify: boolean;
  canReceipt: boolean;
};

const EMPTY_SUMMARY: FeeSummary = { totalFees: 0, collected: 0, outstanding: 0, studentsWithBalance: 0 };

function amountCell(value: number | null) {
  if (value == null) return "—";
  return formatAmount(value);
}

function rememberView(row: FeeAccountListRow) {
  writeFeeView({
    enrollmentId: row.enrollmentId,
    studentName: row.studentName,
    studentNumber: formatCompactStudentNumber(row.studentNumber),
  });
}

export function SchoolFeesPage({
  initial,
  pending = false,
}: {
  initial: SchoolFeesWorkspaceResult | null;
  pending?: boolean;
}) {
  const ready = Boolean(initial?.ok);
  const [error, setError] = useState<string | null>(ready || pending ? null : initial?.error ?? null);
  const [accounts, setAccounts] = useState<FeeAccountListRow[]>(ready && initial?.ok ? initial.accounts : []);
  const [page, setPage] = useState<SchoolPageMeta>(ready && initial?.ok ? initial.page : schoolPageMeta(1, 0));
  const [summary, setSummary] = useState<FeeSummary>(ready && initial?.ok ? initial.summary : EMPTY_SUMMARY);
  const [years] = useState(ready && initial?.ok ? initial.years : []);
  const [levels] = useState(ready && initial?.ok ? initial.levels : []);
  const [caps, setCaps] = useState<Caps>(
    ready && initial?.ok
      ? initial.capabilities
      : { canRecord: false, canVerify: false, canReceipt: false },
  );
  const [yearId, setYearId] = useState(ready && initial?.ok ? initial.academicYearId : "");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const requestSeq = useRef(0);

  useEffect(() => {
    const restore = consumeFeesListRestore();
    const snapshot = restore ? peekFeesListSnapshot() : null;
    if (snapshot) {
      queueMicrotask(() => {
        setYearId(snapshot.yearId);
        setLevelId(snapshot.levelId);
        setClassId(snapshot.classId);
        setStatus(snapshot.status);
        setQ(snapshot.q);
        load(snapshot.page.page, {
          yearId: snapshot.yearId,
          levelId: snapshot.levelId,
          classId: snapshot.classId,
          status: snapshot.status,
          q: snapshot.q,
        });
      });
    } else if (initial?.ok) {
      writeFeesListSnapshot({
        rows: initial.accounts,
        page: initial.page,
        summary: initial.summary,
        yearId: initial.academicYearId,
        levelId: "",
        classId: "",
        status: "all",
        q: "",
      });
    }
    const flash = consumeFeeFlash();
    if (!flash) return;
    queueMicrotask(() => {
      setAccounts((current) => {
        if (current.some((row) => row.enrollmentId === flash.enrollmentId)) return current;
        setPage((meta) => ({ ...meta, total: meta.total + 1, to: meta.to + 1 }));
        setSummary((meta) => ({
          ...meta,
          studentsWithBalance:
            flash.status === "outstanding" || flash.status === "partial" ? meta.studentsWithBalance + 1 : meta.studentsWithBalance,
          totalFees: meta.totalFees + (flash.annualAmount ?? 0),
          outstanding: meta.outstanding + (flash.outstandingAmount ?? 0),
        }));
        return [flash, ...current];
      });
    });
    // Mount-only: restore list snapshot after returning from a profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!levelId) return;
    let active = true;
    void listFeeStructureClassesAction(levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [levelId]);

  function load(nextPage: number, next: { yearId?: string; levelId?: string; classId?: string; status?: string; q?: string } = {}) {
    const academicYearId = next.yearId ?? yearId;
    const nextLevel = next.levelId ?? levelId;
    const nextClass = next.classId ?? classId;
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? q;
    const token = ++requestSeq.current;
    void listSchoolFeeAccountsAction({
      page: nextPage,
      academicYearId: academicYearId || undefined,
      levelId: nextLevel || undefined,
      classId: nextClass || undefined,
      status: nextStatus,
      q: nextQ,
    }).then((result) => {
      if (token !== requestSeq.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAccounts(result.accounts);
      setPage(result.page);
      setSummary(result.summary);
      setCaps(result.capabilities);
      writeFeesListSnapshot({
        rows: result.accounts,
        page: result.page,
        summary: result.summary,
        yearId: academicYearId,
        levelId: nextLevel,
        classId: nextClass,
        status: nextStatus,
        q: nextQ,
      });
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Fees & Payments</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">Student balances, payments, and outstanding school fees.</p>
      </header>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total Fees", summary.totalFees, "Selected year"],
          ["Collected", summary.collected, "Posted payments, selected year"],
          ["Outstanding", summary.outstanding, "Unpaid in selected year"],
          ["Students with Balance", summary.studentsWithBalance, "Distinct students, selected year"],
        ].map(([label, value, hint]) => (
          <section key={String(label)} className={cn(glassPanel, "px-4 py-3")}>
            <p className="text-[12px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">
              {label === "Students with Balance" ? value : formatTzs(Number(value))}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            load(1, { yearId: event.target.value });
          }}
        >
          <option value="">Academic Year</option>
          {years.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={levelId}
          onChange={(event) => {
            setLevelId(event.target.value);
            setClassId("");
            setClasses([]);
            load(1, { levelId: event.target.value, classId: "" });
          }}
        >
          <option value="">All Levels</option>
          {levels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[148px] shrink-0")}
          value={classId}
          disabled={!levelId}
          onChange={(event) => {
            setClassId(event.target.value);
            load(1, { classId: event.target.value });
          }}
        >
          <option value="">All Classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !w-auto !max-w-none !rounded-full min-w-[156px] shrink-0")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            load(1, { status: event.target.value });
          }}
        >
          <option value="all">All Status</option>
          <option value="outstanding">Outstanding</option>
          <option value="partial">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="no_structure">No Fee Structure</option>
        </select>
        <form
          className="min-w-[220px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <input
            className={cn(inputClass, "!h-9 !rounded-full")}
            value={q}
            placeholder="Search student name / student no. / admission no."
            onChange={(event) => {
              const next = event.target.value;
              setQ(next);
              if (!next.trim()) load(1, { q: "" });
            }}
          />
        </form>
      </div>

      {accounts.length === 0 ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={Wallet} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">
            {pending ? "Fees & Payments" : "No students with active enrollment yet."}
          </h2>
          <p className="text-[13.5px] text-slate-500">
            {pending ? "Loading student fee accounts." : "Completed admissions will appear here automatically."}
          </p>
        </section>
      ) : (
        <section className={glassPanel}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className={tableHead}>
                  {["Student", "No.", "Level", "Class", "Annual", "Current Term", "Paid", "Outstanding", "Status", ""].map(
                    (heading) => (
                      <th key={heading || "actions"} className="px-3 py-3 font-semibold">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.enrollmentId} className="border-t border-navy/5 text-[13.5px] text-navy">
                    <td className="px-3 py-3 font-semibold">{row.studentName}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCompactStudentNumber(row.studentNumber)}</td>
                    <td className="px-3 py-3">{row.levelName}</td>
                    <td className="px-3 py-3">{row.classCode || row.className}</td>
                    <td className="px-3 py-3 tabular-nums">{amountCell(row.annualAmount)}</td>
                    <td className="px-3 py-3">
                      {row.currentTermAmount != null
                        ? `${row.currentTermName ?? "Term"} · ${formatAmount(row.currentTermAmount)}`
                        : row.currentTermName
                          ? `${row.currentTermName} · —`
                          : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatAmount(row.paidAmount)}</td>
                    <td className="px-3 py-3 tabular-nums font-medium">
                      {amountCell(row.totalOutstanding ?? row.outstandingAmount)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill value={feeStatusLabel(row.status)} />
                    </td>
                    <td className="px-3 py-3">
                      <CompactActionsMenu
                        ariaLabel={`${row.studentName} fee actions`}
                        items={[
                          {
                            label: "View",
                            href: `/school/fees/${row.enrollmentId}`,
                            onSelect: () => rememberView(row),
                          },
                          ...(caps.canRecord && row.status !== "no_structure"
                            ? [
                                {
                                  label: "Record Payment",
                                  href: `/school/fees/${row.enrollmentId}?pay=1`,
                                  onSelect: () => rememberView(row),
                                },
                              ]
                            : []),
                          {
                            label: "View Payments",
                            href: `/school/fees/${row.enrollmentId}#payments`,
                            onSelect: () => rememberView(row),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination page={page.page} total={page.total} onPage={(next) => load(next)} />
        </section>
      )}
    </div>
  );
}
