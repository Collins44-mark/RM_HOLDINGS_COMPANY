"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import {
  getSchoolSettingsWorkspaceAction,
  listFeeStructureClassesAction,
  listSchoolSettingsAction,
  listSchoolTermsForYearAction,
  saveAcademicYearAction,
  saveFeeCategoryAction,
  saveFeeStructureAction,
  saveGradingBandAction,
  saveSchoolProfileAction,
  saveTermAction,
  saveTransportSettingsAction,
  setFeeStructureActiveAction,
  type AcademicYearRow,
  type FeeCategoryRow,
  type FeeStructureRow,
  type GradingBandRow,
  type SchoolOption,
  type SchoolProfile,
  type TermRow,
  type TransportSettings,
  type SchoolSettingsWorkspaceResult,
} from "@/actions/school/settings";
import { CompactActionsMenu } from "@/components/supermarket/CompactActionsMenu";
import { formatTzs } from "@/lib/format/currency";
import { ContainedDrawer, DrawerCancel } from "@/components/ui/ContainedDrawer";
import { SchoolConfirmDialog, SchoolIconWell, SchoolWorkflowButton } from "@/components/school/school-ui";
import { SchoolPagination } from "@/components/school/SchoolPagination";
import { schoolPageMeta, type SchoolPageMeta } from "@/lib/school/pagination";
import { cn } from "@/lib/cn";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
  tableHead,
  tableScrollClass,
} from "@/components/supermarket/purchasing-ui";

type Tab = "general" | "academic" | "fees" | "transport";
type LoadPhase = "loading" | "ready" | "error";
type DrawerKind = "year" | "term" | "grade" | "fee" | "structure" | "structure-view" | null;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "general", label: "General" },
  { id: "academic", label: "Academic" },
  { id: "fees", label: "Fees" },
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

function displayValue(value: string) {
  return value.trim() ? value : "Not configured";
}

function asSaveError(message: string) {
  return message.startsWith("Couldn't save") ? "Couldn't save school settings. Please try again." : message;
}

const EMPTY_PROFILE: SchoolProfile = {
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
};

function asTab(value: string | undefined, canViewSettings: boolean, canViewFees: boolean): Tab {
  if (value === "fees" && canViewFees) return "fees";
  if (value === "academic" || value === "transport" || value === "general") {
    return canViewSettings ? value : canViewFees ? "fees" : "general";
  }
  if (canViewSettings) return "general";
  if (canViewFees) return "fees";
  return "general";
}

