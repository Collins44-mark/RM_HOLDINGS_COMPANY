"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  getSchoolSettingsWorkspaceAction,
  saveAcademicYearAction,
  saveAttendanceSettingsAction,
  saveAttendanceStatusAction,
  saveClassLevelAction,
  saveFeeCategoryAction,
  saveGradingBandAction,
  saveSchoolProfileAction,
  saveTermAction,
  saveTransportSettingsAction,
  type AcademicYearRow,
  type AttendanceSettings,
  type AttendanceStatusRow,
  type ClassLevelRow,
  type FeeCategoryRow,
  type GradingBandRow,
  type SchoolProfile,
  type TermRow,
  type TransportSettings,
} from "@/actions/school/settings";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { cn } from "@/lib/cn";
import {
  glassPanel,
  inputClass,
  primaryButton,
  PulseBar,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";

type Tab = "general" | "academic" | "fees" | "attendance" | "transport";
type LoadPhase = "loading" | "ready" | "error";
type DrawerKind = "year" | "term" | "class" | "grade" | "fee" | "status" | null;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "academic", label: "Academic" },
  { id: "fees", label: "Fees" },
  { id: "attendance", label: "Attendance" },
  { id: "transport", label: "Transport" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function WorkflowAction({
  className,
  busy,
  disabled,
  idleLabel,
  confirmed,
  onClick,
}: {
  className: string;
  busy: boolean;
  disabled?: boolean;
  idleLabel: string;
  confirmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} className={cn(className, "relative min-w-[8.75rem]")}>
      <span className={cn("inline-flex items-center justify-center", busy && "invisible")}>
        {confirmed ? "Saved ✓" : idleLabel}
      </span>
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
        </span>
      ) : null}
    </button>
  );
}

export function SchoolSettingsRouteShell() {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Settings</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">Configure school-wide settings used across the School Management system.</p>
      </header>
      <div className="flex flex-wrap gap-1 rounded-full bg-slate-100/80 p-1">
        {TABS.map((tab) => (
          <span key={tab.id} className="h-9 min-w-[5.5rem] rounded-full bg-white/50" />
        ))}
      </div>
      <div className={`${glassPanel} space-y-3`}>
        <PulseBar className="h-4 w-40" />
        <PulseBar className="h-12 w-full" />
        <PulseBar className="h-12 w-full" />
      </div>
    </div>
  );
}

