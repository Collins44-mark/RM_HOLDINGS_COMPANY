"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  completeSchoolAdmissionAction,
  getAdmissionFormOptionsAction,
  resolveAdmissionFeesAction,
  saveSchoolAdmissionAction,
  type AdmissionDetail,
  type AdmissionFormInput,
  type ApplicableFeeRow,
} from "@/actions/school/admissions";
import { writeAdmissionFlash, writeFeeFlash, writeGuardianFlash, writeStudentFlash } from "@/lib/school/admission-flash";
import { SchoolConfirmDialog, SchoolField, SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { formatCompactStudentNumber } from "@/lib/school/student-number";

export type AdmissionFormOptions = {
  years: Array<{ id: string; name: string; isCurrent: boolean }>;
  terms: Array<{ id: string; academicYearId: string; name: string }>;
  levels: Array<{ id: string; name: string }>;
  classes?: Array<{ id: string; name: string; levelId: string }>;
  streams?: Array<{ id: string; name: string; classId: string }>;
  today?: string;
  capabilities?: { canView: boolean; canManage: boolean; canConfigureAcademic: boolean };
};

const SECTIONS = [
  ["student", "Student"],
  ["placement", "Placement"],
  ["guardian", "Guardian"],
  ["review", "Review"],
] as const;

function emptyForm(options: AdmissionFormOptions): AdmissionFormInput {
  const currentYear = options.years.find((row) => row.isCurrent) ?? options.years[0];
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    nationality: "",
    address: "",
    phone: "",
    email: "",
    academicYearId: currentYear?.id ?? "",
    termId: "",
    levelId: "",
    classId: "",
    streamId: "",
    admissionDate: options.today ?? "",
    guardianFullName: "",
    guardianRelationship: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianAddress: "",
    guardianOccupation: "",
  };
}

function fromDetail(admission: AdmissionDetail): AdmissionFormInput {
  return {
    id: admission.id,
    firstName: admission.firstName,
    middleName: admission.middleName,
    lastName: admission.lastName,
    dateOfBirth: admission.dateOfBirth,
    gender: admission.gender,
    nationality: admission.nationality,
    address: admission.address,
    phone: "",
    email: "",
    academicYearId: admission.academicYearId,
    termId: admission.termId,
    levelId: admission.levelId,
    classId: admission.classId,
    streamId: admission.streamId,
    admissionDate: admission.admissionDate,
    guardianFullName: admission.guardianFullName,
    guardianRelationship: admission.guardianRelationship,
    guardianPhone: admission.guardianPhone,
    guardianEmail: admission.guardianEmail,
    guardianAddress: admission.guardianAddress,
    guardianOccupation: admission.guardianOccupation,
  };
}

function FeeReadout({ fee, ready }: { fee: ApplicableFeeRow | null; ready: boolean }) {
  if (!ready) return null;
  if (!fee?.configured) {
    return <p className="text-[13px] text-slate-500">Fee structure not configured for this class.</p>;
  }
  return (
    <div className="rounded-[16px] border border-navy/8 bg-white/70 px-4 py-3">
      <p className="text-[12.5px] font-semibold text-navy">Applicable Annual Fee</p>
      <p className="mt-1 text-[13.5px] font-medium text-navy">{formatTzs(fee.annualAmount ?? 0)}</p>
      {fee.currentTermAmount != null && fee.currentTermName ? (
        <p className="mt-1 text-[13px] text-slate-600">
          Current Term Fee · {fee.currentTermName}: {formatTzs(fee.currentTermAmount)}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-slate-500">Term fee not configured</p>
      )}
    </div>
  );
}

