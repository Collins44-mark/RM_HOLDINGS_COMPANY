"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  saveSchoolStaffAction,
  saveSchoolStaffPositionAction,
  saveSchoolStaffTypeAction,
  type StaffFormInput,
  type StaffPositionRow,
  type StaffProfile,
  type StaffStatus,
  type StaffTypeKind,
  type StaffTypeRow,
} from "@/actions/school/staff";
import { SchoolField, SchoolGlassModal, SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

export function SchoolStaffFormPage({
  types: initialTypes,
  positions: initialPositions,
  staff,
  error,
}: {
  types: StaffTypeRow[];
  positions: StaffPositionRow[];
  staff: StaffProfile | null;
  error: string | null;
}) {
  const router = useRouter();
  const [types, setTypes] = useState(initialTypes);
  const [positions, setPositions] = useState(initialPositions);
  const [form, setForm] = useState<StaffFormInput>({
    id: staff?.id,
    firstName: staff?.firstName ?? "",
    middleName: staff?.middleName ?? "",
    lastName: staff?.lastName ?? "",
    gender: staff?.gender ?? "",
    dateOfBirth: staff?.dateOfBirth ?? "",
    phone: staff?.phone ?? "",
    email: staff?.email ?? "",
    address: staff?.address ?? "",
    staffTypeId: staff?.staffTypeId ?? "",
    positionId: staff?.positionId ?? "",
    employmentStatus: (staff?.employmentStatus ?? "active") as StaffStatus,
    employmentDate: staff?.employmentDate ?? "",
  });
  const [saveError, setSaveError] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeKind, setTypeKind] = useState<StaffTypeKind>("academic");
  const [positionName, setPositionName] = useState("");
  const lock = useRef(false);
  const typePositions = positions.filter((row) => row.staffTypeId === form.staffTypeId && row.isActive);

  function patch(next: Partial<StaffFormInput>) {
    setForm((current) => ({ ...current, ...next }));
    setSaved(false);
  }

  function runSave() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    void saveSchoolStaffAction(form).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.push(`/school/staff/${result.id}`);
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/staff" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Staff
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{staff ? staff.staffNumber : "Add Staff"}</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">One staff record. Academic or transport work is added as assignments.</p>
        </div>
        <SchoolWorkflowButton className={primaryButton} busy={busy} confirmed={saved} idleLabel="Save" onClick={runSave} />
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <section className={`${glassPanel} space-y-4`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Personal information</h2>
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
          <SchoolField label="Gender">
            <select className={inputClass} value={form.gender} onChange={(event) => patch({ gender: event.target.value })}>
              <option value="">Optional</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </SchoolField>
          <SchoolField label="Date of birth">
            <input type="date" className={inputClass} value={form.dateOfBirth} onChange={(event) => patch({ dateOfBirth: event.target.value })} />
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

      <section className={`${glassPanel} space-y-4`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Employment</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SchoolField label="Staff type">
            <div className="flex gap-2">
              <select
                className={inputClass}
                value={form.staffTypeId}
                onChange={(event) => patch({ staffTypeId: event.target.value, positionId: "" })}
              >
                <option value="">Select type</option>
                {types
                  .filter((row) => row.isActive)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              <button type="button" className={secondaryButton} onClick={() => setTypeModal(true)}>
                +
              </button>
            </div>
          </SchoolField>
          <SchoolField label="Position">
            <div className="flex gap-2">
              <select
                className={inputClass}
                value={form.positionId}
                disabled={!form.staffTypeId}
                onChange={(event) => patch({ positionId: event.target.value })}
              >
                <option value="">Select position</option>
                {typePositions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <button type="button" className={secondaryButton} disabled={!form.staffTypeId} onClick={() => setPositionModal(true)}>
                +
              </button>
            </div>
          </SchoolField>
          <SchoolField label="Employment status">
            <select
              className={inputClass}
              value={form.employmentStatus}
              onChange={(event) => patch({ employmentStatus: event.target.value as StaffStatus })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </SchoolField>
          <SchoolField label="Employment date">
            <input type="date" className={inputClass} value={form.employmentDate} onChange={(event) => patch({ employmentDate: event.target.value })} />
          </SchoolField>
        </div>
      </section>

      {typeModal ? (
        <SchoolGlassModal
          title="Add staff type"
          subtitle="Academic, administrative, support, or transport."
          onClose={() => setTypeModal(false)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setTypeModal(false)}>
                Cancel
              </button>
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Save type"
                onClick={() => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  void saveSchoolStaffTypeAction({ name: typeName, kind: typeKind }).then((result) => {
                    lock.current = false;
                    setBusy(false);
                    if (!result.ok) {
                      setSaveError(result.error);
                      return;
                    }
                    setTypes((current) => [...current, result.type]);
                    patch({ staffTypeId: result.type.id, positionId: "" });
                    setTypeName("");
                    setTypeModal(false);
                  });
                }}
              />
            </>
          }
        >
          <SchoolField label="Name">
            <input className={inputClass} value={typeName} onChange={(event) => setTypeName(event.target.value)} />
          </SchoolField>
          <SchoolField label="Function">
            <select className={inputClass} value={typeKind} onChange={(event) => setTypeKind(event.target.value as StaffTypeKind)}>
              <option value="academic">Academic</option>
              <option value="administrative">Administrative</option>
              <option value="support">Support</option>
              <option value="transport">Transport</option>
            </select>
          </SchoolField>
        </SchoolGlassModal>
      ) : null}

      {positionModal ? (
        <SchoolGlassModal
          title="Add position"
          subtitle="Teacher, Driver, Cleaner, and similar roles belong here."
          onClose={() => setPositionModal(false)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setPositionModal(false)}>
                Cancel
              </button>
              <SchoolWorkflowButton
                className={primaryButton}
                busy={busy}
                idleLabel="Save position"
                onClick={() => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  const type = types.find((row) => row.id === form.staffTypeId);
                  void saveSchoolStaffPositionAction({
                    staffTypeId: form.staffTypeId,
                    name: positionName,
                    allowsAcademicAssignments: type?.kind === "academic",
                  }).then((result) => {
                    lock.current = false;
                    setBusy(false);
                    if (!result.ok) {
                      setSaveError(result.error);
                      return;
                    }
                    setPositions((current) => [...current, result.position]);
                    patch({ positionId: result.position.id });
                    setPositionName("");
                    setPositionModal(false);
                  });
                }}
              />
            </>
          }
        >
          <SchoolField label="Name">
            <input className={inputClass} value={positionName} onChange={(event) => setPositionName(event.target.value)} />
          </SchoolField>
        </SchoolGlassModal>
      ) : null}
    </div>
  );
}
