"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assignSchoolStudentStreamAction, type StudentProfile } from "@/actions/school/students";
import { glassPanel, inputClass, primaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";
import { formatCompactStudentNumber } from "@/lib/school/student-number";
import { SchoolWorkflowButton } from "@/components/school/school-ui";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-navy">{value || "—"}</p>
    </div>
  );
}

export function SchoolStudentProfilePage({
  student,
  canManage = false,
  error,
  pending = false,
}: {
  student: StudentProfile | null;
  canManage?: boolean;
  error: string | null;
  pending?: boolean;
}) {
  if (!student && pending) {
    return (
      <div className="min-w-0 max-w-full space-y-5 pb-10">
        <Link href="/school/students" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Students
        </Link>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Student</h1>
      </div>
    );
  }
  if (!student) {
    return (
      <div className="min-w-0 max-w-full space-y-4 pb-10">
        <Link href="/school/students" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Students
        </Link>
        <p className="text-[13px] text-[#c45b66]">{error ?? "Student was not found."}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/students" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Students
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">
            {[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {formatCompactStudentNumber(student.studentNumber)}
            {student.admissionNumber ? ` · ${student.admissionNumber}` : ""}
          </p>
        </div>
        <StatusPill value={student.status === "active" ? "Active" : "Inactive"} />
      </header>
      <EnrollmentFacts student={student} canManage={canManage} />

      <section className={`${glassPanel} grid grid-cols-1 gap-4 md:grid-cols-2`}>
        <Fact label="Admission no." value={student.admissionNumber} />
        <Fact label="Student no." value={formatCompactStudentNumber(student.studentNumber)} />
        <Fact label="Date of birth" value={student.dateOfBirth} />
        <Fact label="Gender" value={student.gender} />
        <Fact label="Nationality" value={student.nationality} />
        <Fact label="Phone" value={student.phone} />
        <Fact label="Email" value={student.email} />
        <Fact label="Address" value={student.address} />
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Guardians</h2>
        {student.guardians.length ? (
          <ul className="space-y-2">
            {student.guardians.map((guardian) => (
              <li key={guardian.id} className="text-[13.5px] text-navy">
                <span className="font-medium">{guardian.fullName}</span>
                {guardian.relationship ? ` · ${guardian.relationship}` : ""}
                {guardian.phone ? ` · ${guardian.phone}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-slate-500">No guardian is linked to this student.</p>
        )}
      </section>
    </div>
  );
}

function EnrollmentFacts({ student, canManage }: { student: StudentProfile; canManage: boolean }) {
  const [streamId, setStreamId] = useState(student.streamId);
  const [streamName, setStreamName] = useState(student.streamName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    void assignSchoolStudentStreamAction({ studentId: student.id, streamId }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStreamName(student.streams.find((row) => row.id === streamId)?.name ?? "");
    });
  }

  return (
    <section className={`${glassPanel} space-y-3`}>
      <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Current enrollment</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Fact label="Academic year" value={student.academicYearName} />
        <Fact label="Term" value={student.termName} />
        <Fact label="Level" value={student.levelName} />
        <Fact label="Class" value={student.className} />
        <Fact label="Stream" value={streamName} />
        <Fact label="Enrollment status" value={student.enrollmentStatus} />
      </div>
      {canManage && student.enrollmentId ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Assign stream</span>
            <select className={inputClass} value={streamId} onChange={(event) => setStreamId(event.target.value)}>
              <option value="">No stream — assign later</option>
              {student.streams.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Save stream" busyLabel="Saving" onClick={save} />
        </div>
      ) : null}
      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {canManage && student.classId && !student.streams.length ? (
        <p className="text-[13px] text-slate-500">This class has no streams configured.</p>
      ) : null}
      <p className="text-[13px] text-slate-500">
        {student.attendanceEligible ? "Eligible for attendance in this class." : "Not currently eligible for attendance."}
      </p>
    </section>
  );
}
