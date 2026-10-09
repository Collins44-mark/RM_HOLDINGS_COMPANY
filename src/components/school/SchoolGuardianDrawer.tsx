"use client";

import { useState } from "react";
import Link from "next/link";
import { updateSchoolGuardianAction, type GuardianListRow, type GuardianSaveFields } from "@/actions/school/parents";
import { inputClass, primaryButton } from "@/components/supermarket/purchasing-ui";
import { SchoolField, SchoolWorkflowButton } from "@/components/school/school-ui";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";

export type GuardianDraft = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  relationship?: string;
  studentId?: string;
  students?: GuardianListRow["students"];
};

export function SchoolGuardianDrawer({
  guardian,
  mode,
  onClose,
  onSaved,
}: {
  guardian: GuardianDraft;
  mode: "view" | "edit";
  onClose: () => void;
  onSaved: (row: GuardianListRow) => void;
}) {
  const readOnly = mode === "view";
  const [fullName, setFullName] = useState(guardian.fullName);
  const [phone, setPhone] = useState(guardian.phone);
  const [email, setEmail] = useState(guardian.email);
  const [address, setAddress] = useState(guardian.address);
  const [occupation, setOccupation] = useState(guardian.occupation);
  const [relationship, setRelationship] = useState(guardian.relationship ?? "");
  const [fields, setFields] = useState<GuardianSaveFields>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showRelationship = Boolean(guardian.studentId) || (guardian.students?.length ?? 0) === 1;
  const studentId = guardian.studentId || (guardian.students?.length === 1 ? guardian.students[0]?.studentId : "");

  async function save() {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    setFields({});
    const result = await updateSchoolGuardianAction({
      id: guardian.id,
      fullName,
      phone,
      email,
      address,
      occupation,
      studentId: showRelationship ? studentId : undefined,
      relationship: showRelationship ? relationship : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    if (result.guardian) onSaved(result.guardian);
    onClose();
  }

  return (
    <ContainedDrawer
      title={readOnly ? "Guardian" : "Edit guardian"}
      subtitle={readOnly ? "Linked contact details for this school." : "Update the shared guardian record. Linked students stay attached."}
      dirty={!readOnly && Boolean(fullName !== guardian.fullName || phone !== guardian.phone || email !== guardian.email || address !== guardian.address || occupation !== guardian.occupation || relationship !== (guardian.relationship ?? ""))}
      busy={busy}
      onClose={onClose}
      footer={
        readOnly ? (
          <DrawerCancel>Close</DrawerCancel>
        ) : (
          <>
            <DrawerCancel disabled={busy} />
            <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Save changes" onClick={() => void save()} />
          </>
        )
      }
    >
      <div className="space-y-3 pb-4">
        {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
        <SchoolField label="Full name">
          <input
            className={inputClass}
            value={fullName}
            disabled={readOnly}
            onChange={(event) => setFullName(event.target.value)}
          />
          {fields.fullName ? <p className="mt-1 text-[12px] text-[#c45b66]">{fields.fullName}</p> : null}
        </SchoolField>
        <SchoolField label="Phone">
          <input className={inputClass} value={phone} disabled={readOnly} onChange={(event) => setPhone(event.target.value)} />
          {fields.phone ? <p className="mt-1 text-[12px] text-[#c45b66]">{fields.phone}</p> : null}
        </SchoolField>
        <SchoolField label="Email">
          <input className={inputClass} value={email} disabled={readOnly} onChange={(event) => setEmail(event.target.value)} />
          {fields.email ? <p className="mt-1 text-[12px] text-[#c45b66]">{fields.email}</p> : null}
        </SchoolField>
        {showRelationship ? (
          <SchoolField label="Relationship">
            <input
              className={inputClass}
              value={relationship}
              disabled={readOnly}
              onChange={(event) => setRelationship(event.target.value)}
            />
            {fields.relationship ? <p className="mt-1 text-[12px] text-[#c45b66]">{fields.relationship}</p> : null}
          </SchoolField>
        ) : null}
        <SchoolField label="Address">
          <input className={inputClass} value={address} disabled={readOnly} onChange={(event) => setAddress(event.target.value)} />
        </SchoolField>
        <SchoolField label="Occupation">
          <input
            className={inputClass}
            value={occupation}
            disabled={readOnly}
            onChange={(event) => setOccupation(event.target.value)}
          />
        </SchoolField>
        {guardian.students?.length ? (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-slate-500">Linked students</p>
            <ul className="space-y-1.5">
              {guardian.students.map((student) => (
                <li key={student.studentId || student.name} className="text-[13.5px] text-navy">
                  {student.studentId ? (
                    <Link href={`/school/students/${student.studentId}`} className="font-medium hover:underline">
                      {student.name || "Student"}
                    </Link>
                  ) : (
                    <span className="font-medium">{student.name || "—"}</span>
                  )}
                  {student.relationship ? <span className="text-slate-500"> · {student.relationship}</span> : null}
                  {student.className ? <span className="text-slate-500"> · {student.className}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ContainedDrawer>
  );
}
