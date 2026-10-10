"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getStaffFormOptionsAction,
  saveSchoolStaffAction,
  type SchoolRoleOption,
  type StaffFormInput,
  type StaffPositionRow,
  type StaffProfile,
  type StaffStatus,
  type StaffTypeRow,
} from "@/actions/school/staff";
import { SchoolField, SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton } from "@/components/supermarket/purchasing-ui";
import { writeStaffFlash } from "@/lib/school/staff-flash";

const MANAGE_ROLES_HREF = "/owner/users?view=roles";

export function SchoolStaffFormPage({
  types: initialTypes,
  roles: initialRoles,
  positions: initialPositions = [],
  units: initialUnits = [],
  canManagePayroll = false,
  staff,
  error,
  optionsError = null,
  loadOptions = false,
}: {
  types: StaffTypeRow[];
  roles: SchoolRoleOption[];
  positions?: StaffPositionRow[];
  units?: Array<{ id: string; code: string; name: string }>;
  canManagePayroll?: boolean;
  staff: StaffProfile | null;
  error: string | null;
  optionsError?: string | null;
  loadOptions?: boolean;
}) {
  const router = useRouter();
  const [types, setTypes] = useState(initialTypes);
  const [roles, setRoles] = useState(initialRoles);
  const [positions, setPositions] = useState(initialPositions);
  const [units, setUnits] = useState(initialUnits);
  const [payroll, setPayroll] = useState(canManagePayroll);
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
    roleId: staff?.roleId ?? "",
    positionId: staff?.positionId ?? "",
    jobTitle: staff?.jobTitle ?? "",
    employmentStatus: (staff?.employmentStatus ?? "active") as StaffStatus,
    employmentDate: staff?.employmentDate ?? "",
    monthlySalary: staff?.monthlySalary ?? "",
    salaryEffectiveOn: staff?.salaryEffectiveOn ?? "",
    payday: staff?.payday ?? 28,
    salaryActive: staff?.salaryActive ?? true,
    salaryBusinessUnitId: staff?.salaryBusinessUnitId ?? "",
  });
  const [saveError, setSaveError] = useState<string | null>(staff ? null : error);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (!loadOptions) return;
    let active = true;
    void getStaffFormOptionsAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setTypes(result.types);
      setRoles(result.roles);
      if (result.positions) setPositions(result.positions);
      if (result.units) setUnits(result.units);
      if (result.capabilities) setPayroll(result.capabilities.canManagePayroll);
    });
    return () => {
      active = false;
    };
  }, [loadOptions]);

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
      if (!result.ok) {
        lock.current = false;
        setBusy(false);
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      if (result.staff) writeStaffFlash(result.staff);
      router.push("/school/staff");
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
          <p className="mt-1 text-[13.5px] text-slate-500">
            Staff is the school person. Access roles come from Users & Permissions and are optional for employees who do not log in.
          </p>
        </div>
        <SchoolWorkflowButton
          className={primaryButton}
          busy={busy}
          confirmed={saved}
          idleLabel="Save"
          busyLabel="Saving…"
          onClick={runSave}
        />
      </header>
      {!staff && (saveError || error) ? (
        <p className="text-[13px] text-[#c45b66]">{saveError || error}</p>
      ) : null}
      {staff && optionsError ? <p className="text-[13px] text-[#c45b66]">{optionsError}</p> : null}
      {staff && saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

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
            <select className={inputClass} value={form.staffTypeId} onChange={(event) => patch({ staffTypeId: event.target.value, positionId: "" })}>
              <option value="">Optional</option>
              {types
                .filter((row) => row.isActive)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </SchoolField>
          <SchoolField label="Position">
            <select className={inputClass} value={form.positionId ?? ""} onChange={(event) => patch({ positionId: event.target.value })}>
              <option value="">Optional</option>
              {positions
                .filter((row) => row.isActive && (!form.staffTypeId || row.staffTypeId === form.staffTypeId))
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </SchoolField>
          <SchoolField label="Job title">
            <input className={inputClass} value={form.jobTitle ?? ""} onChange={(event) => patch({ jobTitle: event.target.value })} placeholder="e.g. Cleaner, Teacher, Driver" />
          </SchoolField>
          <SchoolField label="Application role">
            <select className={inputClass} value={form.roleId} onChange={(event) => patch({ roleId: event.target.value })}>
              <option value="">None — no system login required</option>
              {roles.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[12.5px] text-slate-500">
              Access role is not a job title.{" "}
              <Link href={MANAGE_ROLES_HREF} className="font-medium text-navy hover:underline">
                Manage Roles & Permissions →
              </Link>
            </p>
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

      {payroll ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Salary (optional)</h2>
          <p className="text-[12.5px] text-slate-500">
            A monthly salary is a commitment, not a payment. Leave this blank for owners and users who are not paid through payroll.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SchoolField label="Monthly salary (TZS)">
              <input
                className={inputClass}
                value={form.monthlySalary ?? ""}
                onChange={(event) => patch({ monthlySalary: event.target.value })}
                placeholder="Optional"
              />
            </SchoolField>
            <SchoolField label="Business unit">
              <select
                className={inputClass}
                value={form.salaryBusinessUnitId ?? ""}
                onChange={(event) => patch({ salaryBusinessUnitId: event.target.value })}
              >
                <option value="">School (default)</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Payday (day of month)">
              <select
                className={inputClass}
                value={String(form.payday ?? 28)}
                onChange={(event) => patch({ payday: Number(event.target.value) })}
              >
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </SchoolField>
            <SchoolField label="Effective from">
              <input
                type="date"
                className={inputClass}
                value={form.salaryEffectiveOn ?? ""}
                onChange={(event) => patch({ salaryEffectiveOn: event.target.value })}
              />
            </SchoolField>
            <SchoolField label="Salary arrangement">
              <select
                className={inputClass}
                value={form.salaryActive === false ? "inactive" : "active"}
                onChange={(event) => patch({ salaryActive: event.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </SchoolField>
          </div>
        </section>
      ) : null}
    </div>
  );
}
