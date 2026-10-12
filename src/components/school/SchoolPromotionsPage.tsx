"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, LayoutGrid } from "lucide-react";
import {
  confirmSchoolPromotionsAction,
  loadSchoolPromotionBoardAction,
  loadSchoolPromotionHistoryAction,
  previewSchoolPromotionsAction,
  type ProgressionOutcome,
  type PromotionClassCard,
  type PromotionHistoryRow,
  type PromotionPreviewStudent,
} from "@/actions/school/lifecycle";
import { glassCard, glassPanel, inputClass, primaryButton, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { SCHOOL_PAGE_SIZE, schoolPageMeta } from "@/lib/school/pagination";
import { formatCompactStudentNumber } from "@/lib/school/student-number";
import { cn } from "@/lib/cn";

type YearOption = { id: string; name: string; isCurrent: boolean };
type DestClass = { id: string; name: string; levelId: string; feeConfigured: boolean; annualAmount: number | null; subjects: string[] };

type DraftRow = PromotionPreviewStudent & {
  outcome: ProgressionOutcome;
  destLevelId: string;
  destClassId: string;
  destStreamId: string;
  reason: string;
};

const OUTCOMES: Array<{ id: ProgressionOutcome; label: string }> = [
  { id: "PROMOTE", label: "Promote" },
  { id: "RETAIN", label: "Keep in class" },
  { id: "TRANSFER", label: "Transfer" },
  { id: "GRADUATE", label: "Graduate / complete" },
  { id: "EXCLUDE", label: "Exclude" },
];

function outcomeLabel(value: string) {
  if (value === "PROMOTE") return "Promoted";
  if (value === "RETAIN") return "Kept in class";
  if (value === "TRANSFER") return "Transferred";
  if (value === "GRADUATE") return "Graduated / completed";
  return value;
}

function toDraft(student: PromotionPreviewStudent): DraftRow {
  return {
    ...student,
    outcome: student.canPromote ? student.suggestedOutcome : student.suggestedOutcome === "PROMOTE" ? "RETAIN" : student.suggestedOutcome,
    destLevelId: student.suggestedLevelId || student.levelId,
    destClassId: student.canPromote ? student.suggestedClassId : student.classId,
    destStreamId: "",
    reason: "",
  };
}

function rowValidation(row: DraftRow) {
  if (row.outcome === "PROMOTE" && !row.canPromote) return "Promote is unavailable because no next class is configured.";
  if (row.outcome === "EXCLUDE" || row.outcome === "GRADUATE") return "";
  const destClassId = row.outcome === "RETAIN" ? row.classId : row.destClassId;
  if (!destClassId) return "Select a destination class.";
  return "";
}

type PreviewBundle = {
  rows: DraftRow[];
  destClasses: DestClass[];
  streams: Array<{ id: string; name: string; classId: string }>;
  levels: Array<{ id: string; name: string }>;
  fromYearName: string;
  toYearName: string;
  alreadyInTarget: number;
};

function previewKey(fromYearId: string, toYearId: string, classId: string) {
  return `${fromYearId}|${toYearId}|${classId}`;
}

function SkeletonBar({ className }: { className: string }) {
  return (
    <span
      className={cn("inline-block rounded-md bg-slate-200/75 motion-safe:animate-pulse motion-reduce:animate-none", className)}
      aria-hidden
    />
  );
}

function PromotionStudentSkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index} className="border-t border-navy/5">
          <td className="px-3 py-3">
            <SkeletonBar className="h-3.5 w-36" />
            <SkeletonBar className="mt-1.5 h-3 w-16" />
          </td>
          <td className="px-3 py-3">
            <SkeletonBar className="h-3.5 w-40" />
          </td>
          <td className="px-3 py-3">
            <SkeletonBar className="h-12 w-full rounded-[14px]" />
          </td>
          <td className="px-3 py-3">
            <div className="flex min-w-[16rem] flex-col gap-2">
              <SkeletonBar className="h-12 w-full rounded-[14px]" />
              <SkeletonBar className="h-12 w-full rounded-[14px]" />
            </div>
          </td>
          <td className="px-3 py-3">
            <SkeletonBar className="h-12 w-full rounded-[14px]" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function SchoolPromotionsPage({
  years: initialYears,
  today,
  canManage,
  error,
  pending = false,
}: {
  years: YearOption[];
  today: string;
  canManage: boolean;
  error: string | null;
  pending?: boolean;
}) {
  const [panel, setPanel] = useState<"students" | "history">("students");
  const [years] = useState(initialYears);
  const [fromYearId, setFromYearId] = useState(initialYears.find((row) => row.isCurrent)?.id ?? initialYears[0]?.id ?? "");
  const [toYearId, setToYearId] = useState(initialYears.find((row) => !row.isCurrent)?.id ?? "");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [cards, setCards] = useState<PromotionClassCard[]>([]);
  const [selectedClass, setSelectedClass] = useState<PromotionClassCard | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SCHOOL_PAGE_SIZE);
  const [destClasses, setDestClasses] = useState<DestClass[]>([]);
  const [streams, setStreams] = useState<Array<{ id: string; name: string; classId: string }>>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [fromYearName, setFromYearName] = useState("");
  const [toYearName, setToYearName] = useState("");
  const [alreadyInTarget, setAlreadyInTarget] = useState(0);
  const [history, setHistory] = useState<PromotionHistoryRow[]>([]);
  const [saveError, setSaveError] = useState<string | null>(error);
  const [success, setSuccess] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const previewSeq = useRef(0);
  const previewCache = useRef(new Map<string, PreviewBundle>());
  const selectedClassId = selectedClass?.id ?? "";
  const selectedKey = selectedClass ? previewKey(fromYearId, toYearId, selectedClass.id) : "";

  function loadBoard(nextFrom = fromYearId, nextTo = toYearId) {
    if (!nextFrom) return;
    void loadSchoolPromotionBoardAction({ fromYearId: nextFrom, toYearId: nextTo }).then((next) => {
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      setCards(next.classes);
      setFromYearName(next.fromYearName);
      setToYearName(next.toYearName);
      setSaveError(null);
    });
  }

  useEffect(() => {
    if (pending || !fromYearId) return;
    let cancelled = false;
    void loadSchoolPromotionBoardAction({ fromYearId, toYearId }).then((next) => {
      if (cancelled) return;
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      setCards(next.classes);
      setFromYearName(next.fromYearName);
      setToYearName(next.toYearName);
      setSaveError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pending, fromYearId, toYearId]);

  function patchRow(studentId: string, patch: Partial<DraftRow>) {
    setRowErrors((current) => {
      if (!current[studentId]) return current;
      const next = { ...current };
      delete next[studentId];
      return next;
    });
    setRows((current) => current.map((item) => (item.studentId === studentId ? { ...item, ...patch } : item)));
  }

  function applyBundle(bundle: PreviewBundle) {
    setRows(bundle.rows);
    setDestClasses(bundle.destClasses);
    setStreams(bundle.streams);
    setLevels(bundle.levels);
    setFromYearName(bundle.fromYearName);
    setToYearName(bundle.toYearName);
    setAlreadyInTarget(bundle.alreadyInTarget);
  }

  function storeBundle(key: string, bundle: PreviewBundle) {
    previewCache.current.set(key, bundle);
    applyBundle(bundle);
  }

  function fetchPreview(card: PromotionClassCard, force = false) {
    if (!fromYearId || !toYearId) return;
    const key = previewKey(fromYearId, toYearId, card.id);
    previewSeq.current += 1;
    const seq = previewSeq.current;
    const cached = !force ? previewCache.current.get(key) : undefined;
    setLoadError(null);
    setRowErrors({});
    setPage(1);
    requestId.current = crypto.randomUUID();
    if (cached) {
      applyBundle(cached);
      setLoadingPreview(false);
      return;
    }
    setRows([]);
    setLoadingPreview(true);
    void previewSchoolPromotionsAction({ fromYearId, toYearId, classId: card.id }).then((next) => {
      if (seq !== previewSeq.current) return;
      setLoadingPreview(false);
      if (!next.ok) {
        setLoadError(next.error);
        return;
      }
      storeBundle(key, {
        rows: next.students.map(toDraft),
        destClasses: next.classes,
        streams: next.streams,
        levels: next.levels,
        fromYearName: next.fromYearName,
        toYearName: next.toYearName,
        alreadyInTarget: next.alreadyInTarget,
      });
    });
  }

  function openClass(card: PromotionClassCard) {
    if (!fromYearId || !toYearId || saving) return;
    setSaveError(null);
    setSuccess(null);
    setSelectedClass(card);
    setPanel("students");
    setHistory([]);
    fetchPreview(card);
  }

  function closeClass() {
    if (saving) return;
    previewSeq.current += 1;
    if (selectedClass && !loadingPreview && !loadError) {
      previewCache.current.set(selectedKey, {
        rows,
        destClasses,
        streams,
        levels,
        fromYearName,
        toYearName,
        alreadyInTarget,
      });
    }
    setSelectedClass(null);
    setLoadingPreview(false);
    setLoadError(null);
    setRows([]);
    setHistory([]);
    setPanel("students");
    setRowErrors({});
    loadBoard();
  }

  const pageMeta = schoolPageMeta(page, rows.length, pageSize);
  const visibleRows = rows.slice((pageMeta.page - 1) * pageSize, pageMeta.page * pageSize);

  const counts = useMemo(() => {
    const tally = { PROMOTE: 0, RETAIN: 0, TRANSFER: 0, GRADUATE: 0, EXCLUDE: 0 };
    for (const row of rows) tally[row.outcome] += 1;
    return tally;
  }, [rows]);

  function destinationLabel(row: DraftRow) {
    if (row.outcome === "EXCLUDE") return "Excluded from this run";
    if (row.outcome === "GRADUATE") return "Graduated / completed — no new enrollment";
    const destClass = destClasses.find((item) => item.id === (row.outcome === "RETAIN" ? row.classId : row.destClassId));
    const destLevel = levels.find((item) => item.id === (row.outcome === "RETAIN" ? row.levelId : row.destLevelId));
    const destStream = streams.find((item) => item.id === row.destStreamId);
    return `${toYearName} · ${destLevel?.name || "—"} · ${destClass?.name || "—"} · ${destStream?.name || "No stream"}`;
  }

  function loadHistory() {
    if (!selectedClass || !fromYearId || historyBusy) return;
    setHistoryBusy(true);
    void loadSchoolPromotionHistoryAction({ fromYearId, classId: selectedClass.id }).then((next) => {
      setHistoryBusy(false);
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      setHistory(next.history);
      setPanel("history");
    });
  }

  function validateAndSave() {
    if (saving || lock.current || loadingPreview || loadError || !canManage || !selectedClass || !rows.length) return;
    const nextErrors: Record<string, string> = {};
    for (const row of rows) {
      const message = rowValidation(row);
      if (message) nextErrors[row.studentId] = message;
    }
    if (Object.keys(nextErrors).length) {
      setRowErrors(nextErrors);
      setSaveError("Fix the highlighted students before saving.");
      const first = rows.find((row) => nextErrors[row.studentId]);
      if (first) {
        const index = rows.findIndex((row) => row.studentId === first.studentId);
        setPage(Math.floor(index / pageSize) + 1);
      }
      return;
    }
    lock.current = true;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    void confirmSchoolPromotionsAction({
      fromYearId,
      toYearId,
      effectiveOn,
      requestId: requestId.current,
      students: rows.map((row) => ({
        studentId: row.studentId,
        outcome: row.outcome,
        levelId: row.outcome === "RETAIN" ? row.levelId : row.destLevelId,
        classId: row.outcome === "RETAIN" ? row.classId : row.destClassId,
        streamId: row.destStreamId,
        reason: row.reason,
      })),
    }).then((next) => {
      lock.current = false;
      setSaving(false);
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      requestId.current = crypto.randomUUID();
      loadBoard();
      previewCache.current.delete(previewKey(fromYearId, toYearId, selectedClass.id));
      if (next.duplicate) {
        setSaveError("This save was already processed. Review the class and try again if students remain.");
        return;
      }
      const summary = `Saved ${selectedClass.name}: ${next.promoted} promoted · ${next.retained} kept · ${next.transferred} transferred · ${next.graduated} graduated · ${next.excluded} excluded.`;
      if (next.failed) {
        const failedIds = new Set(next.failures.map((item) => item.studentId).filter(Boolean));
        const mapped: Record<string, string> = {};
        for (const item of next.failures) {
          if (item.studentId) mapped[item.studentId] = item.error || "Could not save this student.";
        }
        setRowErrors(mapped);
        setRows((current) => (failedIds.size ? current.filter((row) => failedIds.has(row.studentId)) : current));
        setSaveError(`${next.failed} student${next.failed === 1 ? "" : "s"} could not be saved. Your other selections were kept.`);
        setSuccess(null);
        return;
      }
      setRowErrors({});
      setSuccess(summary);
      fetchPreview(selectedClass, true);
    });
  }

  if (pending && !years.length) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Promotions & Academic Progression</h1>
        <p className="text-[13.5px] text-slate-500">Progression never runs automatically when the calendar year changes.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex items-start gap-3">
        <SchoolIconWell icon={GraduationCap} />
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Promotions & Academic Progression</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Open a class, set outcomes, then Validate & Save. Progression never runs automatically.</p>
        </div>
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}
      {success ? (
        <p className={cn(glassCard, "px-3.5 py-2.5 text-[13.5px] text-navy")}>{success}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SchoolField label="Current academic year">
          <select
            className={inputClass}
            value={fromYearId}
            disabled={Boolean(selectedClassId) || saving}
            onChange={(event) => {
              const next = event.target.value;
              setFromYearId(next);
              if (toYearId === next) setToYearId("");
            }}
          >
            {years.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </select>
        </SchoolField>
        <SchoolField label="Target academic year">
          <select
            className={inputClass}
            value={toYearId}
            disabled={Boolean(selectedClassId) || saving}
            onChange={(event) => setToYearId(event.target.value)}
          >
            <option value="">Select target year</option>
            {years
              .filter((row) => row.id !== fromYearId)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </SchoolField>
        <SchoolField label="Effective date">
          <input className={inputClass} type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
        </SchoolField>
      </section>
      {!canManage ? <p className="text-[13px] text-slate-500">You can review classes, but saving a run requires promotion permission.</p> : null}

      {!selectedClass ? (
        <section className="space-y-4">
          {cards.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => {
                const processed = Boolean(toYearId) && card.enrolled > 0 && card.awaiting === 0;
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={!toYearId || saving}
                    onClick={() => openClass(card)}
                    className={cn(glassCard, "px-4 py-4 text-left transition duration-200 hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-60")}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{card.levelName || "Class"}</p>
                    <p className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-navy">{card.name}</p>
                    <p className="mt-2 text-[12.5px] text-slate-500">{fromYearName || "Selected year"}</p>
                    <p className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-navy">{card.enrolled}</p>
                    <p className={cn("text-[12.5px]", processed ? "text-emerald-700" : "text-slate-500")}>
                      {card.enrolled === 1 ? "enrolled student" : "enrolled students"}
                      {toYearId ? (processed ? " · processed" : ` · ${card.awaiting} awaiting review`) : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[13.5px] text-slate-500">No classes are configured for this school yet.</p>
          )}
        </section>
      ) : (
        <section className={`${glassPanel} page-enter space-y-4`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={closeClass}
                disabled={saving}
                aria-label="Back to classes"
                className={cn(
                  glassCard,
                  "inline-flex items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold text-navy transition duration-200 hover:bg-white/88 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5b82c4]/15 disabled:opacity-60",
                )}
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/80 bg-white/55 text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                  <LayoutGrid className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                Classes
              </button>
              <p className="mt-3 text-[12.5px] text-slate-500">
                {fromYearName} → {toYearName}
              </p>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{selectedClass.name}</h2>
              <p className="mt-1 min-h-[1.25rem] text-[13px] text-slate-500">
                {loadingPreview ? (
                  <SkeletonBar className="h-3.5 w-44 align-middle" />
                ) : (
                  <>
                    {rows.length} {rows.length === 1 ? "student" : "students"} in this class
                    {alreadyInTarget ? ` · ${alreadyInTarget} already enrolled in the target year` : ""}
                  </>
                )}
              </p>
            </div>
            <button type="button" className={panel === "history" ? primaryButton : secondaryButton} onClick={loadHistory} disabled={historyBusy || saving || loadingPreview}>
              Class history
            </button>
          </div>

          {panel === "history" ? (
            history.length ? (
              <div className={tableScrollClass}>
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className={tableHead}>
                      {["Student", "Academic year", "Source class", "Outcome", "Destination", "Confirmed", "Confirmed by"].map((heading) => (
                        <th key={heading} className="px-3 py-3 font-semibold">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-t border-navy/5 text-[13px] text-navy">
                        <td className="px-3 py-3">
                          <p className="font-semibold">{row.studentName}</p>
                          <p className="text-slate-500">{formatCompactStudentNumber(row.studentNumber)}</p>
                        </td>
                        <td className="px-3 py-3">
                          {row.fromYearName}
                          {row.toYearName ? ` → ${row.toYearName}` : ""}
                        </td>
                        <td className="px-3 py-3">{row.sourceClassName || "—"}</td>
                        <td className="px-3 py-3">{outcomeLabel(row.outcome)}</td>
                        <td className="px-3 py-3">{row.destinationClassName || "—"}</td>
                        <td className="px-3 py-3">{row.confirmedOn || "—"}</td>
                        <td className="px-3 py-3">{row.confirmedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[13.5px] text-slate-500">No confirmed progression history for this class yet.</p>
            )
          ) : loadError ? (
            <div className="space-y-3">
              <p className="text-[13.5px] text-[#c45b66]">{loadError}</p>
              <button type="button" className={secondaryButton} onClick={() => fetchPreview(selectedClass, true)}>
                Retry
              </button>
            </div>
          ) : loadingPreview ? (
            <div className={tableScrollClass} aria-busy="true" aria-label="Loading students">
              <table className="w-full min-w-[1100px] text-left">
                <thead>
                  <tr className={tableHead}>
                    <th className="px-3 py-3 font-semibold">Student</th>
                    <th className="px-3 py-3 font-semibold">Current</th>
                    <th className="px-3 py-3 font-semibold">Outcome</th>
                    <th className="px-3 py-3 font-semibold">Destination</th>
                    <th className="px-3 py-3 font-semibold">Stream</th>
                  </tr>
                </thead>
                <tbody>
                  <PromotionStudentSkeletonRows />
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No enrolled students are waiting in this class for the selected years.</p>
          ) : (
            <>
              <div className={cn(tableScrollClass, saving && "opacity-60")}>
                <table className="w-full min-w-[1100px] text-left">
                  <thead>
                    <tr className={tableHead}>
                      <th className="px-3 py-3 font-semibold">Student</th>
                      <th className="px-3 py-3 font-semibold">Current</th>
                      <th className="px-3 py-3 font-semibold">Outcome</th>
                      <th className="px-3 py-3 font-semibold">Destination</th>
                      <th className="px-3 py-3 font-semibold">Stream</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const classChoices = destClasses.filter((item) => item.levelId === (row.outcome === "RETAIN" ? row.levelId : row.destLevelId));
                      const streamChoices = streams.filter((item) => item.classId === (row.outcome === "RETAIN" ? row.classId : row.destClassId));
                      const lockedClass = row.outcome === "RETAIN";
                      const message = rowErrors[row.studentId];
                      return (
                        <tr key={row.studentId} className="border-t border-navy/5 text-[13px] text-navy">
                          <td className="px-3 py-3">
                            <p className="font-semibold">{row.name}</p>
                            <p className="text-slate-500">{formatCompactStudentNumber(row.studentNumber)}</p>
                          </td>
                          <td className="px-3 py-3">
                            {row.levelName} · {row.className}
                            {row.streamName ? ` · ${row.streamName}` : ""}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              className={inputClass}
                              value={row.outcome}
                              disabled={saving}
                              title={row.canPromote ? undefined : "Promote is unavailable because no next class is configured."}
                              onChange={(event) => {
                                const outcome = event.target.value as ProgressionOutcome;
                                if (outcome === "PROMOTE" && !row.canPromote) return;
                                patchRow(row.studentId, {
                                  outcome,
                                  destLevelId: outcome === "RETAIN" ? row.levelId : row.destLevelId,
                                  destClassId: outcome === "RETAIN" ? row.classId : row.destClassId,
                                });
                              }}
                            >
                              {OUTCOMES.map((item) => (
                                <option key={item.id} value={item.id} disabled={item.id === "PROMOTE" && !row.canPromote}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            {row.outcome === "EXCLUDE" || row.outcome === "GRADUATE" ? (
                              <span className="text-slate-500">{destinationLabel(row)}</span>
                            ) : (
                              <div className="flex min-w-[16rem] flex-col gap-2">
                                <select
                                  className={inputClass}
                                  value={row.destLevelId}
                                  disabled={lockedClass || saving}
                                  onChange={(event) => {
                                    patchRow(row.studentId, { destLevelId: event.target.value, destClassId: "", destStreamId: "" });
                                  }}
                                >
                                  <option value="">Level</option>
                                  {levels.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className={inputClass}
                                  value={lockedClass ? row.classId : row.destClassId}
                                  disabled={lockedClass || saving}
                                  onChange={(event) => {
                                    patchRow(row.studentId, { destClassId: event.target.value, destStreamId: "" });
                                  }}
                                >
                                  <option value="">Class</option>
                                  {classChoices.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                      {item.feeConfigured ? "" : " · no fee structure"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {message ? <p className="mt-1.5 text-[12px] text-[#c45b66]">{message}</p> : null}
                          </td>
                          <td className="px-3 py-3">
                            {row.outcome === "EXCLUDE" || row.outcome === "GRADUATE" ? (
                              "—"
                            ) : (
                              <select
                                className={inputClass}
                                value={row.destStreamId}
                                disabled={saving}
                                onChange={(event) => patchRow(row.studentId, { destStreamId: event.target.value })}
                              >
                                <option value="">No stream</option>
                                {streamChoices.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <SchoolPagination
                page={pageMeta.page}
                total={rows.length}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
              <p className="text-[12.5px] text-slate-500">
                Promote {counts.PROMOTE} · Keep {counts.RETAIN} · Transfer {counts.TRANSFER} · Graduate {counts.GRADUATE} · Exclude {counts.EXCLUDE}
              </p>
            </>
          )}
          {panel === "students" ? (
            <div className="flex flex-wrap gap-2">
              <SchoolWorkflowButton
                className={primaryButton}
                busy={saving}
                idleLabel="Validate & Save"
                busyLabel="Saving"
                disabled={!canManage || !rows.length || loadingPreview || Boolean(loadError)}
                onClick={validateAndSave}
              />
            </div>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setPanel("students")}>
              Back to students
            </button>
          )}
        </section>
      )}
    </div>
  );
}
