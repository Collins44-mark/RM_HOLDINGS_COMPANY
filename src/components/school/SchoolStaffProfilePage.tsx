"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  archiveSchoolStaffAction,
  archiveStaffAssignmentAction,
  getSchoolStaffAction,
  getStaffClassesAction,
  getStaffStreamsAction,
  grantStaffSystemAccessAction,
  linkStaffToUserAction,
  searchUnlinkedUsersAction,
  saveSchoolDepartmentAction,
  saveSchoolSubjectRecordAction,
  saveStaffAssignmentAction,
  unlinkStaffFromUserAction,
  type AssignmentType,
  type DepartmentRow,
  type StaffOption,
  type StaffProfile,
  type SubjectRow,
} from "@/actions/school/staff";
import { rolesForSelectedModules, displayRoleName } from "@/lib/auth/role-options";
import type { CredentialsPayload } from "@/actions/users";
import type { StaffLinkUserOption } from "@/lib/school/staff-profile-link";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { SchoolConfirmDialog, SchoolField, SchoolGlassModal, SchoolWorkflowButton } from "@/components/school/school-ui";
import { glassPanel, inputClass, primaryButton, secondaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-navy">{value || "—"}</p>
    </div>
  );
}

function assignmentTitle(type: AssignmentType) {
  if (type === "CLASS_TEACHER") return "Class Teacher";
  if (type === "SUBJECT_TEACHER") return "Subject Teacher";
  if (type === "LEVEL_HEAD") return "Level Head";
  return "Department Head";
}