export function SchoolSettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [profile, setProfile] = useState<SchoolProfile>({
    name: "",
    shortName: "",
    schoolCode: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    principalName: "",
    logoUrl: "",
    isActive: true,
  });
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [classes, setClasses] = useState<ClassLevelRow[]>([]);
  const [bands, setBands] = useState<GradingBandRow[]>([]);
  const [fees, setFees] = useState<FeeCategoryRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSettings>({
    schoolStart: "",
    schoolEnd: "",
    lateThresholdMinutes: 0,
  });
  const [statuses, setStatuses] = useState<AttendanceStatusRow[]>([]);
  const [transport, setTransport] = useState<TransportSettings>({ enabled: false, pickupDropoffEnabled: false });
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [transportBusy, setTransportBusy] = useState(false);
  const [transportSaved, setTransportSaved] = useState(false);
  const profileLock = useRef(false);
  const attendanceLock = useRef(false);
  const transportLock = useRef(false);

  useEffect(() => {
    let active = true;
    void getSchoolSettingsWorkspaceAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setLoadError("Couldn't load school settings.");
        setPhase("error");
        return;
      }
      setLoadError(null);
      setSaveError(null);
      setPhase("ready");
      setCanManage(result.capabilities.canManage);
      setProfile(result.profile);
      setYears(result.years);
      setTerms(result.terms);
      setClasses(result.classes);
      setBands(result.gradingBands);
      setFees(result.fees);
      setAttendance(result.attendance);
      setStatuses(result.attendanceStatuses);
      setTransport(result.transport);
    });
    return () => {
      active = false;
    };
  }, [tick]);

  function openDrawer(kind: DrawerKind, id: string | null = null) {
    setEditId(id);
    setDrawer(kind);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Settings</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">Configure school-wide settings used across the School Management system.</p>
      </header>
      {phase === "error" && loadError ? <p className="text-[13px] text-[#c45b66]">{loadError}</p> : null}
      {saveError ? <p className="text-[13px] text-[#c45b66]">{saveError}</p> : null}

      <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "h-9 rounded-full px-4 text-[13px] font-semibold transition duration-200",
              tab === item.id ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]" : "text-slate-500 hover:text-navy",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">School Information</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="School name">
              <input className={inputClass} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Short name">
              <input className={inputClass} value={profile.shortName} onChange={(e) => setProfile((p) => ({ ...p, shortName: e.target.value }))} />
            </Field>
            <Field label="School code">
              <input className={inputClass} value={profile.schoolCode} onChange={(e) => setProfile((p) => ({ ...p, schoolCode: e.target.value }))} />
            </Field>
            <Field label="Location">
              <input className={inputClass} value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
            </Field>
            <Field label="Address">
              <input className={inputClass} value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input className={inputClass} value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field label="Website">
              <input className={inputClass} value={profile.website} onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))} />
            </Field>
            <Field label="Principal / Head">
              <input className={inputClass} value={profile.principalName} onChange={(e) => setProfile((p) => ({ ...p, principalName: e.target.value }))} />
            </Field>
            <Field label="Logo URL">
              <input className={inputClass} value={profile.logoUrl} onChange={(e) => setProfile((p) => ({ ...p, logoUrl: e.target.value }))} />
            </Field>
          </div>
          {canManage ? (
            <WorkflowAction
              className={primaryButton}
              busy={profileBusy}
              confirmed={profileSaved}
              idleLabel="Save Changes"
              onClick={() => {
                if (profileLock.current) return;
                profileLock.current = true;
                setProfileBusy(true);
                setProfileSaved(false);
                void saveSchoolProfileAction(profile).then((result) => {
                  profileLock.current = false;
                  setProfileBusy(false);
                  if (!result.ok) setSaveError(result.error);
                  else {
                    setSaveError(null);
                    setProfileSaved(true);
                    setTick((n) => n + 1);
                  }
                });
              }}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "academic" ? (
        <div className="space-y-4">
          <ConfigList
            title="Academic Year"
            empty={phase === "ready" ? "No academic year configured yet." : ""}
            action={canManage ? { label: "+ Add year", onClick: () => openDrawer("year") } : null}
            rows={years.map((row) => ({
              id: row.id,
              cells: [row.name, `${row.startDate} – ${row.endDate}`, row.isCurrent ? "Current" : "—", row.isActive ? "Active" : "Inactive"],
              onEdit: canManage ? () => openDrawer("year", row.id) : undefined,
            }))}
          />
          <ConfigList
            title="Terms / Semesters"
            empty={phase === "ready" ? "No terms configured yet." : ""}
            action={canManage ? { label: "+ Add term", onClick: () => openDrawer("term") } : null}
            rows={terms.map((row) => ({
              id: row.id,
              cells: [
                row.name,
                years.find((year) => year.id === row.academicYearId)?.name ?? "—",
                `${row.startDate} – ${row.endDate}`,
                row.isActive ? "Active" : "Inactive",
              ],
              onEdit: canManage ? () => openDrawer("term", row.id) : undefined,
            }))}
          />
          <ConfigList
            title="Classes / Grades"
            empty={phase === "ready" ? "No classes configured yet." : ""}
            action={canManage ? { label: "+ Add class", onClick: () => openDrawer("class") } : null}
            rows={classes.map((row) => ({
              id: row.id,
              cells: [row.name, row.code, String(row.sortOrder), row.isActive ? "Active" : "Inactive"],
              onEdit: canManage ? () => openDrawer("class", row.id) : undefined,
            }))}
          />
          <ConfigList
            title="Grading"
            empty={phase === "ready" ? "No grading rules configured yet." : ""}
            action={canManage ? { label: "+ Add grade", onClick: () => openDrawer("grade") } : null}
            rows={bands.map((row) => ({
              id: row.id,
              cells: [row.grade, `${row.minMark}–${row.maxMark}`, row.remark || "—", row.isActive ? "Active" : "Inactive"],
              onEdit: canManage ? () => openDrawer("grade", row.id) : undefined,
            }))}
          />
        </div>
      ) : null}

      {tab === "fees" ? (
        <ConfigList
          title="Fee Categories"
          empty={phase === "ready" ? "No fee categories configured yet." : ""}
          action={canManage ? { label: "+ Add Fee Category", onClick: () => openDrawer("fee") } : null}
          headings={["Name", "Code", "Amount", "Status", ""]}
          rows={fees.map((row) => ({
            id: row.id,
            cells: [row.name, row.code, row.amount ?? "—", row.isActive ? "Active" : "Inactive"],
            onEdit: canManage ? () => openDrawer("fee", row.id) : undefined,
          }))}
        />
      ) : null}

      {tab === "attendance" ? (
        <div className="space-y-4">
          <section className={`${glassPanel} space-y-4`}>
            <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Attendance Rules</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="School start time">
                <input type="time" className={inputClass} value={attendance.schoolStart} onChange={(e) => setAttendance((p) => ({ ...p, schoolStart: e.target.value }))} />
              </Field>
              <Field label="School end time">
                <input type="time" className={inputClass} value={attendance.schoolEnd} onChange={(e) => setAttendance((p) => ({ ...p, schoolEnd: e.target.value }))} />
              </Field>
              <Field label="Late threshold (minutes)">
                <input
                  inputMode="numeric"
                  className={inputClass}
                  value={String(attendance.lateThresholdMinutes)}
                  onChange={(e) => setAttendance((p) => ({ ...p, lateThresholdMinutes: Number(e.target.value) || 0 }))}
                />
              </Field>
            </div>
            {canManage ? (
              <WorkflowAction
                className={primaryButton}
                busy={attendanceBusy}
                confirmed={attendanceSaved}
                idleLabel="Save Changes"
                onClick={() => {
                  if (attendanceLock.current) return;
                  attendanceLock.current = true;
                  setAttendanceBusy(true);
                  setAttendanceSaved(false);
                  void saveAttendanceSettingsAction(attendance).then((result) => {
                    attendanceLock.current = false;
                    setAttendanceBusy(false);
                    if (!result.ok) setSaveError(result.error);
                    else {
                      setSaveError(null);
                      setAttendanceSaved(true);
                      setTick((n) => n + 1);
                    }
                  });
                }}
              />
            ) : null}
          </section>
          <ConfigList
            title="Attendance statuses"
            empty={phase === "ready" ? "No attendance statuses configured yet." : ""}
            action={canManage ? { label: "+ Add status", onClick: () => openDrawer("status") } : null}
            rows={statuses.map((row) => ({
              id: row.id,
              cells: [row.name, row.code, row.countsAsPresent ? "Present" : "Absent", row.isActive ? "Active" : "Inactive"],
              onEdit: canManage ? () => openDrawer("status", row.id) : undefined,
            }))}
          />
        </div>
      ) : null}

      {tab === "transport" ? (
        <section className={`${glassPanel} space-y-4`}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Transport Settings</h2>
          <label className="flex items-center gap-3 text-[14px] text-navy">
            <input type="checkbox" checked={transport.enabled} onChange={(e) => setTransport((p) => ({ ...p, enabled: e.target.checked }))} />
            Transport enabled
          </label>
          <label className="flex items-center gap-3 text-[14px] text-navy">
            <input
              type="checkbox"
              checked={transport.pickupDropoffEnabled}
              onChange={(e) => setTransport((p) => ({ ...p, pickupDropoffEnabled: e.target.checked }))}
            />
            Pickup / drop-off structure
          </label>
          {canManage ? (
            <WorkflowAction
              className={primaryButton}
              busy={transportBusy}
              confirmed={transportSaved}
              idleLabel="Save Changes"
              onClick={() => {
                if (transportLock.current) return;
                transportLock.current = true;
                setTransportBusy(true);
                setTransportSaved(false);
                void saveTransportSettingsAction(transport).then((result) => {
                  transportLock.current = false;
                  setTransportBusy(false);
                  if (!result.ok) setSaveError(result.error);
                  else {
                    setSaveError(null);
                    setTransportSaved(true);
                    setTick((n) => n + 1);
                  }
                });
              }}
            />
          ) : null}
        </section>
      ) : null}

      {drawer ? (
        <SettingsRecordDrawer
          kind={drawer}
          editId={editId}
          years={years}
          terms={terms}
          classes={classes}
          bands={bands}
          fees={fees}
          statuses={statuses}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            setTick((n) => n + 1);
          }}
          onError={setSaveError}
        />
      ) : null}
    </div>
  );
}

