"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSchoolOverviewAction } from "@/actions/school/overview";
import type { ConfigStatus, OverviewMetric, SchoolOverviewView } from "@/lib/school/overview";
import { cn } from "@/lib/cn";
import { glassCard, glassPanel, PulseBar, secondaryButton } from "@/components/supermarket/purchasing-ui";

type LoadPhase = "loading" | "ready" | "error";

function metricDisplay(metric: OverviewMetric<number> | undefined, loading: boolean) {
  if (loading || !metric) return { value: null as string | null, hint: null as string | null };
  if (metric.status === "unavailable") return { value: "—", hint: "Not available" };
  if (metric.status === "error") return { value: "—", hint: "Not available" };
  return { value: String(metric.value), hint: null };
}

function yearLabel(overview: SchoolOverviewView | null, loading: boolean) {
  if (loading || !overview) return null;
  if (overview.academicYear.status === "ok") return overview.academicYear.name;
  if (overview.academicYear.status === "conflict") return "—";
  if (overview.academicYear.status === "error") return "Not available";
  return "Academic year not configured";
}

function termLabel(overview: SchoolOverviewView | null, loading: boolean) {
  if (loading || !overview) return null;
  if (overview.currentTerm.status === "ok") return overview.currentTerm.name;
  if (overview.currentTerm.status === "error") return "Not available";
  if (overview.currentTerm.status === "multiple") return "No active term";
  return "No active term";
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
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[#f3f6fa] px-2.5 text-[11.5px] font-medium text-slate-500">
      {label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string | null;
  hint: string | null;
  loading: boolean;
}) {
  return (
    <div className={`${glassCard} px-5 py-5`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-navy">
        {loading ? <PulseBar className="h-7 w-16" /> : (value ?? "—")}
      </p>
      {hint && !loading ? <p className="mt-1 text-[12px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value, loading }: { label: string; value: string | null; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="text-right text-[13.5px] font-medium text-navy">
        {loading ? <PulseBar className="h-4 w-24" /> : (value ?? "—")}
      </p>
    </div>
  );
}

export function SchoolOverviewRouteShell() {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Overview</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">
          <PulseBar className="h-4 w-48" />
        </p>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {["Total Students", "Attendance", "Fees Collected", "Outstanding Fees", "Teachers", "Class Levels"].map((label) => (
          <KpiCard key={label} label={label} value={null} hint={null} loading />
        ))}
      </section>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${glassPanel} min-h-[180px]`} />
        <div className={`${glassPanel} min-h-[180px]`} />
      </div>
    </div>
  );
}

export function SchoolOverviewPage() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SchoolOverviewView | null>(null);

  useEffect(() => {
    let active = true;
    void getSchoolOverviewAction().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        return;
      }
      setError(null);
      setOverview(result.overview);
      setPhase("ready");
    });
    return () => {
      active = false;
    };
  }, []);

  const loading = phase === "loading";
  const students = metricDisplay(overview?.students, loading);
  const attendance = metricDisplay(overview?.attendance, loading);
  const collected = metricDisplay(overview?.feesCollected, loading);
  const outstanding = metricDisplay(overview?.outstandingFees, loading);
  const teachers = metricDisplay(overview?.teachers, loading);
  const classes = metricDisplay(overview?.classLevels, loading);
  const classHint = overview?.classLevels.status === "ok" ? "Configured class levels" : classes.hint;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Overview</h1>
          <p className="mt-1 text-[13.5px] text-slate-500">
            {loading ? <PulseBar className="h-4 w-52" /> : overview?.schoolName}
          </p>
          <p className="mt-1 text-[13px] text-slate-400">
            {loading ? (
              <PulseBar className="h-3.5 w-64" />
            ) : (
              <>
                {yearLabel(overview, false)}
                <span className="mx-2 text-slate-300">·</span>
                {termLabel(overview, false)}
              </>
            )}
          </p>
        </div>
        {phase === "ready" && overview?.capabilities.canConfigure ? (
          <Link href="/school/settings" className={cn(secondaryButton, "transition duration-200")}>
            Configure School
          </Link>
        ) : null}
      </header>

      {phase === "error" && error ? (
        <p className="text-[13px] text-[#c45b66]">Couldn&apos;t load school overview. {error}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total Students" value={students.value} hint={students.hint} loading={loading} />
        <KpiCard label="Attendance" value={attendance.value} hint={attendance.hint} loading={loading} />
        <KpiCard label="Fees Collected" value={collected.value} hint={collected.hint} loading={loading} />
        <KpiCard label="Outstanding Fees" value={outstanding.value} hint={outstanding.hint} loading={loading} />
        <KpiCard label="Teachers" value={teachers.value} hint={teachers.hint} loading={loading} />
        <KpiCard label="Class Levels" value={classes.value} hint={classHint} loading={loading} />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className={glassPanel}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">School Snapshot</h2>
          <div className="mt-2 divide-y divide-black/[0.04]">
            <Detail label="School name" value={overview?.schoolName ?? null} loading={loading} />
            <Detail label="Location" value={overview?.location ?? null} loading={loading} />
            <Detail label="School code" value={overview?.schoolCode ?? null} loading={loading} />
          </div>
        </section>
        <section className={glassPanel}>
          <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Academic Overview</h2>
          <div className="mt-2 divide-y divide-black/[0.04]">
            <Detail label="Academic year" value={yearLabel(overview, loading)} loading={loading} />
            <Detail label="Current term" value={termLabel(overview, loading)} loading={loading} />
            <Detail
              label="Class levels"
              value={overview?.classLevels.status === "ok" ? String(overview.classLevels.value) : overview ? "Not available" : null}
              loading={loading}
            />
            <div className="flex items-center justify-between gap-4 py-2">
              <p className="text-[13px] text-slate-500">Grading</p>
              {loading || !overview ? <PulseBar className="h-6 w-24" /> : <StatusBadge status={overview.grading} />}
            </div>
          </div>
        </section>
      </div>

      <section className={glassPanel}>
        <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Configuration Status</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Attendance", overview?.attendanceRules],
              ["Fee Structure", overview?.feeStructure],
              ["Transport", overview?.transport],
              ["Grading", overview?.grading],
            ] as const
          ).map(([label, status]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-[16px] bg-white/60 px-4 py-3">
              <p className="text-[13px] text-slate-500">{label}</p>
              {loading || !status ? <PulseBar className="h-6 w-24" /> : <StatusBadge status={status} />}
            </div>
          ))}
        </div>
      </section>

      {phase === "ready" && overview && overview.attention.length > 0 ? (
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
    </div>
  );
}