export function SchoolStaffProfilePage({
  staff: initialStaff,
  years,
  levels,
  departments: initialDepartments,
  subjects: initialSubjects,
  canManage,
  canManageSystemAccess,
  openAccess = false,
  error,
}: {
  staff: StaffProfile | null;
  years: Array<{ id: string; name: string; isCurrent: boolean }>;
  levels: StaffOption[];
  departments: DepartmentRow[];
  subjects: SubjectRow[];
  canManage: boolean;
  canManageSystemAccess: boolean;
  openAccess?: boolean;
  error: string | null;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [departments, setDepartments] = useState(initialDepartments);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; payload: Parameters<typeof saveStaffAssignmentAction>[0] } | null>(null);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("CLASS_TEACHER");
  const [academicYearId, setAcademicYearId] = useState(years.find((row) => row.isCurrent)?.id ?? years[0]?.id ?? "");
  const [levelId, setLevelId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [classes, setClasses] = useState<StaffOption[]>([]);
  const [streams, setStreams] = useState<StaffOption[]>([]);
  const [deptName, setDeptName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [accessOpen, setAccessOpen] = useState(openAccess);
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!levelId) return;
    let active = true;
    void getStaffClassesAction(levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [levelId]);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    void getStaffStreamsAction(classId).then((result) => {
      if (!active || !result.ok) return;
      setStreams(result.streams);
    });
    return () => {
      active = false;
    };
  }, [classId]);

  function reload() {
    if (!staff) return;
    void getSchoolStaffAction(staff.id).then((result) => {
      if (result.ok) setStaff(result.staff);
    });
  }

  function payload(replaceExisting = false) {
    return {
      staffId: staff?.id ?? "",
      assignmentType,
      academicYearId,
      levelId,
      classId,
      streamId,
      subjectId,
      departmentId,
      replaceExisting,
    };
  }

  function runSave(replaceExisting = false) {
    if (!staff || lock.current) return;
    lock.current = true;
    setBusy(true);
    setSaveError(null);
    void saveStaffAssignmentAction(payload(replaceExisting)).then((result) => {
      lock.current = false;
      setBusy(false);
      if (!result.ok) {
        if ("conflict" in result && result.conflict) {
          setConflict({ message: result.error, payload: payload(true) });
          return;
        }
        setSaveError(result.error);
        return;
      }
      setDrawer(false);
      setConflict(null);
      reload();
    });
  }

  if (!staff) {
    return (
      <div className="min-w-0 max-w-full space-y-4 pb-10">
        <Link href="/school/staff" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Staff
        </Link>
        <p className="text-[13px] text-[#c45b66]">{error ?? "Staff member was not found."}</p>
      </div>
    );
  }

  const visibleClasses = levelId ? classes : [];
  const visibleStreams = classId ? streams : [];
  const needsPlacement = assignmentType === "CLASS_TEACHER" || assignmentType === "SUBJECT_TEACHER";

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <Link href="/school/staff" className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Staff
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">
            {[staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ")}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {staff.staffNumber} · {staff.positionName || staff.typeName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill value={staff.employmentStatus === "active" ? "Active" : "Inactive"} />
          {canManage ? (
            <Link href={`/school/staff/${staff.id}/edit`} className={secondaryButton}>
              Edit Staff
            </Link>
          ) : null}
          {canManage && staff.employmentStatus === "active" ? (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                void archiveSchoolStaffAction(staff.id).then((result) => {
                  if (!result.ok) {
                    setSaveError(result.error);
                    return;
                  }
                  reload();
                });
              }}
            >
              Archive Staff
            </button>
          ) : null}
        </div>
      </header>
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <section className={`${glassPanel} grid grid-cols-1 gap-4 md:grid-cols-2`}>
        <Fact label="Staff no." value={staff.staffNumber} />
        <Fact label="Type" value={staff.typeName} />
        <Fact label="Position" value={staff.positionName} />
        <Fact label="Phone" value={staff.phone} />
        <Fact label="Email" value={staff.email} />
        <Fact label="Address" value={staff.address} />
        <Fact label="Employment date" value={staff.employmentDate} />
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">System Access</h2>
          {canManageSystemAccess ? (
            staff.hasSystemAccess ? (
              <div className="flex gap-2">
                <Link href="/owner/users" className={secondaryButton}>
                  View User Access
                </Link>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    void unlinkStaffFromUserAction(staff.id).then((result) => {
                      if (!result.ok) {
                        setSaveError(result.error);
                        return;
                      }
                      reload();
                    });
                  }}
                >
                  Unlink account
                </button>
              </div>
            ) : (
              <button type="button" className={primaryButton} onClick={() => setAccessOpen(true)}>
                Give System Access
              </button>
            )
          ) : null}
        </div>
        {staff.hasSystemAccess ? (
          <p className="text-[13.5px] text-navy">
            Linked to user account
            {staff.linkedAccountName ? ` · ${staff.linkedAccountName}` : ""}
            {staff.linkedAccountEmail ? ` · ${staff.linkedAccountEmail}` : ""}
          </p>
        ) : (
          <p className="text-[13.5px] text-slate-500">No system access</p>
        )}
      </section>

      <section className={`${glassPanel} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Academic responsibilities</h2>
          {canManage && staff.allowsAcademicAssignments ? (
            <button type="button" className={primaryButton} onClick={() => setDrawer(true)}>
              + Add assignment
            </button>
          ) : null}
        </div>
        {!staff.allowsAcademicAssignments ? (
          <p className="text-[13.5px] text-slate-500">This position does not take academic assignments. Transport and other duties can be linked later from their modules.</p>
        ) : staff.assignments.filter((row) => row.isActive).length === 0 ? (
          <p className="text-[13.5px] text-slate-500">No academic assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {staff.assignments
              .filter((row) => row.isActive)
              .map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 rounded-[14px] border border-navy/8 bg-white/70 px-4 py-3">
                  <div>
                    <p className="text-[13.5px] font-semibold text-navy">{assignmentTitle(row.assignmentType)}</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-500">
                      {[row.academicYearName, row.departmentName, row.subjectName, row.levelName, row.className, row.streamName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {canManage ? (
                    <CompactActionsMenu
                      ariaLabel={`${assignmentTitle(row.assignmentType)} actions`}
                      items={[{ label: "Archive", onSelect: () => setArchiveId(row.id) }]}
                    />
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>

      {drawer ? (
        <SchoolGlassModal
          title="Add assignment"
          subtitle="Only the fields needed for this responsibility are shown."
          onClose={() => setDrawer(false)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setDrawer(false)}>
                Cancel
              </button>
              <SchoolWorkflowButton className={primaryButton} busy={busy} idleLabel="Save assignment" onClick={() => runSave(false)} />
            </>
          }
        >
          <SchoolField label="Assignment type">
            <select
              className={inputClass}
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value as AssignmentType)}
            >
              <option value="CLASS_TEACHER">Class Teacher</option>
              <option value="SUBJECT_TEACHER">Subject Teacher</option>
              <option value="LEVEL_HEAD">Level Head</option>
              <option value="DEPARTMENT_HEAD">Department Head</option>
            </select>
          </SchoolField>
          <SchoolField label="Academic year">
            <select className={inputClass} value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}>
              <option value="">Optional</option>
              {years.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </SchoolField>
          {assignmentType === "LEVEL_HEAD" || needsPlacement ? (
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
                {levels.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </SchoolField>
          ) : null}
          {needsPlacement ? (
            <>
              <SchoolField label="Class">
                <select
                  className={inputClass}
                  value={classId}
                  disabled={!levelId}
                  onChange={(event) => {
                    setClassId(event.target.value);
                    setStreamId("");
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
                <select className={inputClass} value={streamId} disabled={!classId} onChange={(event) => setStreamId(event.target.value)}>
                  <option value="">{assignmentType === "SUBJECT_TEACHER" ? "Optional" : "Select stream"}</option>
                  {visibleStreams.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </SchoolField>
            </>
          ) : null}
          {assignmentType === "SUBJECT_TEACHER" ? (
            <SchoolField label="Subject">
              <div className="space-y-2">
                <select className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                  <option value="">Select subject</option>
                  {subjects.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input className={inputClass} value={subjectName} placeholder="New subject" onChange={(event) => setSubjectName(event.target.value)} />
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      void saveSchoolSubjectRecordAction({ name: subjectName, departmentId }).then((result) => {
                        if (!result.ok) {
                          setSaveError(result.error);
                          return;
                        }
                        setSubjects((current) => [...current, result.subject]);
                        setSubjectId(result.subject.id);
                        setSubjectName("");
                      });
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </SchoolField>
          ) : null}
          {assignmentType === "DEPARTMENT_HEAD" ? (
            <SchoolField label="Department">
              <div className="space-y-2">
                <select className={inputClass} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                  <option value="">Select department</option>
                  {departments.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input className={inputClass} value={deptName} placeholder="New department" onChange={(event) => setDeptName(event.target.value)} />
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      void saveSchoolDepartmentAction({ name: deptName }).then((result) => {
                        if (!result.ok) {
                          setSaveError(result.error);
                          return;
                        }
                        setDepartments((current) => [...current, result.department]);
                        setDepartmentId(result.department.id);
                        setDeptName("");
                      });
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </SchoolField>
          ) : null}
        </SchoolGlassModal>
      ) : null}

      {accessOpen && canManageSystemAccess ? (
        <StaffSystemAccessDialog
          staff={staff}
          busy={busy}
          onClose={() => setAccessOpen(false)}
          onError={setSaveError}
          onBusy={setBusy}
          onLinked={() => {
            setAccessOpen(false);
            reload();
          }}
          onCreated={(next) => {
            setAccessOpen(false);
            if (next) setCredentials(next);
            reload();
          }}
        />
      ) : null}

      {credentials ? (
        <SchoolGlassModal
          title="System access created"
          subtitle="Copy these login details now. The temporary password will not be shown again."
          onClose={() => setCredentials(null)}
          footer={
            <button type="button" className={primaryButton} onClick={() => setCredentials(null)}>
              Done
            </button>
          }
        >
          <p className="text-[13.5px] text-navy">Name: {credentials.name}</p>
          <p className="text-[13.5px] text-navy">Login: {credentials.loginIdentifier}</p>
          <p className="text-[13.5px] text-navy">Temporary password: {credentials.temporaryPassword}</p>
          <p className="text-[13.5px] text-navy">Role: {credentials.roleName}</p>
        </SchoolGlassModal>
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(conflict)}
        title="Assignment already held"
        message={conflict ? `${conflict.message} Replace the current holder?` : ""}
        confirmLabel="Replace"
        busy={busy}
        onCancel={() => setConflict(null)}
        onConfirm={() => runSave(true)}
      />
      <SchoolConfirmDialog
        open={Boolean(archiveId)}
        title="Archive assignment"
        message="This assignment will be marked inactive and kept for academic history."
        confirmLabel="Archive"
        busy={busy}
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          if (!archiveId || lock.current) return;
          lock.current = true;
          setBusy(true);
          void archiveStaffAssignmentAction(archiveId).then((result) => {
            lock.current = false;
            setBusy(false);
            if (!result.ok) {
              setSaveError(result.error);
              return;
            }
            setArchiveId(null);
            reload();
          });
        }}
      />
    </div>
  );
}

function StaffSystemAccessDialog({
  staff,
  busy,
  onClose,
  onError,
  onBusy,
  onLinked,
  onCreated,
}: {
  staff: StaffProfile;
  busy: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onBusy: (value: boolean) => void;
  onLinked: () => void;
  onCreated: (credentials: CredentialsPayload | undefined) => void;
}) {
  const [mode, setMode] = useState<"link" | "create">("link");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<StaffLinkUserOption[]>([]);
  const [email, setEmail] = useState(staff.email);
  const [phone, setPhone] = useState(staff.phone);
  const schoolRoles = rolesForSelectedModules(["school"]);
  const [roleCode, setRoleCode] = useState<string>(schoolRoles[0]?.code ?? "");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void searchUnlinkedUsersAction(query).then((result) => {
        if (result.ok) setUsers(result.users);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <SchoolGlassModal
      title="Give System Access"
      subtitle="Create a login with the existing Users & Permissions flow, or link an account that already exists."
      onClose={onClose}
      footer={
        mode === "create" ? (
          <>
            <button type="button" className={secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <SchoolWorkflowButton
              className={primaryButton}
              busy={busy}
              idleLabel="Create account"
              onClick={() => {
                onBusy(true);
                void grantStaffSystemAccessAction({ staffId: staff.id, email, phone, roleCode }).then((result) => {
                  onBusy(false);
                  if (!result.ok) {
                    onError(result.error);
                    return;
                  }
                  onCreated(result.credentials);
                });
              }}
            />
          </>
        ) : (
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="flex gap-2">
        <button type="button" className={mode === "link" ? primaryButton : secondaryButton} onClick={() => setMode("link")}>
          Link existing
        </button>
        <button type="button" className={mode === "create" ? primaryButton : secondaryButton} onClick={() => setMode("create")}>
          Create new account
        </button>
      </div>
      {mode === "link" ? (
        <div className="space-y-2">
          <input
            className={inputClass}
            value={query}
            placeholder="Search existing users"
            onChange={(event) => setQuery(event.target.value)}
          />
          {users.map((row) => (
            <button
              key={row.id}
              type="button"
              className="w-full rounded-[12px] border border-navy/8 bg-white px-3 py-2.5 text-left"
              onClick={() => {
                onBusy(true);
                void linkStaffToUserAction({ staffId: staff.id, profileId: row.id }).then((result) => {
                  onBusy(false);
                  if (!result.ok) {
                    onError(result.error);
                    return;
                  }
                  onLinked();
                });
              }}
            >
              <p className="text-[13.5px] font-semibold text-navy">{row.name}</p>
              <p className="text-[12px] text-slate-500">{[row.email, row.phone].filter(Boolean).join(" · ") || "No contact"}</p>
            </button>
          ))}
          {users.length === 0 ? <p className="text-[13px] text-slate-500">No unlinked user accounts match.</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <SchoolField label="Email">
            <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} />
          </SchoolField>
          <SchoolField label="Phone">
            <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </SchoolField>
          <SchoolField label="System role">
            <select className={inputClass} value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>
              {schoolRoles.map((role) => (
                <option key={role.code} value={role.code}>
                  {displayRoleName(role.code, role.name)}
                </option>
              ))}
            </select>
          </SchoolField>
        </div>
      )}
    </SchoolGlassModal>
  );
}
