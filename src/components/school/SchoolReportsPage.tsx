"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
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
  defaultSchoolReportInput,
  loadSchoolReportCached,
  peekSchoolReportCache,
  prefetchSchoolReport,
  rememberSchoolReportResult,
  SCHOOL_REPORT_RESET_FILTERS,
} from "@/lib/school/report-cache";
import {
  SCHOOL_REPORT_DEFS,
  type SchoolFinanceSlice,
  type SchoolReportKind,
  type SchoolReportWorkspace,
} from "@/lib/school/report-types";
import { exportSchoolReportPdf } from "@/lib/school/school-reports-pdf";
import { schoolPageMeta } from "@/lib/school/pagination";
import { peekSchoolReportSnapshot } from "@/lib/school/report-flash";

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

type ReportLoadInput = {
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
};

function syncReportKind(kind: SchoolReportKind | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (kind) url.searchParams.set("kind", kind);
  else url.searchParams.delete("kind");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function clientNav(event: MouseEvent) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}

function bootWorkspace(kind: SchoolReportKind | null | undefined, initial: SchoolReportsWorkspaceResult | null) {
  if (initial?.ok) return initial.workspace;
  if (kind) {
    const cached = peekSchoolReportCache(defaultSchoolReportInput(kind)) ?? peekSchoolReportSnapshot(kind);
    if (cached) return cached;
  }
  return emptyWorkspace(kind ?? "finance");
}

