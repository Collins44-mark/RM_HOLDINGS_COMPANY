"use client";

import { useMemo, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import {
  confirmSchoolPromotionsAction,
  loadSchoolPromotionYearsAction,
  previewSchoolPromotionsAction,
  type ProgressionOutcome,
  type PromotionPreviewStudent,
} from "@/actions/school/lifecycle";
import { glassPanel, inputClass, primaryButton, secondaryButton, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { SchoolField, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { formatCompactStudentNumber } from "@/lib/school/student-number";

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [years] = useState(initialYears);
  const [fromYearId, setFromYearId] = useState(initialYears.find((row) => row.isCurrent)?.id ?? initialYears[0]?.id ?? "");
  const [toYearId, setToYearId] = useState(initialYears.find((row) => !row.isCurrent)?.id ?? "");
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [destClasses, setDestClasses] = useState<DestClass[]>([]);
  const [streams, setStreams] = useState<Array<{ id: string; name: string; classId: string }>>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [fromYearName, setFromYearName] = useState("");
  const [toYearName, setToYearName] = useState("");
  const [alreadyInTarget, setAlreadyInTarget] = useState(0);
  const [priorNote, setPriorNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ promoted: number; retained: number; transferred: number; graduated: number; excluded: number; failed: number; failures: Array<{ studentId: string; error: string }> } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);

  function loadPreview() {
    if (busy || lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    void previewSchoolPromotionsAction({ fromYearId, toYearId }).then((next) => {
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
      setPriorNote(
        next.priorRuns[0]
          ? `A previous run on this year pair saved ${next.priorRuns[0].promoted} promotions. Students already in the target year are omitted.`
          : "",
      );
      setRows(
        next.students.map((student) => ({
          ...student,
          outcome: student.suggestedOutcome,
          destLevelId: student.suggestedLevelId || student.levelId,
          destClassId: student.suggestedClassId,
          destStreamId: "",
          reason: "",
        })),
      );
      requestId.current = crypto.randomUUID();
      setStep(2);
    });
  }

  const counts = useMemo(() => {
    const tally = { PROMOTE: 0, RETAIN: 0, TRANSFER: 0, GRADUATE: 0, EXCLUDE: 0 };
    for (const row of rows) tally[row.outcome] += 1;
    return tally;
  }, [rows]);

  const unresolved = rows.filter((row) => {
    if (row.outcome === "EXCLUDE" || row.outcome === "GRADUATE") return false;
    if (row.needsSelection && row.outcome === "PROMOTE" && !row.destClassId) return true;
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
          <p className="mt-1 text-[13.5px] text-slate-500">
            Preview first. Nothing is moved until an authorized user confirms this run.
          </p>
        </div>
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      {step === 1 ? (
        <section className={`${glassPanel} space-y-4`}>
          <SchoolField label="Current academic year">
            <select className={inputClass} value={fromYearId} onChange={(event) => setFromYearId(event.target.value)}>
              {years.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </select>
          </SchoolField>
          <SchoolField label="Target academic year">
            <select className={inputClass} value={toYearId} onChange={(event) => setToYearId(event.target.value)}>
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
          {canManage ? (
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Preview students" busyLabel="Loading" disabled={!fromYearId || !toYearId} onClick={loadPreview} />
          ) : (
            <p className="text-[13px] text-slate-500">You can view this workflow, but confirming a run requires promotion permission.</p>
          )}
        </section>
      ) : null}

      {step === 2 ? (
        <section className={`${glassPanel} space-y-4`}>
          <p className="text-[13.5px] text-slate-500">
            {fromYearName} → {toYearName}. {rows.length} enrolled students to review.
            {alreadyInTarget ? ` ${alreadyInTarget} already have an active enrollment in the target year.` : ""}
          </p>
          {priorNote ? <p className="text-[13px] text-amber-800">{priorNote}</p> : null}
          {rows.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No enrolled students are waiting for this year pair.</p>
          ) : (
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
                  {rows.map((row) => {
                    const classChoices = destClasses.filter((item) => item.levelId === (row.outcome === "RETAIN" ? row.levelId : row.destLevelId));
                    const streamChoices = streams.filter((item) => item.classId === (row.outcome === "RETAIN" ? row.classId : row.destClassId));
                    const lockedClass = row.outcome === "RETAIN";
                    return (
                      <tr key={row.studentId} className="border-t border-navy/5 text-[13px] text-navy">
                        <td className="px-3 py-3">
                          <p className="font-semibold">{row.name}</p>
                          <p className="text-slate-500">{formatCompactStudentNumber(row.studentNumber)}</p>
                          {row.needsSelection ? <p className="text-[12px] text-amber-800">{row.suggestionNote}</p> : null}
                        </td>
                        <td className="px-3 py-3">
                          {row.levelName} · {row.className}
                          {row.streamName ? ` · ${row.streamName}` : ""}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className={inputClass}
                            value={row.outcome}
                            onChange={(event) => {
                              const outcome = event.target.value as ProgressionOutcome;
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
                              <option key={item.id} value={item.id}>
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
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className={primaryButton} disabled={!rows.length} onClick={() => setStep(3)}>
              Validate destinations
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[16px] font-semibold text-navy">Destination check</h2>
          {unresolved.length ? (
            <p className="text-[13.5px] text-amber-800">{unresolved.length} students still need a destination class before you can confirm.</p>
          ) : (
            <p className="text-[13.5px] text-slate-500">Destinations are complete. Stream is optional. Fee structures and subjects are shown for the target year.</p>
          )}
          <ul className="space-y-2 text-[13.5px] text-navy">
            {rows
              .filter((row) => row.outcome !== "EXCLUDE")
              .slice(0, 40)
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
            <button type="button" className={secondaryButton} onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className={primaryButton} disabled={Boolean(unresolved.length) || !canManage} onClick={() => setStep(4)}>
              Review summary
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[16px] font-semibold text-navy">Confirm progression</h2>
          <p className="text-[13.5px] text-slate-500">
            Promote {counts.PROMOTE} · Keep {counts.RETAIN} · Transfer {counts.TRANSFER} · Graduate {counts.GRADUATE} · Exclude {counts.EXCLUDE}
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
            <button type="button" className={secondaryButton} onClick={() => setStep(3)}>
              Back
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setResult(null);
                setStep(1);
                void loadSchoolPromotionYearsAction();
              }}
            >
              Start another preview
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
