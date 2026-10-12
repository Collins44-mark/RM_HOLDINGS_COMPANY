"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
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
  const [step, setStep] = useState<"board" | "class" | "validate" | "confirm">("board");
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ promoted: number; retained: number; transferred: number; graduated: number; excluded: number; failed: number; failures: Array<{ studentId: string; error: string }> } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);

  function loadBoard(nextFrom = fromYearId, nextTo = toYearId) {
    if (!nextFrom) return;
    setBusy(true);
    void loadSchoolPromotionBoardAction({ fromYearId: nextFrom, toYearId: nextTo }).then((next) => {
      setBusy(false);
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

  function openClass(card: PromotionClassCard) {
    if (!fromYearId || !toYearId || busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    setSelectedClass(card);
    setPanel("students");
    setResult(null);
    void previewSchoolPromotionsAction({ fromYearId, toYearId, classId: card.id }).then((next) => {
      lock.current = false;
      setBusy(false);
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      setFromYearName(next.fromYearName);
      setToYearName(next.toYearName);
      setDestClasses(next.classes);
      setStreams(next.streams);
      setLevels(next.levels);
      setAlreadyInTarget(next.alreadyInTarget);
      setRows(
        next.students.map((student) => ({
          ...student,
          outcome: student.canPromote ? student.suggestedOutcome : student.suggestedOutcome === "PROMOTE" ? "RETAIN" : student.suggestedOutcome,
          destLevelId: student.suggestedLevelId || student.levelId,
          destClassId: student.canPromote ? student.suggestedClassId : student.classId,
          destStreamId: "",
          reason: "",
        })),
      );
      setPage(1);
      requestId.current = crypto.randomUUID();
      setStep("class");
    });
  }

  const pageMeta = schoolPageMeta(page, rows.length, pageSize);
  const visibleRows = rows.slice((pageMeta.page - 1) * pageSize, pageMeta.page * pageSize);

  const counts = useMemo(() => {
    const tally = { PROMOTE: 0, RETAIN: 0, TRANSFER: 0, GRADUATE: 0, EXCLUDE: 0 };
    for (const row of rows) tally[row.outcome] += 1;
    return tally;
  }, [rows]);

  const unresolved = rows.filter((row) => {
    if (row.outcome === "EXCLUDE" || row.outcome === "GRADUATE") return false;
    if ((row.outcome === "PROMOTE" || row.outcome === "RETAIN" || row.outcome === "TRANSFER") && !row.destClassId) return true;
    return false;
  });

  function destinationLabel(row: DraftRow) {
    if (row.outcome === "EXCLUDE") return "Excluded from this run";
    if (row.outcome === "GRADUATE") return "Graduated / completed — no new enrollment";
    const destClass = destClasses.find((item) => item.id === (row.outcome === "RETAIN" ? row.classId : row.destClassId));
    const destLevel = levels.find((item) => item.id === (row.outcome === "RETAIN" ? row.levelId : row.destLevelId));
    const destStream = streams.find((item) => item.id === row.destStreamId);
    return `${toYearName} · ${destLevel?.name || "—"} · ${destClass?.name || "—"} · ${destStream?.name || "No stream"}`;
  }

  function loadHistory() {
    if (!selectedClass || !fromYearId) return;
    setBusy(true);
    void loadSchoolPromotionHistoryAction({ fromYearId, classId: selectedClass.id }).then((next) => {
      setBusy(false);
      if (!next.ok) {
        setSaveError(next.error);
        return;
      }
      setHistory(next.history);
      setPanel("history");
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
          <p className="mt-1 text-[13.5px] text-slate-500">Preview first. Nothing is moved until an authorized user confirms this run.</p>
        </div>
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      {step === "board" ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SchoolField label="Current academic year">
              <select
                className={inputClass}
                value={fromYearId}
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
          </div>
          {!canManage ? <p className="text-[13px] text-slate-500">You can review classes, but confirming a run requires promotion permission.</p> : null}
          {cards.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!toYearId || busy}
                  onClick={() => openClass(card)}
                  className={cn(glassCard, "px-4 py-4 text-left transition duration-200 hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-60")}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{card.levelName || "Class"}</p>
                  <p className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-navy">{card.name}</p>
                  <p className="mt-2 text-[12.5px] text-slate-500">{fromYearName || "Selected year"}</p>
                  <p className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-navy">{card.enrolled}</p>
                  <p className="text-[12.5px] text-slate-500">
                    {card.enrolled === 1 ? "enrolled student" : "enrolled students"}
                    {toYearId ? ` · ${card.awaiting} awaiting review` : ""}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13.5px] text-slate-500">No classes are configured for this school yet.</p>
          )}
        </section>
      ) : null}

      {step === "class" && selectedClass ? (
        <section className={`${glassPanel} space-y-4`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12.5px] text-slate-500">
                {fromYearName} → {toYearName}
              </p>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{selectedClass.name}</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                {rows.length} students in this class
                {alreadyInTarget ? ` · ${alreadyInTarget} already enrolled in the target year` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => { setStep("board"); setSelectedClass(null); loadBoard(); }}>
                All classes
              </button>
              <button type="button" className={panel === "history" ? primaryButton : secondaryButton} onClick={loadHistory}>
                Class history
              </button>
            </div>
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
          ) : rows.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No enrolled students are waiting in this class for the selected years.</p>
          ) : (
            <>
              <div className={tableScrollClass}>
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
                              title={row.canPromote ? undefined : "Promote is unavailable because no next class is configured."}
                              onChange={(event) => {
                                const outcome = event.target.value as ProgressionOutcome;
                                if (outcome === "PROMOTE" && !row.canPromote) return;
                                setRows((current) =>
                                  current.map((item) =>
                                    item.studentId === row.studentId
                                      ? {
                                          ...item,
                                          outcome,
                                          destLevelId: outcome === "RETAIN" ? item.levelId : item.destLevelId,
                                          destClassId: outcome === "RETAIN" ? item.classId : item.destClassId,
                                        }
                                      : item,
                                  ),
                                );
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
                                  disabled={lockedClass}
                                  onChange={(event) => {
                                    const destLevelId = event.target.value;
                                    setRows((current) =>
                                      current.map((item) =>
                                        item.studentId === row.studentId ? { ...item, destLevelId, destClassId: "", destStreamId: "" } : item,
                                      ),
                                    );
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
                                  disabled={lockedClass}
                                  onChange={(event) => {
                                    const destClassId = event.target.value;
                                    setRows((current) =>
                                      current.map((item) => (item.studentId === row.studentId ? { ...item, destClassId, destStreamId: "" } : item)),
                                    );
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
                          </td>
                          <td className="px-3 py-3">
                            {row.outcome === "EXCLUDE" || row.outcome === "GRADUATE" ? (
                              "—"
                            ) : (
                              <select
                                className={inputClass}
                                value={row.destStreamId}
                                onChange={(event) => {
                                  const destStreamId = event.target.value;
                                  setRows((current) =>
                                    current.map((item) => (item.studentId === row.studentId ? { ...item, destStreamId } : item)),
                                  );
                                }}
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
            </>
          )}
          {panel === "students" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => { setStep("board"); setSelectedClass(null); loadBoard(); }}>
                Back
              </button>
              <button type="button" className={primaryButton} disabled={!rows.length} onClick={() => setStep("validate")}>
                Validate destinations
              </button>
            </div>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setPanel("students")}>
              Back to students
            </button>
          )}
        </section>
      ) : null}

      {step === "validate" ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[16px] font-semibold text-navy">Destination check</h2>
          {unresolved.length ? (
            <p className="text-[13.5px] text-amber-800">{unresolved.length} students still need a destination class before you can confirm.</p>
          ) : (
            <p className="text-[13.5px] text-slate-500">Destinations are complete. Stream is optional.</p>
          )}
          <ul className="space-y-2 text-[13.5px] text-navy">
            {rows
              .filter((row) => row.outcome !== "EXCLUDE")
              .map((row) => {
                const destId = row.outcome === "RETAIN" ? row.classId : row.destClassId;
                const dest = destClasses.find((item) => item.id === destId);
                return (
                  <li key={row.studentId}>
                    <span className="font-medium">{row.name}</span>
                    {" · "}
                    {destinationLabel(row)}
                    {dest ? ` · subjects: ${dest.subjects.length ? dest.subjects.join(", ") : "none configured"} · fees: ${dest.feeConfigured ? "configured" : "not configured"}` : ""}
                  </li>
                );
              })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => setStep("class")}>
              Back
            </button>
            <button type="button" className={primaryButton} disabled={Boolean(unresolved.length) || !canManage} onClick={() => setStep("confirm")}>
              Review summary
            </button>
          </div>
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[16px] font-semibold text-navy">Confirm progression</h2>
          <p className="text-[13.5px] text-slate-500">
            {selectedClass?.name}: Promote {counts.PROMOTE} · Keep {counts.RETAIN} · Transfer {counts.TRANSFER} · Graduate {counts.GRADUATE} · Exclude {counts.EXCLUDE}
          </p>
          {result ? (
            <div className="space-y-2 text-[13.5px] text-navy">
              <p>
                Saved: {result.promoted} promoted, {result.retained} retained, {result.transferred} transferred, {result.graduated} graduated, {result.excluded} excluded.
              </p>
              {result.failed ? (
                <p className="text-[#c45b66]">
                  {result.failed} could not be saved.
                  {result.failures.map((item) => ` ${item.error}`).join("")}
                </p>
              ) : null}
            </div>
          ) : (
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Confirm and save"
              busyLabel="Saving"
              disabled={!canManage}
              onClick={() => {
                if (busy || lock.current || !canManage) return;
                lock.current = true;
                setBusy(true);
                setSaveError(null);
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
                  setBusy(false);
                  if (!next.ok) {
                    setSaveError(next.error);
                    return;
                  }
                  setResult(next);
                });
              }}
            />
          )}
          {!result ? (
            <button type="button" className={secondaryButton} onClick={() => setStep("validate")}>
              Back
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setResult(null);
                setSelectedClass(null);
                setRows([]);
                setStep("board");
                loadBoard();
              }}
            >
              Back to classes
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