export function SchoolReportsPage({
  initial,
  initialKind = null,
  embedded = false,
  controlledKind,
  controlledPeriod,
  controlledFrom,
  controlledTo,
}: {
  initial: SchoolReportsWorkspaceResult | null;
  initialKind?: SchoolReportKind | null;
  pending?: boolean;
  embedded?: boolean;
  controlledKind?: SchoolReportKind;
  controlledPeriod?: ReportPeriod;
  controlledFrom?: string;
  controlledTo?: string;
}) {
  const bootKind = controlledKind ?? initialKind ?? (initial?.ok ? initial.workspace.kind : null);
  const first = bootWorkspace(bootKind, initial);
  const [selected, setSelected] = useState<SchoolReportKind | null>(controlledKind ?? bootKind ?? null);
  const [opening, setOpening] = useState<SchoolReportKind | null>(null);
  const [workspace, setWorkspace] = useState<SchoolReportWorkspace>(first);
  const [error, setError] = useState<string | null>(initial?.ok === false ? initial.error : null);
  const [kind, setKind] = useState<SchoolReportKind>(bootKind ?? first.kind);
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
  const [requested, setRequested] = useState<ReportLoadInput | null>(null);
  const [busy, setBusy] = useState(Boolean(bootKind) && first.rows.length === 0 && !initial?.ok);
  const [exporting, setExporting] = useState(false);
  const reqId = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const started = useRef(false);
  const selectedRef = useRef<SchoolReportKind | null>(controlledKind ?? bootKind ?? null);

  function commitFilters(payload: ReportLoadInput) {
    if (payload.kind) setKind(payload.kind);
    if (payload.slice) setSlice(payload.slice);
    if (payload.period) setPeriod(payload.period);
    if (payload.from != null) setFrom(payload.from);
    if (payload.to != null) setTo(payload.to);
    if (payload.levelId != null) setLevelId(payload.levelId);
    if (payload.classId != null) setClassId(payload.classId);
    if (payload.streamId != null) setStreamId(payload.streamId);
    if (payload.status != null) setStatus(payload.status);
    if (payload.academicYearId != null) setAcademicYearId(payload.academicYearId);
    if (payload.categoryId != null) setCategoryId(payload.categoryId);
    if (payload.busId != null) setBusId(payload.busId);
  }

  function reveal(result: SchoolReportsWorkspaceResult, payload: ReportLoadInput) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpening(null);
    selectedRef.current = result.workspace.kind;
    setSelected(result.workspace.kind);
    setOpening(null);
    setError(null);
    commitFilters(payload);
    setWorkspace(result.workspace);
    if (!embedded && !controlledKind) syncReportKind(result.workspace.kind);
  }

  function load(next: ReportLoadInput = {}, cached?: Promise<SchoolReportsWorkspaceResult>) {
    const id = ++reqId.current;
    const payload: ReportLoadInput = {
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
      pageSize: next.pageSize ?? (next.kind && next.kind !== workspace.kind ? undefined : workspace.page.pageSize),
    };
    setRequested(payload);
    setBusy(true);
    const request = cached ?? loadSchoolReportCached(payload);
    void request.then((result) => {
      if (id !== reqId.current) return;
      setBusy(false);
      setRequested(null);
      if (!controlledKind && selectedRef.current === null) return;
      if (selectedRef.current && result.ok && result.workspace.kind !== selectedRef.current) return;
      reveal(result, payload);
    });
  }

  function openReport(next: SchoolReportKind) {
    const payload: ReportLoadInput = { kind: next, period: "this-month", ...SCHOOL_REPORT_RESET_FILTERS };
    selectedRef.current = next;
    setSelected(next);
    setKind(next);
    setOpening(null);
    setQ("");
    setError(null);
    commitFilters(payload);
    if (!embedded && !controlledKind) syncReportKind(next);
    const cached =
      peekSchoolReportCache(payload) ?? peekSchoolReportSnapshot(next);
    if (cached) {
      setWorkspace(cached);
      setBusy(false);
      setRequested(null);
      return;
    }
    setWorkspace((prev) => (prev.kind === next && prev.rows.length ? prev : emptyWorkspace(next)));
    load(payload, prefetchSchoolReport(next));
  }

  function backToReports() {
    reqId.current += 1;
    selectedRef.current = null;
    setSelected(null);
    setOpening(null);
    setBusy(false);
    setRequested(null);
    setExporting(false);
    setError(null);
    if (!embedded && !controlledKind) syncReportKind(null);
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
    if (initial?.ok) rememberSchoolReportResult(initial);
    if (started.current) return;
    started.current = true;
    const boot = controlledKind ?? bootKind;
    if (!boot) return;
    if (initial?.ok && initial.workspace.kind === boot) return;
    if (first.rows.length > 0 && first.kind === boot && !controlledKind) return;
    queueMicrotask(() => {
      load({
        kind: boot,
        period: controlledPeriod ?? period,
        from: controlledFrom ?? from,
        to: controlledTo ?? to,
        page: 1,
      });
    });
    // Boot load only.
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
  const showEmpty = currentView && !busy && workspace.rows.length === 0 && !error;
  const pendingRing = (key: keyof ReportLoadInput, value: string) =>
    requested?.[key] != null && String(requested[key]) !== value ? "ring-1 ring-navy/20" : null;

  if (showSelection) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Reports</h1>
          <p className="mt-1 max-w-[42rem] text-[13.5px] leading-5 text-slate-500">
            Choose a report to open live School records. Nothing is loaded until you select one.
          </p>
        </header>
        {error ? (
          <p className="text-[13px] text-[#c45b66]">
            {error}{" "}
            {opening ? (
              <button type="button" className="font-semibold underline" onClick={() => openReport(opening)}>
                Retry
              </button>
            ) : null}
          </p>
        ) : null}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {REPORT_CARDS.map((card) => {
            const meta = SCHOOL_REPORT_DEFS.find((item) => item.id === card.id);
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                href={`/school/reports?kind=${card.id}`}
                prefetch
                onPointerEnter={() => {
                  void prefetchSchoolReport(card.id);
                }}
                onPointerDown={() => {
                  void prefetchSchoolReport(card.id);
                }}
                onFocus={() => {
                  void prefetchSchoolReport(card.id);
                }}
                onClick={(event) => {
                  if (!clientNav(event)) return;
                  event.preventDefault();
                  openReport(card.id);
                }}
                className={cn(
                  glassCard,
                  "group relative flex min-h-[168px] flex-col items-start px-5 py-5 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
                )}
              >
                <SchoolIconWell icon={Icon} />
                <p className="mt-4 text-[16px] font-semibold tracking-[-0.03em] text-navy">{meta?.label ?? card.id}</p>
                <p className="mt-1 pr-6 text-[13px] leading-5 text-slate-500">{card.blurb}</p>
                <ChevronRight className="pointer-events-none absolute right-5 top-5 h-4 w-4 text-slate-300 transition duration-200 group-hover:text-navy" />
              </Link>
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
            <Link
              href="/school/reports"
              prefetch
              className={cn(secondaryButton, "mb-3 h-9 gap-1.5 px-3 text-[13px]")}
              onClick={(event) => {
                if (!clientNav(event)) return;
                event.preventDefault();
                backToReports();
              }}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Back to Reports
            </Link>
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{def?.label ?? "Report"}</h1>
            <p className="mt-1 max-w-[42rem] text-[13.5px] leading-5 text-slate-500">{def?.description}</p>
          </div>
          <SchoolWorkflowButton className={primaryButton} busy={exporting} idleLabel="Export PDF" onClick={exportCurrent} />
        </header>
      )}
      {error ? (
        <p className="text-[13px] text-[#c45b66]">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => load({ page: workspace.page.page })}>
            Retry
          </button>
        </p>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load({ page: 1, q });
        }}
      >
        {kind === "finance" ? (
          <select
            className={cn(filterClass, "w-auto min-w-[9rem]", pendingRing("slice", slice))}
            value={slice}
            onChange={(event) => {
              const next = event.target.value as SchoolFinanceSlice;
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
            className={cn(filterClass, "w-auto min-w-[9rem]", pendingRing("period", period))}
            value={period}
            onChange={(event) => {
              const next = event.target.value as ReportPeriod;
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
            className={cn(filterClass, "w-auto min-w-[9rem]", pendingRing("academicYearId", academicYearId))}
            value={academicYearId}
            onChange={(event) => {
              load({ academicYearId: event.target.value, page: 1 });
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
              className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("levelId", levelId))}
              value={levelId}
              onChange={(event) => {
                load({ levelId: event.target.value, classId: "", streamId: "", page: 1 });
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
              className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("classId", classId))}
              value={classId}
              disabled={!levelId}
              onChange={(event) => {
                load({ classId: event.target.value, streamId: "", page: 1 });
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
              className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("streamId", streamId))}
              value={streamId}
              disabled={!classId}
              onChange={(event) => {
                load({ streamId: event.target.value, page: 1 });
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
            className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("status", status))}
            value={status}
            onChange={(event) => {
              load({ status: event.target.value, page: 1 });
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
            className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("status", status))}
            value={status}
            onChange={(event) => {
              load({ status: event.target.value, page: 1 });
            }}
          >
            <option value="">All statuses</option>
            {kind === "students" ? (
              <>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="withdrawn">Withdrawn</option>
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
            className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("status", status))}
            value={status}
            onChange={(event) => {
              load({ status: event.target.value, page: 1 });
            }}
          >
            <option value="">Posted & reversed</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </select>
        ) : null}
        {financeExpenses ? (
          <select
            className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("categoryId", categoryId))}
            value={categoryId}
            onChange={(event) => {
              load({ categoryId: event.target.value, page: 1 });
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
            className={cn(filterClass, "w-auto min-w-[8rem]", pendingRing("busId", busId))}
            value={busId}
            onChange={(event) => {
              load({ busId: event.target.value, page: 1 });
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
      ) : currentView && workspace.rows.length ? (
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