export function SchoolAdmissionFormPage({
  options: initialOptions,
  admission,
  error,
  loadOptions = false,
}: {
  options: AdmissionFormOptions | null;
  admission: AdmissionDetail | null;
  error: string | null;
  loadOptions?: boolean;
}) {
  const [options, setOptions] = useState<AdmissionFormOptions>(
    initialOptions ?? { years: [], terms: [], levels: [], today: "", capabilities: { canView: true, canManage: true, canConfigureAcademic: false } },
  );
  const [form, setForm] = useState<AdmissionFormInput>(
    admission ? fromDetail(admission) : emptyForm(options),
  );
  const [fee, setFee] = useState<ApplicableFeeRow | null>(admission?.fee ?? null);
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>("student");
  const [saveError, setSaveError] = useState<string | null>(error);
  const [saveBusy, setSaveBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completion, setCompletion] = useState<{
    admissionNumber: string;
    studentNumber: string | null;
    studentId: string | null;
  } | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMeta, setDuplicateMeta] = useState<{ studentId: string; studentNumber: string } | null>(null);
  const [catalogReady, setCatalogReady] = useState(!loadOptions);
  const lock = useRef(false);

  function patch(next: Partial<AdmissionFormInput>) {
    setForm((current) => ({ ...current, ...next }));
    setSaved(false);
  }

  useEffect(() => {
    if (!loadOptions) return;
    let active = true;
    void getAdmissionFormOptionsAction("manage").then((result) => {
      if (!active || !result.ok) {
        if (active && result && "error" in result && !result.ok) setSaveError(result.error);
        return;
      }
      setCatalogReady(true);
      setOptions({
        years: result.years,
        terms: result.terms,
        levels: result.levels,
        classes: result.classes,
        streams: result.streams,
        today: result.today,
        capabilities: result.capabilities,
      });
      setForm((current) => {
        if (current.academicYearId && current.admissionDate) return current;
        const currentYear = result.years.find((row) => row.isCurrent) ?? result.years[0];
        return {
          ...current,
          academicYearId: current.academicYearId || currentYear?.id || "",
          admissionDate: current.admissionDate || result.today,
        };
      });
    });
    return () => {
      active = false;
    };
  }, [loadOptions]);

  useEffect(() => {
    const classId = form.classId;
    const academicYearId = form.academicYearId;
    if (!classId || !academicYearId) return;
    let active = true;
    void resolveAdmissionFeesAction({
      classId,
      academicYearId,
      termId: form.termId,
    }).then((result) => {
      if (!active || !result.ok) return;
      setFee(result.fee);
    });
    return () => {
      active = false;
    };
  }, [form.classId, form.academicYearId, form.termId]);

  const years = options?.years ?? [];
  const levels = options?.levels ?? [];
  const terms = (options?.terms ?? []).filter((row) => row.academicYearId === form.academicYearId);
  const visibleClasses = form.levelId ? (options.classes ?? []).filter((row) => row.levelId === form.levelId) : [];
  const visibleStreams = form.classId ? (options.streams ?? []).filter((row) => row.classId === form.classId) : [];
  const classesReady = catalogReady;
  const streamsReady = catalogReady;
  const visibleFee = form.classId && form.academicYearId ? fee : null;
  const yearName = years.find((row) => row.id === form.academicYearId)?.name ?? "—";
  const levelName = levels.find((row) => row.id === form.levelId)?.name ?? "—";
  const className = visibleClasses.find((row) => row.id === form.classId)?.name ?? "—";
  const streamName = visibleStreams.find((row) => row.id === form.streamId)?.name ?? "—";
  const studentName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ");
  const canManage = options?.capabilities?.canManage !== false;
  const busy = saveBusy || completeBusy;

  function runSave() {
    if (lock.current || completed) return;
    lock.current = true;
    setSaveBusy(true);
    setSaveError(null);
    void saveSchoolAdmissionAction(form).then((result) => {
      lock.current = false;
      setSaveBusy(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setForm((current) => ({ ...current, id: result.id }));
      setSaved(true);
    });
  }

  function runComplete(acknowledgeDuplicate = false) {
    if (lock.current || completed) return;
    lock.current = true;
    setCompleteBusy(true);
    setSaveError(null);
    void completeSchoolAdmissionAction({ ...form, acknowledgeDuplicate }).then((result) => {
      if (!result.ok) {
        lock.current = false;
        setCompleteBusy(false);
        if ("duplicate" in result && result.duplicate) {
          setDuplicateMeta(result.duplicate);
          setDuplicateOpen(true);
          if (result.id) patch({ id: result.id });
          return;
        }
        setSaveError(result.error);
        return;
      }
      setCompleteBusy(false);
      setCompleted(true);
      setCompletion({
        admissionNumber: result.admissionNumber,
        studentNumber: result.studentNumber,
        studentId: result.studentId,
      });
      writeAdmissionFlash({
        id: result.id,
        admissionNumber: result.admissionNumber,
        studentName,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        studentNumber: result.studentNumber,
        levelName,
        className,
        streamName,
        admissionDate: form.admissionDate,
        status: "completed",
      });
      if (result.studentId) {
        writeStudentFlash({
          id: result.studentId,
          studentNumber: result.studentNumber ?? "",
          admissionNumber: result.admissionNumber,
          name: studentName,
          status: "active",
          levelName,
          className,
          streamName,
          guardianName: form.guardianFullName,
        });
        if (result.guardianId) {
          writeGuardianFlash({
            id: result.guardianId,
            fullName: form.guardianFullName,
            phone: form.guardianPhone,
            email: form.guardianEmail,
            students: [
              {
                studentId: result.studentId,
                name: studentName,
                levelName,
                className,
                streamName: streamName === "—" ? "" : streamName,
              },
            ],
          });
        }
      }
      if (result.enrollmentId && result.studentId) {
        writeFeeFlash({
          enrollmentId: result.enrollmentId,
          studentId: result.studentId,
          studentName,
          studentNumber: result.studentNumber ?? "",
          admissionNumber: result.admissionNumber,
          levelId: form.levelId,
          levelName,
          classId: form.classId,
          className,
          classCode: "",
          streamName,
          academicYearId: form.academicYearId,
          academicYearName: yearName,
          annualAmount: fee?.annualAmount ?? null,
          currentTermName: fee?.currentTermName ?? null,
          currentTermAmount: fee?.currentTermAmount ?? null,
          paidAmount: 0,
          outstandingAmount: fee?.annualAmount ?? null,
          totalOutstanding: fee?.annualAmount ?? null,
          status: fee?.configured ? "outstanding" : "no_structure",
          chargeId: null,
        });
      }
    });
  }

  if (completed && completion) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <Link href="/school/admissions" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition duration-200 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Admissions
        </Link>
        <section className={cn(glassPanel, "space-y-4")}>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Admission completed ✓</h1>
          <dl className="grid grid-cols-1 gap-3 text-[13.5px] md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Admission No</dt>
              <dd className="font-medium text-navy">{completion.admissionNumber}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Student No</dt>
              <dd className="font-medium text-navy">
                {completion.studentNumber ? formatCompactStudentNumber(completion.studentNumber) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Student</dt>
              <dd className="font-medium text-navy">{studentName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Class</dt>
              <dd className="font-medium text-navy">
                {className}
                {streamName && streamName !== "—" ? ` ${streamName}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Fee</dt>
              <dd className="font-medium text-navy">
                {visibleFee?.configured ? `${formatTzs(visibleFee.annualAmount ?? 0)} annual` : "Not configured"}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {completion.studentId ? (
              <Link href={`/school/students/${completion.studentId}`} className={primaryButton}>
                View Student
              </Link>
            ) : null}
            <Link href="/school/admissions" className={secondaryButton}>
              Back to Admissions
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/admissions" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition duration-200 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Admissions
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">
            {admission ? admission.admissionNumber : "New Admission"}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {admission ? "Update this draft admission and complete when ready." : "Register a new student and place them in the school."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/school/admissions" className={secondaryButton}>
            Cancel
          </Link>
          {canManage ? (
            <>
              <SchoolWorkflowButton
                className={secondaryButton}
                busy={saveBusy}
                disabled={busy}
                confirmed={saved}
                idleLabel="Save Draft"
                busyLabel="Saving…"
                confirmedLabel="Saved ✓"
                onClick={runSave}
              />
              <SchoolWorkflowButton
                className={primaryButton}
                busy={completeBusy}
                disabled={busy}
                confirmed={completed}
                idleLabel="Complete Admission"
                busyLabel="Completing…"
                confirmedLabel="Completed ✓"
                onClick={() => runComplete(false)}
              />
            </>
          ) : null}
        </div>
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
              section === id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "student" ? (
        <section className={cn(glassPanel, "space-y-4")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Student information</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SchoolField label="First name">
              <input className={inputClass} value={form.firstName} onChange={(event) => patch({ firstName: event.target.value })} />
            </SchoolField>
            <SchoolField label="Middle name">
              <input className={inputClass} value={form.middleName} onChange={(event) => patch({ middleName: event.target.value })} />
            </SchoolField>
            <SchoolField label="Last name">
              <input className={inputClass} value={form.lastName} onChange={(event) => patch({ lastName: event.target.value })} />
            </SchoolField>
            <SchoolField label="Date of birth">
              <input type="date" className={inputClass} value={form.dateOfBirth} onChange={(event) => patch({ dateOfBirth: event.target.value })} />
            </SchoolField>
            <SchoolField label="Gender">
              <select className={inputClass} value={form.gender} onChange={(event) => patch({ gender: event.target.value })}>
                <option value="">Select</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </SchoolField>
            <SchoolField label="Nationality">
              <input className={inputClass} value={form.nationality} onChange={(event) => patch({ nationality: event.target.value })} />
            </SchoolField>
            <SchoolField label="Admission date">
              <input type="date" className={inputClass} value={form.admissionDate} onChange={(event) => patch({ admissionDate: event.target.value })} />
            </SchoolField>
          </div>
          <SchoolField label="Address">
            <input className={inputClass} value={form.address} onChange={(event) => patch({ address: event.target.value })} />
          </SchoolField>
        </section>
      ) : null}

      {section === "placement" ? (
        <section className={cn(glassPanel, "space-y-4")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Academic placement</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SchoolField label="Academic year">
              <select
                className={inputClass}
                value={form.academicYearId}
                onChange={(event) => patch({ academicYearId: event.target.value, termId: "" })}
              >
                <option value="">Select year</option>
                {years.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Term">
              <select className={inputClass} value={form.termId} onChange={(event) => patch({ termId: event.target.value })}>
                <option value="">Optional</option>
                {terms.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Level">
              <select
                className={inputClass}
                value={form.levelId}
                onChange={(event) => {
                  setFee(null);
                  patch({ levelId: event.target.value, classId: "", streamId: "" });
                }}
              >
                <option value="">Select level</option>
                {levels.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Class">
              <select
                className={inputClass}
                value={form.classId}
                disabled={!form.levelId}
                onChange={(event) => {
                  setFee(null);
                  patch({ classId: event.target.value, streamId: "" });
                }}
              >
                <option value="">Select class</option>
                {visibleClasses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Stream">
              <select
                className={inputClass}
                value={form.streamId}
                disabled={!form.classId}
                onChange={(event) => patch({ streamId: event.target.value })}
              >
                <option value="">No stream — assign later</option>
                {visibleStreams.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
          </div>
          {!years.length ? (
            <p className="text-[13px] text-slate-500">
              Configure an academic year before completing an admission.
              {options?.capabilities?.canConfigureAcademic ? (
                <>
                  {" "}
                  <Link href="/school/settings" className="font-semibold text-navy underline-offset-2 hover:underline">
                    School Settings → Academic
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {years.length && !levels.length ? (
            <p className="text-[13px] text-slate-500">
              Configure school levels before placing a student.
              {options?.capabilities?.canConfigureAcademic ? (
                <>
                  {" "}
                  <Link href="/school/classes" className="font-semibold text-navy underline-offset-2 hover:underline">
                    Open Classes
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {form.levelId && classesReady && !visibleClasses.length ? (
            <p className="text-[13px] text-slate-500">Configure classes before placing a student.</p>
          ) : null}
          {form.classId && streamsReady && !visibleStreams.length ? (
            <p className="text-[13px] text-slate-500">
              This class has no streams. Admission can be completed now, and a stream can be assigned later if needed.
            </p>
          ) : null}
          <FeeReadout fee={visibleFee} ready={Boolean(form.classId && form.academicYearId)} />
        </section>
      ) : null}

      {section === "guardian" ? (
        <section className={cn(glassPanel, "space-y-4")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Parent / guardian</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SchoolField label="Full name">
              <input className={inputClass} value={form.guardianFullName} onChange={(event) => patch({ guardianFullName: event.target.value })} />
            </SchoolField>
            <SchoolField label="Relationship">
              <input className={inputClass} value={form.guardianRelationship} onChange={(event) => patch({ guardianRelationship: event.target.value })} />
            </SchoolField>
            <SchoolField label="Phone">
              <input className={inputClass} value={form.guardianPhone} onChange={(event) => patch({ guardianPhone: event.target.value })} />
            </SchoolField>
            <SchoolField label="Email">
              <input className={inputClass} value={form.guardianEmail} onChange={(event) => patch({ guardianEmail: event.target.value })} />
            </SchoolField>
            <SchoolField label="Occupation">
              <input className={inputClass} value={form.guardianOccupation} onChange={(event) => patch({ guardianOccupation: event.target.value })} />
            </SchoolField>
          </div>
          <SchoolField label="Address">
            <input className={inputClass} value={form.guardianAddress} onChange={(event) => patch({ guardianAddress: event.target.value })} />
          </SchoolField>
        </section>
      ) : null}

      {section === "review" ? (
        <section className={cn(glassPanel, "space-y-3")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Review</h2>
          <dl className="grid grid-cols-1 gap-2 text-[13.5px] md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Student</dt>
              <dd className="font-medium text-navy">{studentName || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Academic</dt>
              <dd className="font-medium text-navy">
                {yearName} · {levelName} · {className} · {streamName}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Guardian</dt>
              <dd className="font-medium text-navy">
                {form.guardianFullName || "—"}
                {form.guardianRelationship ? ` · ${form.guardianRelationship}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Admission date</dt>
              <dd className="font-medium text-navy">{form.admissionDate || "—"}</dd>
            </div>
          </dl>
          <FeeReadout fee={visibleFee} ready={Boolean(form.classId && form.academicYearId)} />
          <p className="text-[13px] text-slate-500">Completing this admission creates the student, enrollment, and guardian relationship in one transaction. Payments are recorded later in Fees & Payments.</p>
        </section>
      ) : null}

      <SchoolConfirmDialog
        open={duplicateOpen}
        title="Possible duplicate student"
        message={
          duplicateMeta?.studentNumber
            ? `An active student ${duplicateMeta.studentNumber} already matches this name and date of birth. Completing will still create a new student.`
            : "An active student already matches this name and date of birth. Completing will still create a new student."
        }
        confirmLabel="Complete anyway"
        busy={completeBusy}
        onCancel={() => setDuplicateOpen(false)}
        onConfirm={() => {
          setDuplicateOpen(false);
          runComplete(true);
        }}
      />
    </div>
  );
}
