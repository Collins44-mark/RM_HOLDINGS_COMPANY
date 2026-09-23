import { cn } from "@/lib/cn";

export function ReportSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-white/70 bg-white/72 shadow-[0_12px_40px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ReportMetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[16px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_6px_18px_rgba(15,35,64,0.04)]">
      <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-navy">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function ReportResultHeader({
  moduleLabel,
  title,
  description,
  live = true,
}: {
  moduleLabel: string;
  title: string;
  description: string;
  live?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {moduleLabel}
        </p>
        <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em] text-navy">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-5 text-slate-500">{description}</p>
      </div>
      {live ? (
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200/60 bg-emerald-50/70 px-3 py-1.5 text-[12px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live Production Data
        </p>
      ) : null}
    </div>
  );
}

export function ReportEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ReportSurface className="px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-navy">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-6 text-slate-500">{description}</p>
    </ReportSurface>
  );
}
