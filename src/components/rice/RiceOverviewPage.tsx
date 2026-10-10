"use client";

import type { LucideIcon } from "lucide-react";
import { CircleDollarSign, Factory, Package, Wheat, Landmark } from "lucide-react";
import { OverviewPeriodSelector } from "@/components/dashboard/OverviewPeriodSelector";
import { StatusPill, glassCard, glassPanel } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import type { RiceGradeShare, RiceMetric, RiceOverviewView } from "@/lib/rice/overview";

const NAVY_SLATE = ["#0b2244", "#3d5a80", "#5b7fa6", "#8aa0b8", "#c5d0dc"];

function formatKg(value: number) {
  return `${new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(value)} kg`;
}

function IconWell({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/80 bg-navy/[0.045] text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function NumberBadge({ index }: { index: number }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 text-[12px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]">
      {index}
    </span>
  );
}

function metricText(metric: RiceMetric<number>, kind: "kg" | "money") {
  if (metric.status === "empty") {
    return { value: kind === "kg" ? formatKg(0) : formatTzs(0), hint: metric.hint };
  }
  if (metric.status !== "ok" || metric.value == null) {
    return { value: "—", hint: metric.hint };
  }
  return {
    value: kind === "kg" ? formatKg(metric.value) : formatTzs(metric.value),
    hint: metric.hint,
  };
}

function KpiCard({
  label,
  metric,
  kind,
  icon,
}: {
  label: string;
  metric: RiceMetric<number>;
  kind: "kg" | "money";
  icon: LucideIcon;
}) {
  const display = metricText(metric, kind);
  return (
    <article className={cn(glassCard, "px-5 py-5")}>
      <IconWell icon={icon} />
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 min-h-7 text-[22px] font-semibold tracking-[-0.04em] text-navy">{display.value}</p>
      <p className="mt-1 min-h-8 text-[12px] leading-4 text-slate-400">{display.hint}</p>
    </article>
  );
}

function GradeDonut({ rows }: { rows: RiceGradeShare[] }) {
  const total = rows.reduce((sum, row) => sum + row.quantityKg, 0);
  if (!total || !rows.length) return null;
  const stops = rows.map((row, index) => {
    const start = rows.slice(0, index).reduce((sum, item) => sum + (item.quantityKg / total) * 100, 0);
    const end = start + (row.quantityKg / total) * 100;
    return `${NAVY_SLATE[index % NAVY_SLATE.length]} ${start}% ${end}%`;
  });
  return (
    <div className="relative mx-auto h-44 w-44">
      <div
        className="h-full w-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        aria-hidden
      />
      <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full border border-white/80 bg-white/90 text-center shadow-[0_8px_24px_rgba(15,35,64,0.06)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Total</p>
        <p className="mt-0.5 text-[15px] font-semibold tracking-[-0.03em] text-navy">{formatKg(total)}</p>
        <p className="text-[11px] text-slate-400">Rice stock</p>
      </div>
    </div>
  );
}

function UnavailablePanel({ title, hint }: { title: string; hint: string }) {
  return (
    <section className={cn(glassPanel, "flex min-h-[22rem] flex-col")}>
      <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">{title}</h2>
      <p className="mt-8 flex-1 text-[13.5px] leading-6 text-slate-500">{hint}</p>
    </section>
  );
}

export function RiceOverviewPage({
  overview,
  period,
  periodLabel,
  error,
  pending = false,
}: {
  overview: RiceOverviewView | null;
  period: ReportPeriod;
  periodLabel: string;
  error: string | null;
  pending?: boolean;
}) {
  const grades = overview?.stockByGrade.status === "ok" ? overview.stockByGrade.value ?? [] : [];
  const stock = overview?.currentStock.status === "ok" ? overview.currentStock.value ?? [] : [];
  const services = overview?.serviceIncome.status === "ok" ? overview.serviceIncome.value ?? [] : [];

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header
        className={cn(
          glassCard,
          "relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.18]"
          style={{ backgroundImage: "url(/images/banner-landscape.jpg)" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/92 via-white/78 to-white/40" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <IconWell icon={Wheat} />
              <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">
                {overview?.unitName ?? "Rice Mill & Warehouse"}
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-slate-500">
              {overview?.location ? <span>{overview.location}</span> : null}
              {overview?.isActive != null ? <StatusPill value={overview.isActive ? "Active" : "Inactive"} /> : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[12.5px] text-slate-500">{overview?.todayLabel ?? ""}</p>
            <OverviewPeriodSelector period={period} label={periodLabel} />
          </div>
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
      {pending && !overview ? <p className="text-[13px] text-slate-500">Loading live Rice Mill figures…</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Company Paddy Stock" metric={overview?.companyPaddyKg ?? { status: "unavailable", value: null, hint: "" }} kind="kg" icon={Wheat} />
        <KpiCard label="Rice Stock" metric={overview?.riceStockKg ?? { status: "unavailable", value: null, hint: "" }} kind="kg" icon={Package} />
        <KpiCard label="Total Sales" metric={overview?.totalSales ?? { status: "unavailable", value: null, hint: "" }} kind="money" icon={CircleDollarSign} />
        <KpiCard label="Milled Today" metric={overview?.milledTodayKg ?? { status: "unavailable", value: null, hint: "" }} kind="kg" icon={Factory} />
        <KpiCard label="Net Profit" metric={overview?.netProfit ?? { status: "unavailable", value: null, hint: "" }} kind="money" icon={Landmark} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {overview?.stockByGrade.status === "ok" && grades.length ? (
          <section className={cn(glassPanel, "min-h-[22rem]")}>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Stock by Grade</h2>
            <div className="mt-5">
              <GradeDonut rows={grades} />
            </div>
            <ul className="mt-5 space-y-2.5">
              {grades.map((row, index) => (
                <li key={row.name} className="flex items-center gap-3 text-[13.5px] text-navy">
                  <NumberBadge index={index + 1} />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="font-medium">{formatKg(row.quantityKg)}</span>
                  <span className="w-12 text-right text-slate-500">{Math.round(row.share)}%</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <UnavailablePanel title="Stock by Grade" hint={overview?.stockByGrade.hint ?? "Rice grade quantities are not available."} />
        )}

        {overview?.currentStock.status === "ok" && stock.length ? (
          <section className={cn(glassPanel, "min-h-[22rem]")}>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Current Stock</h2>
            <ul className="mt-5 space-y-3">
              {stock.map((row, index) => (
                <li key={row.name} className="space-y-1.5">
                  <div className="flex items-center gap-3 text-[13.5px] text-navy">
                    <NumberBadge index={index + 1} />
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="font-medium">{formatKg(row.quantityKg)}</span>
                  </div>
                  <div className="ml-11 h-1.5 overflow-hidden rounded-full bg-navy/[0.06]">
                    <div className="h-full rounded-full bg-navy/40" style={{ width: `${Math.max(4, Math.min(100, row.share))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <UnavailablePanel title="Current Stock" hint={overview?.currentStock.hint ?? "Current rice inventory is not available."} />
        )}

        {overview?.serviceIncome.status === "ok" && services.length ? (
          <section className={cn(glassPanel, "min-h-[22rem]")}>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Service Income (This Month)</h2>
            <ul className="mt-5 space-y-3">
              {services.map((row, index) => (
                <li key={row.name} className="flex items-center gap-3 text-[13.5px] text-navy">
                  <NumberBadge index={index + 1} />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="font-medium">{formatTzs(row.amount)}</span>
                  <span className="w-12 text-right text-slate-500">{Math.round(row.share)}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-navy/5 pt-4 text-[14px] font-semibold text-navy">
              Total Service Income{" "}
              {overview.serviceIncomeTotal.status === "ok" && overview.serviceIncomeTotal.value != null
                ? formatTzs(overview.serviceIncomeTotal.value)
                : "—"}
            </p>
          </section>
        ) : (
          <UnavailablePanel
            title="Service Income (This Month)"
            hint={overview?.serviceIncome.hint ?? "No posted service income this month."}
          />
        )}
      </section>
    </div>
  );
}
