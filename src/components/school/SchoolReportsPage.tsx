"use client";

import { useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import {
  loadSchoolReportsWorkspaceAction,
  type SchoolReportsWorkspaceResult,
} from "@/actions/school/reports";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import {
  filterClass,
  glassPanel,
  primaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import { SCHOOL_REPORT_DEFS, type SchoolFinanceSlice, type SchoolReportKind, type SchoolReportWorkspace } from "@/lib/school/report-types";
import { exportSchoolReportPdf } from "@/lib/school/school-reports-pdf";
import { schoolPageMeta } from "@/lib/school/pagination";

function emptyWorkspace(kind: SchoolReportKind): SchoolReportWorkspace {
  return {
    kind,
    available: [kind],
    schoolName: "School Management",
    periodLabel: "This Month",
    from: "",
    to: "",
    cards: [],
    columns: [],
    rows: [],
    page: schoolPageMeta(1, 0),
    years: [],
    levels: [],
    classes: [],
    streams: [],
    buses: [],
    expenseTypes: [],
    filtersNote: "",
    preparedBy: "",
    preparedRole: "",
  };
}

export function SchoolReportsPage({
  initial,
  pending = false,
  embedded = false,
  controlledKind,
  controlledPeriod,
  controlledFrom,
  controlledTo,
}: {
  initial: SchoolReportsWorkspaceResult | null;
  pending?: boolean;
  embedded?: boolean;
  controlledKind?: SchoolReportKind;
  controlledPeriod?: ReportPeriod;
  controlledFrom?: string;
  controlledTo?: string;
}) {
  const first = initial?.ok ? initial.workspace : emptyWorkspace(controlledKind ?? "finance");
  const [workspace, setWorkspace] = useState<SchoolReportWorkspace>(first);
  const [error, setError] = useState<string | null>(initial?.ok === false ? initial.error : null);
  const [kind, setKind] = useState<SchoolReportKind>(controlledKind ?? first.kind);
  const [slice, setSlice] = useState<SchoolFinanceSlice>("all");
  const [period, setPeriod] = useState<ReportPeriod>(controlledPeriod ?? "this-month");
  const [from, setFrom] = useState(first.from);
  const [to, setTo] = useState(first.to);
  const [q, setQ] = useState("");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [status, setStatus] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busId, setBusId] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(initial != null);
  const reqId = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const started = useRef(false);

  function load(next: {
    kind?: SchoolReportKind;
    slice?: SchoolFinanceSlice;
    period?: ReportPeriod;
    from?: string;
    to?: string;
    q?: string;
    levelId?: string;
    classId?: string;
    streamId?: string;
    status?: string;
    academicYearId?: string;
    categoryId?: string;
    busId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const id = ++reqId.current;
    const payload = {
      kind: next.kind ?? kind,
      slice: next.slice ?? slice,
      period: next.period ?? period,
      from: next.from ?? from,
      to: next.to ?? to,
      q: next.q ?? q,
      levelId: next.levelId ?? levelId,
      classId: next.classId ?? classId,
      streamId: next.streamId ?? streamId,
      status: next.status ?? status,
      academicYearId: next.academicYearId ?? academicYearId,
      categoryId: next.categoryId ?? categoryId,
      busId: next.busId ?? busId,
      page: next.page ?? 1,
      pageSize: next.pageSize ?? workspace.page.pageSize,
    };
    setBusy(true);
    void loadSchoolReportsWorkspaceAction(payload).then((result) => {
      if (id !== reqId.current) return;
      setBusy(false);
      setReady(true);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setWorkspace(result.workspace);
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initial?.ok && !controlledKind) return;
    queueMicrotask(() => {
      load({
        kind: controlledKind ?? kind,
        period: controlledPeriod ?? period,
        from: controlledFrom ?? from,
        to: controlledTo ?? to,
        page: 1,
      });
    });
    // Initial/embedded load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kinds = SCHOOL_REPORT_DEFS.filter((item) => workspace.available.includes(item.id));
  const waiting = (pending && !ready) || busy;
  const showEmpty = ready && !busy && workspace.rows.length === 0 && !error;

  return (
    <div className={cn("min-w-0 max-w-full space-y-5", embedded ? "pb-4" : "pb-10")}>
      {embedded ? null : (
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Reports</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">School performance, finance and operational reports.</p>
        </header>
      )}
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {kinds.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setKind(item.id);
              load({ kind: item.id, page: 1 });
            }}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-semibold transition duration-200",
              kind === item.id
                ? "bg-navy text-white shadow-[0_6px_16px_rgba(11,34,68,0.16)]"
                : "border border-white/80 bg-white/70 text-navy hover:bg-white",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load({ page: 1, q });
        }}
      >
        {kind === "finance" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[9rem]")}
            value={slice}
            onChange={(event) => {
              const next = event.target.value as SchoolFinanceSlice;
              setSlice(next);
              load({ slice: next, page: 1 });
            }}
          >
            <option value="all">All</option>
            <option value="fees">Fees & Payments</option>
            <option value="expenses">Expenses</option>
          </select>
        ) : null}
        {kind === "students" || kind === "parents" ? null : (
        <select
          className={cn(filterClass, "w-auto min-w-[9rem]")}
          value={period}
          onChange={(event) => {
            const next = event.target.value as ReportPeriod;
            setPeriod(next);
            load({ period: next, page: 1 });
          }}
        >
          {REPORT_PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        )}
        {kind !== "students" && kind !== "parents" && period === "custom" ? (
          <>
            <input
              type="date"
              className={cn(filterClass, "w-auto")}
              value={from}
              onChange={(event) => {
                const next = event.target.value;
                setFrom(next);
                if (next && to) load({ period: "custom", from: next, to, page: 1 });
              }}
            />
            <input
              type="date"
              className={cn(filterClass, "w-auto")}
              value={to}
              onChange={(event) => {
                const next = event.target.value;
                setTo(next);
                if (from && next) load({ period: "custom", from, to: next, page: 1 });
              }}
            />
          </>
        ) : null}
        {workspace.years.length && (kind === "finance" || kind === "admissions" || kind === "students") ? (
          <select
            className={cn(filterClass, "w-auto min-w-[9rem]")}
            value={academicYearId}
            onChange={(event) => {
              const next = event.target.value;
              setAcademicYearId(next);
              load({ academicYearId: next, page: 1 });
            }}
          >
            <option value="">All years</option>
            {workspace.years.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        ) : null}
        {kind !== "transport" ? (
          <>
            <select
              className={cn(filterClass, "w-auto min-w-[8rem]")}
              value={levelId}
              onChange={(event) => {
                const next = event.target.value;
                setLevelId(next);
                setClassId("");
                setStreamId("");
                load({ levelId: next, classId: "", streamId: "", page: 1 });
              }}
            >
              <option value="">All Levels</option>
              {workspace.levels.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <select
              className={cn(filterClass, "w-auto min-w-[8rem]")}
              value={classId}
              disabled={!levelId}
              onChange={(event) => {
                const next = event.target.value;
                setClassId(next);
                setStreamId("");
                load({ classId: next, streamId: "", page: 1 });
              }}
            >
              <option value="">All Classes</option>
              {workspace.classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <select
              className={cn(filterClass, "w-auto min-w-[8rem]")}
              value={streamId}
              disabled={!classId}
              onChange={(event) => {
                const next = event.target.value;
                setStreamId(next);
                load({ streamId: next, page: 1 });
              }}
            >
              <option value="">All Streams</option>
              {workspace.streams.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {kind === "admissions" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]")}
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next);
              load({ status: next, page: 1 });
            }}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ) : null}
        {kind === "students" || (kind === "finance" && slice !== "expenses") ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]")}
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next);
              load({ status: next, page: 1 });
            }}
          >
            <option value="">All statuses</option>
            {kind === "students" ? (
              <>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </>
            ) : (
              <>
                <option value="outstanding">Outstanding</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="no_structure">No structure</option>
              </>
            )}
          </select>
        ) : null}
        {(kind === "finance" && slice === "expenses") || kind === "transport" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]")}
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next);
              load({ status: next, page: 1 });
            }}
          >
            <option value="">Posted & reversed</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </select>
        ) : null}
        {kind === "finance" && slice === "expenses" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]")}
            value={categoryId}
            onChange={(event) => {
              const next = event.target.value;
              setCategoryId(next);
              load({ categoryId: next, page: 1 });
            }}
          >
            <option value="">All types</option>
            {workspace.expenseTypes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        ) : null}
        {(kind === "finance" && slice === "expenses") || kind === "transport" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]")}
            value={busId}
            onChange={(event) => {
              const next = event.target.value;
              setBusId(next);
              load({ busId: next, page: 1 });
            }}
          >
            <option value="">{kind === "transport" ? "All Buses" : "All buses"}</option>
            {workspace.buses.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          className={cn(filterClass, "min-w-[12rem] flex-1")}
          value={q}
          placeholder="Search"
          onChange={(event) => {
            const next = event.target.value;
            setQ(next);
            if (searchTimer.current) window.clearTimeout(searchTimer.current);
            searchTimer.current = window.setTimeout(() => load({ q: next, page: 1 }), 220);
          }}
        />
        <SchoolWorkflowButton
          className={primaryButton}
          busy={exporting}
          idleLabel="Export PDF"
          onClick={() => {
            if (exporting) return;
            setExporting(true);
            void loadSchoolReportsWorkspaceAction({
              kind,
              slice,
              period,
              from,
              to,
              q,
              levelId,
              classId,
              streamId,
              status,
              academicYearId,
              categoryId,
              busId,
              page: 1,
              exportAll: true,
            }).then(async (result) => {
              setExporting(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              await exportSchoolReportPdf(result.workspace);
            });
          }}
        />
      </form>

      {workspace.cards.length ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workspace.cards.map((card) => (
            <div key={card.label} className={cn(glassPanel, "px-4 py-4")}>
              <p className="text-[12px] font-medium text-slate-500">{card.label}</p>
              <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-navy">{card.value}</p>
              {card.hint ? <p className="mt-1 text-[12px] text-slate-400">{card.hint}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {showEmpty ? (
        <section className={cn(glassPanel, "flex flex-col items-start gap-3 py-10")}>
          <SchoolIconWell icon={FileDown} />
          <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No matching records</h2>
          <p className="text-[13.5px] text-slate-500">No live School records match the selected report filters.</p>
        </section>
      ) : workspace.rows.length || waiting ? (
        <section className={cn(glassPanel, busy && "opacity-80 transition-opacity duration-200")}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  {workspace.columns.map((col) => (
                    <th key={col.key} className={cn("px-4 py-3 font-semibold", col.align === "right" && "text-right")}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.rows.map((row, index) => (
                  <tr key={`${workspace.kind}-${index}`} className="border-t border-navy/5 text-[13.5px] text-navy">
                    {workspace.columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3", col.align === "right" && "text-right")}>
                        {row[col.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SchoolPagination
            page={workspace.page.page}
            total={workspace.page.total}
            pageSize={workspace.page.pageSize}
            onPage={(next) => load({ page: next, pageSize: workspace.page.pageSize })}
            onPageSize={(size) => load({ page: 1, pageSize: size })}
          />
        </section>
      ) : null}
    </div>
  );
}
