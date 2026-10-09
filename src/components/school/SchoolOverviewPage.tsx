import type { LucideIcon } from "lucide-react";
import {
  Award,
  Building2,
  Bus,
  CalendarDays,
  Clock3,
  GraduationCap,
  Layers,
  Receipt,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import type { ConfigStatus, OverviewMetric, SchoolOverviewView } from "@/lib/school/overview";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { glassCard, glassPanel } from "@/components/supermarket/purchasing-ui";

function metricDisplay(metric: OverviewMetric<number>) {
  if (metric.status === "unavailable") return { value: "—", hint: "Not available" };
  if (metric.status === "error") return { value: "—", hint: "Not available" };
  return { value: String(metric.value), hint: null as string | null };
}

function yearLabel(overview: SchoolOverviewView) {
  if (overview.academicYear.status === "ok") return overview.academicYear.name;
  if (overview.academicYear.status === "conflict") return "—";
  if (overview.academicYear.status === "error") return "Not available";
  return "Not configured";
}

function termLabel(overview: SchoolOverviewView) {
  if (overview.currentTerm.status === "ok") return overview.currentTerm.name;
  if (overview.currentTerm.status === "error") return "Not available";
  return "No active term";
}

function IconWell({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-navy/[0.045] text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function StatusBadge({ status }: { status: ConfigStatus }) {
  const label =
    status === "configured"
      ? "Configured"
      : status === "enabled"
        ? "Enabled"
        : status === "disabled"
          ? "Disabled"
          : status === "error"
            ? "Not available"
            : "Not configured";
  const tone =
    status === "configured" || status === "enabled"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : status === "disabled"
        ? "bg-[#fff8eb] text-[#b5812a]"
        : "bg-[#f3f6fa] text-slate-500";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string | null;
  icon: LucideIcon;
}) {
  return (
    <div
      className={cn(
        glassCard,
        "px-5 py-5 transition duration-200 hover:-translate-y-px hover:shadow-[0_14px_32px_rgba(15,35,64,0.08)]",
      )}
    >
      <IconWell icon={icon} />
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 min-h-7 text-[22px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
      <p className="mt-1 min-h-4 text-[12px] text-slate-400">{hint ?? "\u00a0"}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="min-h-5 text-right text-[13.5px] font-medium text-navy">{value}</p>
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <IconWell icon={icon} />
      <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
    </div>
  );
}

export function SchoolOverviewPage({
  overview,
  error,
}: {
  overview: SchoolOverviewView | null;
  error: string | null;
}) {
  const students = overview
    ? overview.students.status === "ok"
      ? { value: String(overview.students.value), hint: "Active enrollments" }
      : metricDisplay(overview.students)
    : { value: "—", hint: "Not available" };
  const collected = overview
    ? overview.feesCollected.status === "ok"
      ? { value: formatTzs(overview.feesCollected.value), hint: "Posted payments" }
      : metricDisplay(overview.feesCollected)
    : { value: "—", hint: "Not available" };
  const outstanding = overview
    ? overview.outstandingFees.status === "ok"
      ? { value: formatTzs(overview.outstandingFees.value), hint: "Due minus posted payments" }
      : metricDisplay(overview.outstandingFees)
    : { value: "—", hint: "Not available" };
  const expenses = overview
    ? overview.operatingExpenses.status === "ok"
      ? { value: formatTzs(overview.operatingExpenses.value), hint: "Posted this year" }
      : metricDisplay(overview.operatingExpenses)
    : { value: "—", hint: "Not available" };
  const teachers = overview
    ? overview.teachers.status === "ok"
      ? { value: String(overview.teachers.value), hint: "Active academic staff" }
      : metricDisplay(overview.teachers)
    : { value: "—", hint: "Not available" };
  const classes = overview
    ? overview.classLevels.status === "ok"
      ? { value: String(overview.classLevels.value), hint: "Active class levels" }
      : metricDisplay(overview.classLevels)
    : { value: "—", hint: "Not available" };

  const academicLine =
    overview && overview.academicYear.status === "ok" ? `${yearLabel(overview)} · ${termLabel(overview)}` : null;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Overview</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">A clear view of today&apos;s school operations.</p>
        {academicLine ? <p className="mt-1 text-[13px] text-slate-400">{academicLine}</p> : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">Couldn&apos;t load school overview.</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Total Students" value={students.value} hint={students.hint} icon={Users} />
        <KpiCard label="Fees Collected" value={collected.value} hint={collected.hint} icon={Wallet} />
        <KpiCard label="Outstanding Fees" value={outstanding.value} hint={outstanding.hint} icon={Clock3} />
        <KpiCard label="Operating Expenses" value={expenses.value} hint={expenses.hint} icon={Receipt} />
        <KpiCard label="Teachers" value={teachers.value} hint={teachers.hint} icon={GraduationCap} />
        <KpiCard label="Class Levels" value={classes.value} hint={classes.hint} icon={Layers} />
      </section>

      {overview ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className={glassPanel}>
              <SectionHeading icon={Building2} title="School Snapshot" />
              <div className="mt-3 divide-y divide-black/[0.04]">
                <Detail label="School name" value={overview.schoolName} />
                <Detail label="Location" value={overview.location} />
                <Detail label="School code" value={overview.schoolCode} />
              </div>
            </section>
            <section className={glassPanel}>
              <SectionHeading icon={CalendarDays} title="Academic Overview" />
              <div className="mt-3 divide-y divide-black/[0.04]">
                <Detail label="Academic year" value={yearLabel(overview)} />
                <Detail label="Current term" value={termLabel(overview)} />
                <Detail
                  label="Class levels"
                  value={overview.classLevels.status === "ok" ? String(overview.classLevels.value) : "Not available"}
                />
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <p className="text-[13px] text-slate-500">Grading</p>
                  <StatusBadge status={overview.grading} />
                </div>
              </div>
            </section>
          </div>

          <section className={glassPanel}>
            <SectionHeading icon={Settings2} title="Configuration Status" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Fee Structure", overview.feeStructure, Wallet],
                  ["Transport", overview.transport, Bus],
                  ["Grading", overview.grading, Award],
                ] as const
              ).map(([label, status, icon]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-white/70 bg-white/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <IconWell icon={icon} />
                    <p className="truncate text-[13px] font-medium text-navy">{label}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>
              ))}
            </div>
          </section>

          {overview.attention.length > 0 ? (
            <section className={glassPanel}>
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Needs attention</h2>
              <ul className="mt-2 space-y-1.5">
                {overview.attention.map((item) => (
                  <li key={item} className="text-[13.5px] text-slate-500">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