export function SchoolSettingsPage({
  initial,
  initialTab,
}: {
  initial: SchoolSettingsWorkspaceResult;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<Tab>(() =>
    asTab(
      initialTab,
      initial.ok ? initial.capabilities.canViewSettings : false,
      initial.ok ? initial.capabilities.canViewFees : false,
    ),
  );
  const [phase, setPhase] = useState<LoadPhase>(initial.ok ? "ready" : "error");
  const [loadError, setLoadError] = useState<string | null>(initial.ok ? null : initial.error);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [canManage, setCanManage] = useState(initial.ok ? initial.capabilities.canManage : false);
  const [canViewSettings, setCanViewSettings] = useState(initial.ok ? initial.capabilities.canViewSettings : false);
  const [canViewFees, setCanViewFees] = useState(initial.ok ? initial.capabilities.canViewFees : false);
  const [canManageFees, setCanManageFees] = useState(initial.ok ? initial.capabilities.canManageFees : false);
  const [profile, setProfile] = useState<SchoolProfile>(initial.ok ? initial.profile : EMPTY_PROFILE);
  const [years, setYears] = useState<AcademicYearRow[]>(initial.ok ? initial.years : []);
  const [terms, setTerms] = useState<TermRow[]>(initial.ok ? initial.terms : []);
  const [bands, setBands] = useState<GradingBandRow[]>(initial.ok ? initial.gradingBands : []);
  const [fees, setFees] = useState<FeeCategoryRow[]>(initial.ok ? initial.fees : []);
  const [structures, setStructures] = useState<FeeStructureRow[]>(initial.ok ? initial.feeStructures : []);
  const [levelOptions, setLevelOptions] = useState<SchoolOption[]>(initial.ok ? initial.levelOptions : []);
  const [yearOptions, setYearOptions] = useState<SchoolOption[]>(initial.ok ? initial.yearOptions : []);
  const [pages, setPages] = useState(
    initial.ok
      ? initial.pages
      : {
          years: schoolPageMeta(1, 0),
          terms: schoolPageMeta(1, 0),
          bands: schoolPageMeta(1, 0),
          fees: schoolPageMeta(1, 0),
          structures: schoolPageMeta(1, 0),
        },
  );
  const [feeFilter, setFeeFilter] = useState({ yearId: "", levelId: "", classId: "", status: "all" });
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [transport, setTransport] = useState<TransportSettings>(
    initial.ok ? initial.transport : { enabled: false, pickupDropoffEnabled: false },
  );
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [transportBusy, setTransportBusy] = useState(false);
  const [transportSaved, setTransportSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<SchoolProfile>(initial.ok ? initial.profile : EMPTY_PROFILE);
  const profileLock = useRef(false);
  const transportLock = useRef(false);

  useEffect(() => {
    if (tick === 0) return;
    let active = true;
    void getSchoolSettingsWorkspaceAction()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadError(result.error);
          setPhase("error");
          return;
        }
        setLoadError(null);
        setSaveError(null);
        setPhase("ready");
        setCanManage(result.capabilities.canManage);
        setCanViewSettings(result.capabilities.canViewSettings);
        setCanViewFees(result.capabilities.canViewFees);
        setCanManageFees(result.capabilities.canManageFees);
        setProfile(result.profile);
        setProfileDraft(result.profile);
        setEditingProfile(false);
        setYears(result.years);
        setTerms(result.terms);
        setBands(result.gradingBands);
        setFees(result.fees);
        setStructures(result.feeStructures);
        setLevelOptions(result.levelOptions);
        setYearOptions(result.yearOptions);
        setPages(result.pages);
        setTransport(result.transport);
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Couldn't load school settings.");
        setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [tick]);

  function loadList(kind: "years" | "terms" | "bands" | "fees" | "structures", page: number) {
    void listSchoolSettingsAction({
      kind,
      page,
      ...(kind === "structures"
        ? {
            academicYearId: feeFilter.yearId || undefined,
            levelId: feeFilter.levelId || undefined,
            classId: feeFilter.classId || undefined,
            status: feeFilter.status === "all" ? "all" : feeFilter.status === "inactive" ? "archived" : "active",
          }
        : {}),
    }).then((result) => {
      if (!result.ok) {
        setSaveError(asSaveError(result.error));
        return;
      }
      if (kind === "years" && "years" in result) setYears(result.years ?? []);
      if (kind === "terms" && "terms" in result) setTerms(result.terms ?? []);
      if (kind === "bands" && "gradingBands" in result) setBands(result.gradingBands ?? []);
      if (kind === "fees" && "fees" in result) setFees(result.fees ?? []);
      if (kind === "structures" && "structures" in result) setStructures(result.structures ?? []);
      setPages((current) => ({ ...current, [kind]: result.page }));
    });
  }

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
        {TABS.filter((item) => (item.id === "fees" ? canViewFees : canViewSettings)).map((item) => (
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">School Information</h2>
            {canManage && !editingProfile ? (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setProfileDraft(profile);
                  setEditingProfile(true);
                  setProfileSaved(false);
                }}
              >
                Edit
              </button>
            ) : null}
          </div>
          {editingProfile ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="School name">
                  <input className={inputClass} value={profileDraft.name} onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="Short name">
                  <input className={inputClass} value={profileDraft.shortName} onChange={(e) => setProfileDraft((p) => ({ ...p, shortName: e.target.value }))} />
                </Field>
                <Field label="School code">
                  <input className={inputClass} value={profileDraft.schoolCode} onChange={(e) => setProfileDraft((p) => ({ ...p, schoolCode: e.target.value }))} />
                </Field>
                <Field label="Location">
                  <input className={inputClass} value={profileDraft.city} onChange={(e) => setProfileDraft((p) => ({ ...p, city: e.target.value }))} />
                </Field>
                <Field label="Address">
                  <input className={inputClass} value={profileDraft.address} onChange={(e) => setProfileDraft((p) => ({ ...p, address: e.target.value }))} />
                </Field>
                <Field label="Phone">
                  <input className={inputClass} value={profileDraft.phone} onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <input className={inputClass} value={profileDraft.email} onChange={(e) => setProfileDraft((p) => ({ ...p, email: e.target.value }))} />
                </Field>
                <Field label="Website">
                  <input className={inputClass} value={profileDraft.website} onChange={(e) => setProfileDraft((p) => ({ ...p, website: e.target.value }))} />
                </Field>
                <Field label="Principal / Head">
                  <input className={inputClass} value={profileDraft.principalName} onChange={(e) => setProfileDraft((p) => ({ ...p, principalName: e.target.value }))} />
                </Field>
                <Field label="Logo URL">
                  <input className={inputClass} value={profileDraft.logoUrl} onChange={(e) => setProfileDraft((p) => ({ ...p, logoUrl: e.target.value }))} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={profileBusy}
                  onClick={() => {
                    setProfileDraft(profile);
                    setEditingProfile(false);
                    setProfileSaved(false);
                    setSaveError(null);
                  }}
                >
                  Cancel
                </button>
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
                    void saveSchoolProfileAction(profileDraft).then((result) => {
                      profileLock.current = false;
                      setProfileBusy(false);
                      if (!result.ok) setSaveError(asSaveError(result.error));
                      else {
                        setSaveError(null);
                        setProfile(profileDraft);
                        setProfileSaved(true);
                        setEditingProfile(false);
                      }
                    });
                  }}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              {(
                [
                  ["School name", profile.name],
                  ["Short name", profile.shortName],
                  ["School code", profile.schoolCode],
                  ["Location", profile.city],
                  ["Address", profile.address],
                  ["Phone", profile.phone],
                  ["Email", profile.email],
                  ["Website", profile.website],
                  ["Principal / Head", profile.principalName],
                  ["Logo URL", profile.logoUrl],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-b border-black/[0.04] py-2.5">
                  <p className="text-[13px] text-slate-500">{label}</p>
                  <p className="text-right text-[13.5px] font-medium text-navy">
                    {phase === "ready" ? displayValue(value) : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "academic" ? (
        <div className="space-y-4">
          <ConfigList
            title="Academic Year"
            empty={phase === "ready" ? "No academic years configured yet." : ""}
            action={canManage ? { label: "+ Add year", onClick: () => openDrawer("year") } : null}
            page={pages.years}
            onPage={(next) => loadList("years", next)}
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
            page={pages.terms}
            onPage={(next) => loadList("terms", next)}
            rows={terms.map((row) => ({
              id: row.id,
              cells: [
                row.name,
                yearOptions.find((year) => year.id === row.academicYearId)?.name ?? years.find((year) => year.id === row.academicYearId)?.name ?? "—",
                `${row.startDate} – ${row.endDate}`,
                row.isActive ? "Active" : "Inactive",
              ],
              onEdit: canManage ? () => openDrawer("term", row.id) : undefined,
            }))}
          />
          <section className={`${glassPanel} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Levels and classes</h2>
              <p className="mt-1 text-[13px] text-slate-500">Academic structure is managed in Classes.</p>
            </div>
            <Link href="/school/classes" className={secondaryButton}>
              Open Classes
            </Link>
          </section>
          <ConfigList
            title="Grading"
            empty={phase === "ready" ? "No grading rules configured yet." : ""}
            action={canManage ? { label: "+ Add grade", onClick: () => openDrawer("grade") } : null}
            page={pages.bands}
            onPage={(next) => loadList("bands", next)}
            rows={bands.map((row) => ({
              id: row.id,
              cells: [row.grade, `${row.minMark}–${row.maxMark}`, row.remark || "—", row.isActive ? "Active" : "Inactive"],
              onEdit: canManage ? () => openDrawer("grade", row.id) : undefined,
            }))}
          />
        </div>
      ) : null}

      {tab === "fees" && canViewFees ? (
        <FeeStructuresPanel
          rows={structures}
          page={pages.structures}
          years={yearOptions}
          levels={levelOptions}
          filter={feeFilter}
          canManage={canManageFees}
          emptyReady={phase === "ready"}
          onFilter={(next) => {
            setFeeFilter(next);
            void listSchoolSettingsAction({
              kind: "structures",
              page: 1,
              academicYearId: next.yearId || undefined,
              levelId: next.levelId || undefined,
              classId: next.classId || undefined,
              status: next.status === "all" ? "all" : next.status === "inactive" ? "archived" : "active",
            }).then((result) => {
              if (!result.ok) {
                setSaveError(asSaveError(result.error));
                return;
              }
              setStructures(result.structures ?? []);
              setPages((current) => ({ ...current, structures: result.page }));
            });
          }}
          onPage={(next) => loadList("structures", next)}
          onAdd={() => openDrawer("structure")}
          onView={(id) => openDrawer("structure-view", id)}
          onEdit={(id) => openDrawer("structure", id)}
          onToggle={(id, isActive) => {
            if (!isActive) setDeactivateId(id);
            else {
              void setFeeStructureActiveAction(id, true).then((result) => {
                if (!result.ok) {
                  setSaveError(asSaveError(result.error));
                  return;
                }
                if (result.structure) {
                  setStructures((current) => current.map((row) => (row.id === id ? result.structure! : row)));
                }
              });
            }
          }}
        />
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
                  if (!result.ok) setSaveError(asSaveError(result.error));
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

      {drawer && drawer !== "structure" && drawer !== "structure-view" ? (
        <SettingsRecordDrawer
          kind={drawer}
          editId={editId}
          years={yearOptions.length ? yearOptions.map((row) => ({
            id: row.id,
            name: row.name,
            startDate: years.find((year) => year.id === row.id)?.startDate ?? "",
            endDate: years.find((year) => year.id === row.id)?.endDate ?? "",
            isCurrent: years.find((year) => year.id === row.id)?.isCurrent ?? false,
            isActive: true,
          })) : years}
          terms={terms}
          bands={bands}
          fees={fees}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            setTick((n) => n + 1);
          }}
          onError={(message) => setSaveError(asSaveError(message))}
        />
      ) : null}

      {drawer === "structure" ? (
        <FeeStructureForm
          key={editId ?? "new"}
          initial={structures.find((row) => row.id === editId) ?? null}
          levels={levelOptions}
          years={years.length ? years : yearOptions.map((row) => ({ id: row.id, name: row.name, startDate: "", endDate: "", isCurrent: false, isActive: true }))}
          onClose={() => setDrawer(null)}
          onError={(message) => setSaveError(asSaveError(message))}
          onSaved={(row) => {
            setStructures((current) => {
              const exists = current.some((item) => item.id === row.id);
              return exists ? current.map((item) => (item.id === row.id ? row : item)) : [row, ...current];
            });
            setDrawer(null);
          }}
        />
      ) : null}

      {drawer === "structure-view" ? (
        <FeeStructureView row={structures.find((item) => item.id === editId) ?? null} onClose={() => setDrawer(null)} />
      ) : null}

      <SchoolConfirmDialog
        open={Boolean(deactivateId)}
        title="Deactivate this fee structure?"
        message="This fee structure will no longer apply to new enrollments. Historical records remain."
        confirmLabel="Deactivate"
        onCancel={() => setDeactivateId(null)}
        onConfirm={() => {
          if (!deactivateId) return;
          const id = deactivateId;
          void setFeeStructureActiveAction(id, false).then((result) => {
            if (!result.ok) {
              setSaveError(asSaveError(result.error));
              return;
            }
            setDeactivateId(null);
            setStructures((current) => current.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
          });
        }}
      />
    </div>
  );
}

function parseAmountDisplay(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return formatTzs(n);
}

function FeeStructuresPanel({
  rows,
  page,
  years,
  levels,
  filter,
  canManage,
  emptyReady,
  onFilter,
  onPage,
  onAdd,
  onView,
  onEdit,
  onToggle,
}: {
  rows: FeeStructureRow[];
  page: SchoolPageMeta;
  years: SchoolOption[];
  levels: SchoolOption[];
  filter: { yearId: string; levelId: string; classId: string; status: string };
  canManage: boolean;
  emptyReady: boolean;
  onFilter: (next: { yearId: string; levelId: string; classId: string; status: string }) => void;
  onPage: (page: number) => void;
  onAdd: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!filter.levelId) return;
    let active = true;
    void listFeeStructureClassesAction(filter.levelId).then((result) => {
      if (!active || !result.ok) return;
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [filter.levelId]);

  return (
    <section className={`${glassPanel} space-y-3 !px-0 !py-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Fee Structures</h2>
          <p className="mt-1 text-[13px] text-slate-500">Annual school fees by academic year, level and class.</p>
        </div>
        {canManage ? (
          <button type="button" className={primaryButton} onClick={onAdd}>
            + Add Fee Structure
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5">
        <select
          className={cn(inputClass, "!h-9 !rounded-full min-w-[140px]")}
          value={filter.yearId}
          onChange={(event) => onFilter({ ...filter, yearId: event.target.value })}
        >
          <option value="">Academic Year</option>
          {years.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !rounded-full min-w-[140px]")}
          value={filter.levelId}
          onChange={(event) => {
            setClasses([]);
            onFilter({ ...filter, levelId: event.target.value, classId: "" });
          }}
        >
          <option value="">Level</option>
          {levels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !rounded-full min-w-[140px]")}
          value={filter.classId}
          onChange={(event) => onFilter({ ...filter, classId: event.target.value })}
          disabled={!filter.levelId}
        >
          <option value="">Class</option>
          {(filter.levelId ? classes : []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "!h-9 !rounded-full min-w-[120px]")}
          value={filter.status}
          onChange={(event) => onFilter({ ...filter, status: event.target.value })}
        >
          <option value="all">Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {rows.length === 0 && emptyReady ? (
        <div className="flex flex-col items-start gap-3 px-5 py-10">
          <SchoolIconWell icon={Wallet} />
          <h3 className="text-[18px] font-semibold tracking-[-0.04em] text-navy">No fee structures configured yet.</h3>
          <p className="text-[13.5px] text-slate-500">Configure annual school fees by level and class.</p>
          {canManage ? (
            <button type="button" className={primaryButton} onClick={onAdd}>
              + Add Fee Structure
            </button>
          ) : null}
        </div>
      ) : (
        <div className={tableScrollClass}>
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr>
                {["Fee", "Level", "Class", "Annual Fee", "Term Fees", "Academic Year", "Status", ""].map((heading) => (
                  <th key={heading || "actions"} className="px-5 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-black/[0.04]">
                  <td className="px-5 py-2.5">School fees</td>
                  <td className="px-5 py-2.5">{row.levelName}</td>
                  <td className="px-5 py-2.5">{row.className}</td>
                  <td className="px-5 py-2.5">{parseAmountDisplay(row.annualAmount)}</td>
                  <td className="px-5 py-2.5">{row.termCount ? `${row.termCount} term${row.termCount === 1 ? "" : "s"}` : "—"}</td>
                  <td className="px-5 py-2.5">{row.academicYearName}</td>
                  <td className="px-5 py-2.5">
                    <StatusPill value={row.isActive ? "Active" : "Inactive"} />
                  </td>
                  <td className="px-5 py-2.5">
                    <CompactActionsMenu
                      ariaLabel={`${row.className} fee actions`}
                      items={[
                        { label: "View", onSelect: () => onView(row.id) },
                        ...(canManage ? [{ label: "Edit", onSelect: () => onEdit(row.id) }] : []),
                        ...(canManage
                          ? [
                              {
                                label: row.isActive ? "Deactivate" : "Activate",
                                onSelect: () => onToggle(row.id, !row.isActive),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5">
        <SchoolPagination page={page.page} total={page.total} onPage={onPage} />
      </div>
    </section>
  );
}

function FeeStructureView({ row, onClose }: { row: FeeStructureRow | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <ContainedDrawer title="Fee structure" onClose={onClose} footer={<DrawerCancel />}>
      <div className="space-y-3 text-[13.5px] text-navy">
        <p>Academic Year: {row.academicYearName}</p>
        <p>Level: {row.levelName}</p>
        <p>Class: {row.className}</p>
        <p>Annual Fee: {parseAmountDisplay(row.annualAmount)}</p>
        <p>Status: {row.isActive ? "Active" : "Inactive"}</p>
        <div>
          <p className="mb-1.5 font-semibold">Term breakdown</p>
          {row.terms.length ? (
            <ul className="space-y-1 text-slate-600">
              {row.terms.map((term) => (
                <li key={term.termId}>
                  {term.termName} — {parseAmountDisplay(term.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No term fees configured.</p>
          )}
        </div>
      </div>
    </ContainedDrawer>
  );
}

function ConfigList({
  title,
  empty,
  action,
  headings = ["Name", "Detail", "Meta", "Status", ""],
  rows,
  page,
  onPage,
}: {
  title: string;
  empty: string;
  action: { label: string; onClick: () => void } | null;
  headings?: string[];
  rows: Array<{ id: string; cells: string[]; onEdit?: () => void; onArchive?: () => void }>;
  page?: SchoolPageMeta;
  onPage?: (page: number) => void;
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
                  <div className="flex items-center gap-3">
                    {row.onEdit ? (
                      <button type="button" className="text-[12.5px] font-semibold text-navy" onClick={row.onEdit}>
                        Edit
                      </button>
                    ) : null}
                    {row.onArchive ? (
                      <button type="button" className="text-[12.5px] font-semibold text-slate-500" onClick={row.onArchive}>
                        Archive
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && empty ? <p className="px-5 pb-5 text-[13.5px] text-slate-500">{empty}</p> : null}
      {page && onPage ? (
        <div className="px-5">
          <SchoolPagination page={page.page} total={page.total} onPage={onPage} />
        </div>
      ) : (
        <div className="pb-2" />
      )}
    </section>
  );
}

function SettingsRecordDrawer({
  kind,
  editId,
  years,
  terms,
  bands,
  fees,
  onClose,
  onSaved,
  onError,
}: {
  kind: Exclude<DrawerKind, null | "structure" | "structure-view">;
  editId: string | null;
  years: AcademicYearRow[];
  terms: TermRow[];
  bands: GradingBandRow[];
  fees: FeeCategoryRow[];
  onClose: () => void;
  onSaved: () => void;
  onError: (error: string) => void;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const year = years.find((row) => row.id === editId);
  const term = terms.find((row) => row.id === editId);
  const band = bands.find((row) => row.id === editId);
  const fee = fees.find((row) => row.id === editId);

  const [name, setName] = useState(year?.name ?? term?.name ?? fee?.name ?? band?.grade ?? "");
  const [code, setCode] = useState(fee?.code ?? "");
  const [startDate, setStartDate] = useState(year?.startDate ?? term?.startDate ?? "");
  const [endDate, setEndDate] = useState(year?.endDate ?? term?.endDate ?? "");
  const [sortOrder, setSortOrder] = useState(String(term?.sortOrder ?? band?.sortOrder ?? 1));
  const [isCurrent, setIsCurrent] = useState(year?.isCurrent ?? false);
  const [isActive, setIsActive] = useState(year?.isActive ?? term?.isActive ?? band?.isActive ?? fee?.isActive ?? true);
  const [academicYearId, setAcademicYearId] = useState(term?.academicYearId ?? years.find((row) => row.isCurrent)?.id ?? years[0]?.id ?? "");
  const [minMark, setMinMark] = useState(band ? String(band.minMark) : "");
  const [maxMark, setMaxMark] = useState(band ? String(band.maxMark) : "");
  const [remark, setRemark] = useState(band?.remark ?? "");
  const [amount, setAmount] = useState(fee?.amount ?? "");
  const [frequency, setFrequency] = useState<FeeCategoryRow["frequency"]>(fee?.frequency ?? "TERM");

  const titles: Record<Exclude<DrawerKind, null | "structure" | "structure-view">, string> = {
    year: editId ? "Edit academic year" : "Add academic year",
    term: editId ? "Edit term" : "Add term",
    grade: editId ? "Edit grade" : "Add grade",
    fee: editId ? "Edit fee category" : "Add fee category",
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
    } else {
      result = await saveFeeCategoryAction({
        id: editId ?? undefined,
        name,
        code,
        amount: amount || null,
        frequency,
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
        <Field label={kind === "grade" ? "Grade" : "Name"}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kind === "fee" ? (
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
        {kind === "term" || kind === "grade" ? (
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
        <label className="flex items-center gap-3 text-[14px] text-navy">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>
    </ContainedDrawer>
  );
}

function FeeStructureForm({
  initial,
  levels,
  years,
  onClose,
  onSaved,
  onError,
}: {
  initial: FeeStructureRow | null;
  levels: SchoolOption[];
  years: AcademicYearRow[];
  onClose: () => void;
  onSaved: (row: FeeStructureRow) => void;
  onError: (error: string) => void;
}) {
  const lock = useRef(false);
  const currentYear = years.find((row) => row.isCurrent) ?? years[0];
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [academicYearId, setAcademicYearId] = useState(initial?.academicYearId ?? currentYear?.id ?? "");
  const [levelId, setLevelId] = useState(initial?.levelId ?? "");
  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
    initial ? [{ id: initial.classId, name: initial.className }] : [],
  );
  const [annualAmount, setAnnualAmount] = useState(initial?.annualAmount ?? "");
  const [yearTerms, setYearTerms] = useState<TermRow[]>([]);
  const [termAmounts, setTermAmounts] = useState<Record<string, string>>(
    Object.fromEntries((initial?.terms ?? []).map((row) => [row.termId, row.amount])),
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  useEffect(() => {
    if (!academicYearId) return;
    let active = true;
    void listSchoolTermsForYearAction(academicYearId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setYearTerms([]);
        return;
      }
      setYearTerms(result.terms);
    });
    return () => {
      active = false;
    };
  }, [academicYearId]);

  useEffect(() => {
    if (!levelId) return;
    let active = true;
    void listFeeStructureClassesAction(levelId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setClasses([]);
        return;
      }
      setClasses(result.classes);
    });
    return () => {
      active = false;
    };
  }, [levelId]);

  return (
    <ContainedDrawer
      title={initial ? "Edit fee structure" : "Add fee structure"}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DrawerCancel disabled={busy} />
          <SchoolWorkflowButton
            className={primaryButton}
            busy={busy}
            confirmed={confirmed}
            idleLabel="Save"
            onClick={() => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              void saveFeeStructureAction({
                id: initial?.id,
                academicYearId,
                levelId,
                classId,
                annualAmount,
                termAmounts: yearTerms.map((term) => ({ termId: term.id, amount: termAmounts[term.id] ?? "" })),
                isActive,
              }).then((result) => {
                lock.current = false;
                setBusy(false);
                if (!result.ok) {
                  onError(result.error);
                  return;
                }
                setConfirmed(true);
                onSaved(result.structure);
              });
            }}
          />
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Academic Year">
          <select
            className={inputClass}
            value={academicYearId}
            onChange={(event) => {
              setAcademicYearId(event.target.value);
              setTermAmounts({});
              setYearTerms([]);
            }}
          >
            <option value="">Select academic year</option>
            {years.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.isCurrent ? " (Current)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select
            className={inputClass}
            value={levelId}
            onChange={(event) => {
              setLevelId(event.target.value);
              setClassId("");
              setClasses([]);
            }}
          >
            <option value="">Select level</option>
            {levels.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Class">
          <select className={inputClass} value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!levelId}>
            <option value="">Select class</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Annual Fee (TZS)">
          <input className={inputClass} inputMode="decimal" value={annualAmount} onChange={(event) => setAnnualAmount(event.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-slate-500">Term fees (optional)</p>
          {!academicYearId ? (
            <p className="text-[13px] text-slate-500">Select an academic year to load its terms.</p>
          ) : yearTerms.length === 0 ? (
            <p className="text-[13px] text-slate-500">No terms configured for this academic year yet.</p>
          ) : (
            <div className="space-y-3">
              {yearTerms.map((term) => (
                <Field key={term.id} label={term.name}>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={termAmounts[term.id] ?? ""}
                    onChange={(event) => setTermAmounts((current) => ({ ...current, [term.id]: event.target.value }))}
                  />
                </Field>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 text-[14px] text-navy">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active
        </label>
      </div>
    </ContainedDrawer>
  );
}
