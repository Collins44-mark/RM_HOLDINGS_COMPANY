"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bus,
  ChevronRight,
  FileDown,
  GraduationCap,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  loadSchoolReportsWorkspaceAction,
  type SchoolReportsWorkspaceResult,
} from "@/actions/school/reports";
import { SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import {
  filterClass,
  glassCard,
  glassPanel,
  primaryButton,
  secondaryButton,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import {
  SCHOOL_REPORT_DEFS,
  type SchoolFinanceSlice,
  type SchoolReportKind,
  type SchoolReportWorkspace,
} from "@/lib/school/report-types";
import { exportSchoolReportPdf } from "@/lib/school/school-reports-pdf";
import { schoolPageMeta } from "@/lib/school/pagination";

const REPORT_CARDS: Array<{ id: SchoolReportKind; icon: LucideIcon; blurb: string }> = [
  { id: "finance", icon: Wallet, blurb: "Fees, collections, expenses and salaries for the selected period." },
  { id: "admissions", icon: UserPlus, blurb: "Admission records by status, year, level and class." },
  { id: "students", icon: GraduationCap, blurb: "Registered students with level, class, stream and status." },
  { id: "parents", icon: Users, blurb: "Guardians and their linked students." },
  { id: "transport", icon: Bus, blurb: "Posted fuel and maintenance expenses by bus." },
];

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

const RESET_FILTERS = {
  slice: "all" as SchoolFinanceSlice,
  q: "",
  levelId: "",
  classId: "",
  streamId: "",
  status: "",
  academicYearId: "",
  categoryId: "",
  busId: "",
  page: 1,
};

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
  const [selected, setSelected] = useState<SchoolReportKind | null>(controlledKind ?? null);
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
  const [busy, setBusy] = useState(Boolean(controlledKind) && !initial?.ok);
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(initial != null && Boolean(controlledKind || initial?.ok));
  const reqId = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const started = useRef(false);
  const selectedRef = useRef<SchoolReportKind | null>(controlledKind ?? null);

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
      if (!controlledKind && selectedRef.current === null) return;
      if (selectedRef.current && result.ok && result.workspace.kind !== selectedRef.current) return;
      setReady(true);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setWorkspace(result.workspace);
    });
  }

  function openReport(next: SchoolReportKind) {
    selectedRef.current = next;
    setSelected(next);
    setKind(next);
    setSlice("all");
    setQ("");
    setLevelId("");
    setClassId("");
    setStreamId("");
    setStatus("");
    setAcademicYearId("");
    setCategoryId("");
    setBusId("");
    setError(null);
    setReady(false);
    setWorkspace(emptyWorkspace(next));
    load({ kind: next, ...RESET_FILTERS });
  }

  function backToReports() {
    reqId.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setBusy(false);
    setExporting(false);
    setError(null);
    setReady(false);
  }

  function exportCurrent() {
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
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!controlledKind) return;
    queueMicrotask(() => {
      load({
        kind: controlledKind,
        period: controlledPeriod ?? period,
        from: controlledFrom ?? from,
        to: controlledTo ?? to,
        page: 1,
      });
    });
    // Embedded load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const def = SCHOOL_REPORT_DEFS.find((item) => item.id === (selected ?? kind));
  const showSelection = !embedded && !controlledKind && selected === null;
  const financeFees = kind === "finance" && slice !== "expenses" && slice !== "salaries";
  const financeExpenses = kind === "finance" && slice === "expenses";
  const showPeriod = kind === "finance" || kind === "admissions" || kind === "transport";
  const showYear = kind === "admissions" || kind === "students" || financeFees;
  const showPlacement = kind === "admissions" || kind === "students" || kind === "parents" || financeFees;
  const currentView = Boolean(selected || controlledKind) && workspace.kind === (selected ?? kind);
  const waiting = ((pending && Boolean(controlledKind) && !ready) || busy) && currentView;
  const showEmpty = currentView && ready && !busy && workspace.rows.length === 0 && !error;

  if (showSelection) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Reports</h1>
          <p className="mt-1 max-w-[42rem] text-[13.5px] leading-5 text-slate-500">
            Choose a report to open live School records. Nothing is loaded until you select one.
          </p>
        </header>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {REPORT_CARDS.map((card) => {
            const meta = SCHOOL_REPORT_DEFS.find((item) => item.id === card.id);
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => openReport(card.id)}
                className={cn(
                  glassCard,
                  "group relative flex min-h-[168px] flex-col items-start px-5 py-5 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
                )}
              >
                <SchoolIconWell icon={Icon} />
                <p className="mt-4 text-[16px] font-semibold tracking-[-0.03em] text-navy">{meta?.label ?? card.id}</p>
                <p className="mt-1 pr-6 text-[13px] leading-5 text-slate-500">{card.blurb}</p>
                <ChevronRight className="pointer-events-none absolute right-5 top-5 h-4 w-4 text-slate-300 transition duration-200 group-hover:text-navy" />
              </button>
            );
          })}
        </section>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 max-w-full space-y-5", embedded ? "pb-4" : "pb-10")}>
      {embedded ? null : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" className={cn(secondaryButton, "mb-3 h-9 gap-1.5 px-3 text-[13px]")} onClick={backToReports}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Back to Reports
            </button>
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{def?.label ?? "Report"}</h1>
            <p className="mt-1 max-w-[42rem] text-[13.5px] leading-5 text-slate-500">{def?.description}</p>
          </div>
          <SchoolWorkflowButton className={primaryButton} busy={exporting} idleLabel="Export PDF" onClick={exportCurrent} />
        </header>
      )}
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

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
              setStatus("");
              setCategoryId("");
              setBusId("");
              setWorkspace((current) => ({ ...emptyWorkspace(kind), years: current.years, levels: current.levels, buses: current.buses, expenseTypes: current.expenseTypes }));
              load({ slice: next, status: "", categoryId: "", busId: "", page: 1 });
            }}
          >
            <option value="all">All</option>
            <option value="fees">Fees & Payments</option>
            <option value="expenses">Expenses</option>
            <option value="salaries">Salaries</option>
          </select>
        ) : null}
        {showPeriod ? (
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
        ) : null}
        {showPeriod && period === "custom" ? (
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
        {showYear && workspace.years.length ? (
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
        {showPlacement ? (
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
        {kind === "students" || financeFees ? (
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
        {financeExpenses || kind === "transport" ? (
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
        {financeExpenses ? (
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
        {financeExpenses || kind === "transport" ? (
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
          placeholder={kind === "parents" ? "Search guardian or student" : "Search"}
          onChange={(event) => {
            const next = event.target.value;
            setQ(next);
            if (searchTimer.current) window.clearTimeout(searchTimer.current);
            searchTimer.current = window.setTimeout(() => load({ q: next, page: 1 }), 220);
          }}
        />
        {embedded ? (
          <SchoolWorkflowButton className={primaryButton} busy={exporting} idleLabel="Export PDF" onClick={exportCurrent} />
        ) : null}
      </form>

      {currentView && workspace.cards.length ? (
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
      ) : currentView && (workspace.rows.length || waiting) ? (
        <section className={cn(glassPanel, busy && "opacity-80 transition-opacity duration-200")}>
          <div className={tableScrollClass}>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className={tableHead}>
                  {(workspace.columns.length ? workspace.columns : [{ key: "loading", label: "Records" }]).map((col) => (
                    <th key={col.key} className={cn("px-4 py-3 font-semibold", col.align === "right" && "text-right")}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workspace.rows.length ? (
                  workspace.rows.map((row, index) => (
                    <tr key={`${workspace.kind}-${index}`} className="border-t border-navy/5 text-[13.5px] text-navy">
                      {workspace.columns.map((col) => (
                        <td key={col.key} className={cn("px-4 py-3", col.align === "right" && "text-right")}>
                          {row[col.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-navy/5">
                    <td className="px-4 py-6 text-[13px] text-slate-500" colSpan={Math.max(workspace.columns.length, 1)}>
                      Loading report…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {workspace.rows.length ? (
            <SchoolPagination
              page={workspace.page.page}
              total={workspace.page.total}
              pageSize={workspace.page.pageSize}
              onPage={(next) => load({ page: next, pageSize: workspace.page.pageSize })}
              onPageSize={(size) => load({ page: 1, pageSize: size })}
            />
          ) : null}
          {busy && workspace.rows.length ? <p className="px-4 pb-3 text-[12.5px] text-slate-500">Updating…</p> : null}
        </section>
      ) : waiting ? (
        <p className="text-[12.5px] text-slate-500">Loading report…</p>
      ) : null}
    </div>
  );
}
