"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  completeSchoolAdmissionAction,
  getAdmissionClassesAction,
  getAdmissionStreamsAction,
  resolveAdmissionFeesAction,
  saveSchoolAdmissionAction,
  type AdmissionDetail,
  type AdmissionFormInput,
  type ApplicableFeeRow,
} from "@/actions/school/admissions";
import { SchoolConfirmDialog, SchoolField, SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";

export type AdmissionFormOptions = {
  years: Array<{ id: string; name: string; isCurrent: boolean }>;
  terms: Array<{ id: string; academicYearId: string; name: string }>;
  levels: Array<{ id: string; name: string }>;
  today?: string;
  capabilities?: { canView: boolean; canManage: boolean; canConfigureAcademic: boolean };
};

const SECTIONS = [
  ["student", "Student"],
  ["placement", "Placement"],
  ["guardian", "Guardian"],
  ["admission", "Admission"],
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
    phone: admission.phone,
    email: admission.email,
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

export function SchoolAdmissionFormPage({
  options,
  admission,
  error,
}: {
  options: AdmissionFormOptions | null;
  admission: AdmissionDetail | null;
  error: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<AdmissionFormInput>(
    admission ? fromDetail(admission) : emptyForm(options ?? { years: [], terms: [], levels: [], today: "" }),
  );
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: string; name: string }>>([]);
  const [fee, setFee] = useState<ApplicableFeeRow | null>(admission?.fee ?? null);
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>("student");
  const [saveError, setSaveError] = useState<string | null>(error);
  const [saveBusy, setSaveBusy] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMeta, setDuplicateMeta] = useState<{ studentId: string; studentNumber: string } | null>(null);
  const lock = useRef(false);

  function patch(next: Partial<AdmissionFormInput>) {
    setForm((current) => ({ ...current, ...next }));
    setSaved(false);
  }

  useEffect(() => {
    const levelId = form.levelId;
    if (!levelId) return;
    let active = true;
    void getAdmissionClassesAction(levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [form.levelId]);

  useEffect(() => {
    const classId = form.classId;
    if (!classId) return;
    let active = true;
    void getAdmissionStreamsAction(classId).then((result) => {
      if (!active || !result.ok) return;
      setStreams(result.streams);
    });
    return () => {
      active = false;
    };
  }, [form.classId]);

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
  const visibleClasses = form.levelId ? classes : [];
  const visibleStreams = form.classId ? streams : [];
  const visibleFee = form.classId && form.academicYearId ? fee : null;
  const yearName = years.find((row) => row.id === form.academicYearId)?.name ?? "—";
  const levelName = levels.find((row) => row.id === form.levelId)?.name ?? "—";
  const className = visibleClasses.find((row) => row.id === form.classId)?.name ?? "—";
  const streamName = visibleStreams.find((row) => row.id === form.streamId)?.name ?? "—";

  function runSave() {
    if (lock.current) return;
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
      setSaved(true);
      patch({ id: result.id });
      if (!admission) router.replace(`/school/admissions/${result.id}/edit`);
    });
  }

  function runComplete(acknowledgeDuplicate = false) {
    if (lock.current) return;
    lock.current = true;
    setCompleteBusy(true);
    setSaveError(null);
    void completeSchoolAdmissionAction({ ...form, acknowledgeDuplicate }).then((result) => {
      lock.current = false;
      setCompleteBusy(false);
      if (!result.ok) {
        if ("duplicate" in result && result.duplicate) {
          setDuplicateMeta(result.duplicate);
          setDuplicateOpen(true);
          if (result.id) patch({ id: result.id });
          return;
        }
        setSaveError(result.error);
        return;
      }
      setCompleted(true);
      router.push(`/school/admissions/${result.id}`);
    });
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
          <p className="mt-1 text-[13.5px] text-slate-500">Student, placement, and guardian details become a student only when this admission is completed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/school/admissions" className={secondaryButton}>
            Cancel
          </Link>
          <SchoolWorkflowButton className={secondaryButton} busy={saveBusy} confirmed={saved} idleLabel="Save draft" confirmedLabel="Saved ✓" onClick={runSave} />
          <SchoolWorkflowButton className={primaryButton} busy={completeBusy} confirmed={completed} idleLabel="Complete admission" confirmedLabel="Admission completed ✓" onClick={() => runComplete(false)} />
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
            <SchoolField label="Phone">
              <input className={inputClass} value={form.phone} onChange={(event) => patch({ phone: event.target.value })} />
            </SchoolField>
            <SchoolField label="Email">
              <input className={inputClass} value={form.email} onChange={(event) => patch({ email: event.target.value })} />
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
                onChange={(event) => patch({ levelId: event.target.value, classId: "", streamId: "" })}
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
                onChange={(event) => patch({ classId: event.target.value, streamId: "" })}
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
                <option value="">Select stream</option>
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
              Academic year is not configured yet.
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
              No levels configured yet.
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
          {form.levelId && !visibleClasses.length ? <p className="text-[13px] text-slate-500">No classes configured for this level yet.</p> : null}
          {form.classId && !visibleStreams.length ? <p className="text-[13px] text-slate-500">No streams configured for this class yet.</p> : null}
          {visibleFee?.configured ? (
            <div className="rounded-[16px] border border-navy/8 bg-white/70 px-4 py-3">
              <p className="text-[12.5px] font-semibold text-navy">Applicable fee</p>
              <p className="mt-2 text-[13px] text-slate-600">Annual Fee: {formatTzs(visibleFee.annualAmount ?? 0)}</p>
              {visibleFee.currentTermAmount != null && visibleFee.currentTermName ? (
                <p className="text-[13px] text-slate-600">
                  {visibleFee.currentTermName}: {formatTzs(visibleFee.currentTermAmount)}
                </p>
              ) : visibleFee.termCount === 0 ? (
                <p className="text-[13px] text-slate-500">No term fees configured.</p>
              ) : (
                <p className="text-[13px] text-slate-500">Current term fee is not configured.</p>
              )}
            </div>
          ) : form.classId && form.academicYearId ? (
            <p className="text-[13px] text-slate-500">Fee structure not configured. Admission can still be completed.</p>
          ) : null}
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

      {section === "admission" ? (
        <section className={cn(glassPanel, "space-y-4")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Admission information</h2>
          <SchoolField label="Admission date">
            <input type="date" className={inputClass} value={form.admissionDate} onChange={(event) => patch({ admissionDate: event.target.value })} />
          </SchoolField>
          <p className="text-[13px] text-slate-500">The admission number is generated by the system when this record is first saved.</p>
        </section>
      ) : null}

      {section === "review" ? (
        <section className={cn(glassPanel, "space-y-3")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Review & complete</h2>
          <dl className="grid grid-cols-1 gap-2 text-[13.5px] md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Student</dt>
              <dd className="font-medium text-navy">{[form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Placement</dt>
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
          <p className="text-[13px] text-slate-500">Completing this admission creates the student, enrollment, and guardian relationship in one transaction.</p>
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
