"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  changeSchoolStudentClassAction,
  loadSchoolClassChangeOptionsAction,
  withdrawSchoolStudentAction,
} from "@/actions/school/lifecycle";
import { SchoolField, SchoolGlassModal, SchoolWorkflowButton } from "@/components/school/school-ui";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

type Catalog = {
  years: Array<{ id: string; name: string; isCurrent: boolean }>;
  levels: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string; levelId: string }>;
  streams: Array<{ id: string; name: string; classId: string }>;
  today: string;
};

function newRequestId() {
  return crypto.randomUUID();
}

export function SchoolWithdrawDialog({
  studentId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  studentId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (input: { withdrawnOn: string; reason: string; requestId: string }) => void;
}) {
  const requestId = useRef(newRequestId());
  const [withdrawnOn, setWithdrawnOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  return (
    <SchoolGlassModal
      title="Withdraw student"
      subtitle="The student record, fees, exams and history stay on file. The student is removed from active class lists."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>
            Keep enrolled
          </button>
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Withdraw"
            busyLabel="Saving"
            disabled={!reason.trim() || reason.trim().length < 3}
            onClick={() => onConfirm({ withdrawnOn, reason, requestId: requestId.current })}
          />
        </>
      }
    >
      <SchoolField label="Withdrawal date">
        <input className={inputClass} type="date" value={withdrawnOn} onChange={(event) => setWithdrawnOn(event.target.value)} />
      </SchoolField>
      <SchoolField label="Reason">
        <textarea
          className={inputClass}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this student being withdrawn?"
        />
      </SchoolField>
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      <p className="sr-only">{studentId}</p>
    </SchoolGlassModal>
  );
}

export function SchoolChangeClassDialog({
  studentId,
  current,
  onClose,
  onSaved,
}: {
  studentId: string;
  current: { yearName: string; levelName: string; className: string; streamName: string; yearId: string; levelId: string; classId: string; streamId: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const requestId = useRef(newRequestId());
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [yearId, setYearId] = useState(current.yearId);
  const [levelId, setLevelId] = useState(current.levelId);
  const [classId, setClassId] = useState(current.classId);
  const [streamId, setStreamId] = useState(current.streamId);
  const [effectiveOn, setEffectiveOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadSchoolClassChangeOptionsAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCatalog(result);
      if (result.today) setEffectiveOn(result.today);
    });
    return () => {
      active = false;
    };
  }, []);

  const classes = useMemo(() => (catalog?.classes ?? []).filter((row) => row.levelId === levelId), [catalog, levelId]);
  const streams = useMemo(() => (catalog?.streams ?? []).filter((row) => row.classId === classId), [catalog, classId]);
  const destYear = catalog?.years.find((row) => row.id === yearId)?.name ?? "";
  const destLevel = catalog?.levels.find((row) => row.id === levelId)?.name ?? "";
  const destClass = classes.find((row) => row.id === classId)?.name ?? "";
  const destStream = streams.find((row) => row.id === streamId)?.name ?? "No stream";

  return (
    <SchoolGlassModal
      title="Change class"
      subtitle="Student number and admission number stay the same. Previous placement and results are kept."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            idleLabel="Confirm change"
            busyLabel="Saving"
            disabled={!classId || reason.trim().length < 3}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              setError(null);
              void changeSchoolStudentClassAction({
                studentId,
                academicYearId: yearId,
                levelId,
                classId,
                streamId,
                effectiveOn,
                reason,
                requestId: requestId.current,
              }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onSaved();
              });
            }}
          />
        </>
      }
    >
      <p className="text-[13px] text-slate-500">
        Current: {current.yearName || "—"} · {current.levelName || "—"} · {current.className || "—"}
        {current.streamName ? ` · ${current.streamName}` : ""}
      </p>
      <SchoolField label="Academic year">
        <select
          className={inputClass}
          value={yearId}
          onChange={(event) => setYearId(event.target.value)}
        >
          {(catalog?.years ?? []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </SchoolField>
      <SchoolField label="Level">
        <select
          className={inputClass}
          value={levelId}
          onChange={(event) => {
            setLevelId(event.target.value);
            setClassId("");
            setStreamId("");
          }}
        >
          <option value="">Select level</option>
          {(catalog?.levels ?? []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </SchoolField>
      <SchoolField label="Class">
        <select
          className={inputClass}
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setStreamId("");
          }}
        >
          <option value="">Select class</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </SchoolField>
      <SchoolField label="Stream (optional)">
        <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
          <option value="">No stream</option>
          {streams.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </SchoolField>
      <SchoolField label="Effective date">
        <input className={inputClass} type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
      </SchoolField>
      <SchoolField label="Reason">
        <textarea className={inputClass} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </SchoolField>
      {classId ? (
        <p className="text-[13px] text-navy">
          New placement: {destYear || "—"} · {destLevel || "—"} · {destClass || "—"} · {destStream}
        </p>
      ) : null}
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
    </SchoolGlassModal>
  );
}

export function runWithdrawStudent(
  input: { studentId: string; withdrawnOn: string; reason: string; requestId: string },
  handlers: { onDone: () => void; onError: (message: string) => void; onBusy: (busy: boolean) => void },
) {
  handlers.onBusy(true);
  void withdrawSchoolStudentAction(input).then((result) => {
    handlers.onBusy(false);
    if (!result.ok) {
      handlers.onError(result.error);
      return;
    }
    handlers.onDone();
  });
}