function ConfigList({
  title,
  empty,
  action,
  headings = ["Name", "Detail", "Meta", "Status", ""],
  rows,
}: {
  title: string;
  empty: string;
  action: { label: string; onClick: () => void } | null;
  headings?: string[];
  rows: Array<{ id: string; cells: string[]; onEdit?: () => void }>;
}) {
  return (
    <section className={`${glassPanel} space-y-3 !px-0 !py-0 overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
        {action ? (
          <button type="button" className={secondaryButton} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      <div className={tableScrollClass}>
        <table className="min-w-full text-left text-[13px]">
          <thead className={tableHead}>
            <tr>
              {headings.map((heading) => (
                <th key={heading || "actions"} className="px-5 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/[0.04]">
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className="px-5 py-2.5">
                    {index === row.cells.length - 1 ? <StatusPill value={cell} /> : cell}
                  </td>
                ))}
                <td className="px-5 py-2.5">
                  {row.onEdit ? (
                    <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={row.onEdit}>
                      Edit
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && empty ? <p className="px-5 pb-5 text-[13.5px] text-slate-500">{empty}</p> : <div className="pb-2" />}
    </section>
  );
}

function SettingsRecordDrawer({
  kind,
  editId,
  years,
  terms,
  classes,
  bands,
  fees,
  statuses,
  onClose,
  onSaved,
  onError,
}: {
  kind: Exclude<DrawerKind, null>;
  editId: string | null;
  years: AcademicYearRow[];
  terms: TermRow[];
  classes: ClassLevelRow[];
  bands: GradingBandRow[];
  fees: FeeCategoryRow[];
  statuses: AttendanceStatusRow[];
  onClose: () => void;
  onSaved: () => void;
  onError: (error: string) => void;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const year = years.find((row) => row.id === editId);
  const term = terms.find((row) => row.id === editId);
  const klass = classes.find((row) => row.id === editId);
  const band = bands.find((row) => row.id === editId);
  const fee = fees.find((row) => row.id === editId);
  const status = statuses.find((row) => row.id === editId);

  const [name, setName] = useState(year?.name ?? term?.name ?? klass?.name ?? fee?.name ?? status?.name ?? band?.grade ?? "");
  const [code, setCode] = useState(klass?.code ?? fee?.code ?? status?.code ?? "");
  const [startDate, setStartDate] = useState(year?.startDate ?? term?.startDate ?? "");
  const [endDate, setEndDate] = useState(year?.endDate ?? term?.endDate ?? "");
  const [sortOrder, setSortOrder] = useState(String(term?.sortOrder ?? klass?.sortOrder ?? band?.sortOrder ?? status?.sortOrder ?? 1));
  const [isCurrent, setIsCurrent] = useState(year?.isCurrent ?? false);
  const [isActive, setIsActive] = useState(year?.isActive ?? term?.isActive ?? klass?.isActive ?? band?.isActive ?? fee?.isActive ?? status?.isActive ?? true);
  const [academicYearId, setAcademicYearId] = useState(term?.academicYearId ?? years.find((row) => row.isCurrent)?.id ?? years[0]?.id ?? "");
  const [minMark, setMinMark] = useState(band ? String(band.minMark) : "");
  const [maxMark, setMaxMark] = useState(band ? String(band.maxMark) : "");
  const [remark, setRemark] = useState(band?.remark ?? "");
  const [amount, setAmount] = useState(fee?.amount ?? "");
  const [frequency, setFrequency] = useState<FeeCategoryRow["frequency"]>(fee?.frequency ?? "TERM");
  const [countsAsPresent, setCountsAsPresent] = useState(status?.countsAsPresent ?? false);

  const titles: Record<Exclude<DrawerKind, null>, string> = {
    year: editId ? "Edit academic year" : "Add academic year",
    term: editId ? "Edit term" : "Add term",
    class: editId ? "Edit class" : "Add class",
    grade: editId ? "Edit grade" : "Add grade",
    fee: editId ? "Edit fee category" : "Add fee category",
    status: editId ? "Edit attendance status" : "Add attendance status",
  };

  async function persist() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    let result: { ok: true } | { ok: false; error: string };
    if (kind === "year") {
      result = await saveAcademicYearAction({
        id: editId ?? undefined,
        name,
        startDate,
        endDate,
        isCurrent,
        isActive,
      });
    } else if (kind === "term") {
      result = await saveTermAction({
        id: editId ?? undefined,
        academicYearId,
        name,
        sortOrder: Number(sortOrder),
        startDate,
        endDate,
        isActive,
      });
    } else if (kind === "class") {
      result = await saveClassLevelAction({
        id: editId ?? undefined,
        name,
        code,
        sortOrder: Number(sortOrder),
        isActive,
      });
    } else if (kind === "grade") {
      result = await saveGradingBandAction({
        id: editId ?? undefined,
        grade: name,
        minMark: Number(minMark),
        maxMark: Number(maxMark),
        remark,
        sortOrder: Number(sortOrder),
        isActive,
      });
    } else if (kind === "fee") {
      result = await saveFeeCategoryAction({
        id: editId ?? undefined,
        name,
        code,
        amount: amount || null,
        frequency,
        isActive,
      });
    } else {
      result = await saveAttendanceStatusAction({
        id: editId ?? undefined,
        code,
        name,
        countsAsPresent,
        sortOrder: Number(sortOrder),
        isActive,
      });
    }
    if (!result.ok) {
      lock.current = false;
      setBusy(false);
      onError(result.error);
      return;
    }
    setBusy(false);
    setConfirmed(true);
    onSaved();
  }

  return (
    <ContainedDrawer
      title={titles[kind]}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <WorkflowAction className={primaryButton} busy={busy} confirmed={confirmed} idleLabel="Save" onClick={() => void persist()} />
        </>
      }
    >
      <div className="space-y-3 pb-4">
        {kind === "term" ? (
          <Field label="Academic year">
            <select className={inputClass} value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
              {years.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={kind === "grade" ? "Grade" : kind === "status" ? "Status name" : "Name"}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kind === "class" || kind === "fee" || kind === "status" ? (
          <Field label="Code">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        ) : null}
        {kind === "year" || kind === "term" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date">
              <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        ) : null}
        {kind === "grade" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum mark">
              <input className={inputClass} value={minMark} onChange={(e) => setMinMark(e.target.value)} />
            </Field>
            <Field label="Maximum mark">
              <input className={inputClass} value={maxMark} onChange={(e) => setMaxMark(e.target.value)} />
            </Field>
          </div>
        ) : null}
        {kind === "grade" ? (
          <Field label="Remark">
            <input className={inputClass} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
        ) : null}
        {kind === "fee" ? (
          <>
            <Field label="Amount">
              <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Frequency">
              <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value as FeeCategoryRow["frequency"])}>
                <option value="TERM">Term</option>
                <option value="YEAR">Year</option>
                <option value="MONTH">Month</option>
                <option value="ONCE">Once</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          </>
        ) : null}
        {kind === "term" || kind === "class" || kind === "grade" || kind === "status" ? (
          <Field label="Order">
            <input className={inputClass} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        ) : null}
        {kind === "year" ? (
          <label className="flex items-center gap-3 text-[14px] text-navy">
            <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
            Current academic year
          </label>
        ) : null}
        {kind === "status" ? (
          <label className="flex items-center gap-3 text-[14px] text-navy">
            <input type="checkbox" checked={countsAsPresent} onChange={(e) => setCountsAsPresent(e.target.checked)} />
            Counts as present
          </label>
        ) : null}
        <label className="flex items-center gap-3 text-[14px] text-navy">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>
    </ContainedDrawer>
  );
}
