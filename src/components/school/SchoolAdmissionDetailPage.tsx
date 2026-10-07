"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { AdmissionDetail } from "@/actions/school/admissions";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { glassPanel, primaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";
import { SchoolIconWell } from "@/components/school/school-ui";
import { UserPlus } from "lucide-react";
import { formatTzs } from "@/lib/format/currency";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-navy">{value || "—"}</p>
    </div>
  );
}

export function SchoolAdmissionDetailPage({
  admission,
  canManage,
  error,
}: {
  admission: AdmissionDetail | null;
  canManage: boolean;
  error: string | null;
}) {
  const router = useRouter();
  if (!admission) {
    return (
      <div className="min-w-0 max-w-full space-y-4 pb-10">
        <Link href="/school/admissions" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Admissions
        </Link>
        <p className="text-[13px] text-[#c45b66]">{error ?? "Admission was not found."}</p>
      </div>
    );
  }

  const statusLabel = admission.status === "draft" ? "Draft" : admission.status === "completed" ? "Completed" : "Cancelled";

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/admissions" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Admissions
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <SchoolIconWell icon={UserPlus} />
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{admission.admissionNumber}</h1>
            <p className="mt-1 text-[13.5px] text-slate-500">
              {[admission.firstName, admission.middleName, admission.lastName].filter(Boolean).join(" ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill value={statusLabel} />
          {canManage && admission.status === "draft" ? (
            <CompactActionsMenu
              ariaLabel="Admission actions"
              items={[
                { label: "Edit", onSelect: () => router.push(`/school/admissions/${admission.id}/edit`) },
                { label: "Complete", onSelect: () => router.push(`/school/admissions/${admission.id}/edit`) },
              ]}
            />
          ) : null}
          {admission.studentId ? (
            <Link href={`/school/students/${admission.studentId}`} className={primaryButton}>
              View Student
            </Link>
          ) : null}
        </div>
      </header>

      <section className={`${glassPanel} grid grid-cols-1 gap-4 md:grid-cols-2`}>
        <Fact label="Status" value={statusLabel} />
        <Fact label="Admission date" value={admission.admissionDate} />
        <Fact label="Academic year" value={admission.academicYearName} />
        <Fact label="Term" value={admission.termName} />
        <Fact label="Level" value={admission.levelName} />
        <Fact label="Class" value={admission.className} />
        <Fact label="Stream" value={admission.streamName} />
        <Fact label="Student number" value={admission.studentNumber ?? ""} />
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Student</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Fact label="Name" value={[admission.firstName, admission.middleName, admission.lastName].filter(Boolean).join(" ")} />
          <Fact label="Date of birth" value={admission.dateOfBirth} />
          <Fact label="Gender" value={admission.gender} />
          <Fact label="Nationality" value={admission.nationality} />
          <Fact label="Address" value={admission.address} />
        </div>
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Guardian</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Fact label="Name" value={admission.guardianFullName} />
          <Fact label="Relationship" value={admission.guardianRelationship} />
          <Fact label="Phone" value={admission.guardianPhone} />
          <Fact label="Email" value={admission.guardianEmail} />
          <Fact label="Occupation" value={admission.guardianOccupation} />
          <Fact label="Address" value={admission.guardianAddress} />
        </div>
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Applicable fees</h2>
        {admission.fee.configured ? (
          <div className="space-y-1 text-[13.5px] text-navy">
            <p>Applicable Annual Fee: {formatTzs(admission.fee.annualAmount ?? 0)}</p>
            {admission.fee.currentTermAmount != null && admission.fee.currentTermName ? (
              <p>
                Current Term Fee · {admission.fee.currentTermName}: {formatTzs(admission.fee.currentTermAmount)}
              </p>
            ) : (
              <p className="text-slate-500">Term fee not configured</p>
            )}
          </div>
        ) : (
          <p className="text-[13.5px] text-slate-500">Fee structure not configured for this class.</p>
        )}
        <p className="text-[13px] text-slate-500">
          {admission.attendanceEligible
            ? "This student is eligible for attendance through the active enrollment."
            : "Attendance eligibility starts after this admission is completed."}
        </p>
      </section>
    </div>
  );
}
