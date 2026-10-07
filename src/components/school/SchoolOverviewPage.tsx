import type { ConfigStatus, OverviewMetric, SchoolOverviewView } from "@/lib/school/overview";
import { glassCard, glassPanel } from "@/components/supermarket/purchasing-ui";

function metricDisplay(metric: OverviewMetric<number>) {
  if (metric.status === "unavailable") return { value: "—", hint: "Not available" };
  if (metric.status === "error") return { value: "—", hint: "Not available" };
  return { value: String(metric.value), hint: null };
}

function yearLabel(overview: SchoolOverviewView) {
  if (overview.academicYear.status === "ok") return overview.academicYear.name;
  if (overview.academicYear.status === "conflict") return "—";
  if (overview.academicYear.status === "error") return "Not available";
  return "Academic year not configured";
}

function termLabel(overview: SchoolOverviewView) {
  if (overview.currentTerm.status === "ok") return overview.currentTerm.name;
  if (overview.currentTerm.status === "error") return "Not available";
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

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string | null }) {
  return (
    <div className={`${glassCard} px-5 py-5`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="text-right text-[13.5px] font-medium text-navy">{value}</p>
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
  const students = overview ? metricDisplay(overview.students) : { value: "—", hint: "Not available" };
  const attendance = overview ? metricDisplay(overview.attendance) : { value: "—", hint: "Not available" };
  const collected = overview ? metricDisplay(overview.feesCollected) : { value: "—", hint: "Not available" };
  const outstanding = overview ? metricDisplay(overview.outstandingFees) : { value: "—", hint: "Not available" };
  const teachers = overview ? metricDisplay(overview.teachers) : { value: "—", hint: "Not available" };
  const classes = overview
    ? overview.classLevels.status === "ok"
      ? { value: String(overview.classLevels.value), hint: "Configured class levels" }
      : metricDisplay(overview.classLevels)
    : { value: "—", hint: "Not available" };

  const context =
    overview && overview.academicYear.status === "ok"
      ? `${yearLabel(overview)} · ${termLabel(overview)}`
      : overview
        ? yearLabel(overview)
        : null;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">School Overview</h1>
        {context ? <p className="mt-1 text-[13.5px] text-slate-500">{context}</p> : null}
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">Couldn&apos;t load school overview.</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total Students" value={students.value} hint={students.hint} />
        <KpiCard label="Attendance" value={attendance.value} hint={attendance.hint} />
        <KpiCard label="Fees Collected" value={collected.value} hint={collected.hint} />
        <KpiCard label="Outstanding Fees" value={outstanding.value} hint={outstanding.hint} />
        <KpiCard label="Teachers" value={teachers.value} hint={teachers.hint} />
        <KpiCard label="Class Levels" value={classes.value} hint={classes.hint} />
      </section>

      {overview ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className={glassPanel}>
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">School Snapshot</h2>
              <div className="mt-2 divide-y divide-black/[0.04]">
                <Detail label="School name" value={overview.schoolName} />
                <Detail label="Location" value={overview.location} />
                <Detail label="School code" value={overview.schoolCode} />
              </div>
            </section>
            <section className={glassPanel}>
              <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Academic Overview</h2>
              <div className="mt-2 divide-y divide-black/[0.04]">
                <Detail label="Academic year" value={yearLabel(overview)} />
                <Detail label="Current term" value={termLabel(overview)} />
                <Detail
                  label="Class levels"
                  value={overview.classLevels.status === "ok" ? String(overview.classLevels.value) : "Not available"}
                />
                <div className="flex items-center justify-between gap-4 py-2">
                  <p className="text-[13px] text-slate-500">Grading</p>
                  <StatusBadge status={overview.grading} />
                </div>
              </div>
            </section>
          </div>

          <section className={glassPanel}>
            <h2 className="text-[15px] font-semibold tracking-[-0.03em] text-navy">Configuration Status</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Attendance", overview.attendanceRules],
                  ["Fee Structure", overview.feeStructure],
                  ["Transport", overview.transport],
                  ["Grading", overview.grading],
                ] as const
              ).map(([label, status]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-[16px] bg-white/60 px-4 py-3">
                  <p className="text-[13px] text-slate-500">{label}</p>
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
