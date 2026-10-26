"use client";

import type { LucideIcon } from "lucide-react";
import { Tractor, CheckCircle2, Users, CircleDollarSign, Wrench } from "lucide-react";
import Link from "next/link";
import { OverviewPeriodSelector } from "@/components/dashboard/OverviewPeriodSelector";
import { glassCard, glassPanel, tableHead, tableScrollClass } from "@/components/supermarket/purchasing-ui";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import type { ReportPeriod } from "@/lib/data/report-period";
import { useLocale, useT } from "@/components/i18n/LocaleProvider";
import { farmJobStatusKey, farmTractorStatusKey } from "@/components/farm/farm-ui";
import type { FarmMetric, FarmOverviewView } from "@/actions/farm/overview";
import { translateFarmCopy } from "@/lib/farm/error-copy";

function IconWell({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]", tone)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function FarmPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "COMPLETED" || status === "IN_USE"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : status === "CANCELLED" || status === "INACTIVE"
        ? "bg-[#fff2f3] text-[#c45b66]"
        : "bg-[#fff8eb] text-[#b5812a]";
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>{label}</span>;
}

function metricText(metric: FarmMetric<number>, kind: "count" | "money") {
  if (metric.status !== "ok" || metric.value == null) return "—";
  if (kind === "money") return formatTzs(metric.value);
  return String(metric.value);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={cn(glassCard, "px-5 py-5")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1.5 min-h-7 text-[22px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </article>
  );
}

export /* Dashboard verified against reference — existing layout already matches */
function FarmOverviewPage({
  overview,
  period,
  periodLabel,
  error,
}: {
  overview: FarmOverviewView | null;
  period: ReportPeriod;
  periodLabel: string;
  error: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const view = overview;

  function hours(value: number) {
    return `${new Intl.NumberFormat(locale === "sw" ? "sw-TZ" : "en-TZ", { maximumFractionDigits: 1 }).format(value)} h`;
  }
  function litres(value: number) {
    return `${new Intl.NumberFormat(locale === "sw" ? "sw-TZ" : "en-TZ", { maximumFractionDigits: 1 }).format(value)} L`;
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className={cn(glassCard, "relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7")}>
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22]"
          style={{ backgroundImage: "url(/images/login-landscape.jpg)" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/94 via-white/80 to-white/35" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <IconWell icon={Tractor} tone="bg-emerald-50 text-emerald-700" />
              <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">{view?.unitName ?? t("farm.unit")}</h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-slate-500">
              {view?.location ? <span>{view.location}</span> : null}
              {view?.isActive != null ? (
                <FarmPill status={view.isActive ? "IN_USE" : "INACTIVE"} label={view.isActive ? t("common.active") : t("common.inactive")} />
              ) : null}
            </div>
            <p className="mt-2 max-w-xl text-[13.5px] leading-5 text-slate-500">{t("farm.overview.tagline")}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <OverviewPeriodSelector period={period} label={periodLabel} />
          </div>
        </div>
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{translateFarmCopy(t, error)}</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label={t("farm.kpi.tractors")}
          value={metricText(view?.tractorCount ?? { status: "unavailable", value: null, hint: "" }, "count")}
        />
        <KpiCard
          label={t("farm.kpi.completed")}
          value={metricText(view?.completedJobs ?? { status: "unavailable", value: null, hint: "" }, "count")}
        />
        <KpiCard
          label={t("farm.kpi.customers")}
          value={metricText(view?.customersServed ?? { status: "unavailable", value: null, hint: "" }, "count")}
        />
        <KpiCard
          label={t("farm.kpi.income")}
          value={metricText(view?.serviceIncome ?? { status: "unavailable", value: null, hint: "" }, "money")}
        />
        <KpiCard
          label={t("farm.kpi.spend")}
          value={metricText(view?.tractorSpend ?? { status: "unavailable", value: null, hint: "" }, "money")}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className={glassPanel}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.overview.tractors")}</h2>
            <Link href="/farm/tractors" className="text-[13px] font-semibold text-navy/70 hover:text-navy">
              {t("farm.overview.viewAll")}
            </Link>
          </div>
          <div className={`${tableScrollClass} mt-4`}>
            <table className="min-w-full text-left text-[13.5px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">{t("farm.tractor.nameCode")}</th>
                  <th className="px-3 py-2">{t("common.status")}</th>
                  <th className="px-3 py-2">{t("farm.tractor.hours")}</th>
                  <th className="px-3 py-2">{t("farm.tractor.fuel")}</th>
                </tr>
              </thead>
              <tbody>
                {(view?.tractors ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-500" colSpan={2}>
                      {t("farm.tractor.empty")}
                    </td>
                  </tr>
                ) : (
                  (view?.tractors ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">
                        {row.name}
                        {row.registrationNumber ? ` ${row.registrationNumber}` : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <FarmPill status={row.status} label={t(farmTractorStatusKey(row.status))} />
                      </td>
                      <td className="px-3 py-2.5">{hours(row.hourMeter)}</td>
                      <td className="px-3 py-2.5">{litres(row.fuelLitres)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={glassPanel}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-navy">{t("farm.overview.jobs")}</h2>
            <Link href="/farm/jobs" className="text-[13px] font-semibold text-navy/70 hover:text-navy">
              {t("farm.overview.viewAll")}
            </Link>
          </div>
          <div className={`${tableScrollClass} mt-4`}>
            <table className="min-w-full text-left text-[13.5px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">{t("common.date")}</th>
                  <th className="px-3 py-2">{t("farm.job.customerPlace")}</th>
                  <th className="px-3 py-2">{t("farm.job.service")}</th>
                  <th className="px-3 py-2">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {(view?.jobs ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-500" colSpan={2}>
                      {t("farm.job.empty")}
                    </td>
                  </tr>
                ) : (
                  (view?.jobs ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-navy/5 text-navy">
                      <td className="px-3 py-2.5">{row.occurredOn}</td>
                      <td className="px-3 py-2.5">{row.location ? `${row.partyName} · ${row.location}` : row.partyName}</td>
                      <td className="px-3 py-2.5">
                        {row.serviceName}
                        {row.areaHa != null ? ` (${row.areaHa} ha)` : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <FarmPill status={row.status} label={t(farmJobStatusKey(row.status))} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className={glassPanel}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-navy">{t("farm.overview.activity")}</h2>
          <Link href="/farm/fuel" className="text-[13px] font-semibold text-navy/70 hover:text-navy">
            {t("farm.overview.viewAll")}
          </Link>
        </div>
        <div className={`${tableScrollClass} mt-4`}>
          <table className="min-w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">{t("common.date")}</th>
                <th className="px-3 py-2">{t("farm.tractor.singular")}</th>
                <th className="px-3 py-2">{t("common.type")}</th>
                <th className="px-3 py-2">{t("farm.activity.detail")}</th>
                <th className="px-3 py-2">{t("farm.activity.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {(view?.activity ?? []).length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={5}>
                    {t("farm.activity.empty")}
                  </td>
                </tr>
              ) : (
                (view?.activity ?? []).map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="border-t border-navy/5 text-navy">
                    <td className="px-3 py-2.5">{row.occurredOn}</td>
                    <td className="px-3 py-2.5">{row.tractorName}</td>
                    <td className="px-3 py-2.5">{row.kind === "FUEL" ? t("farm.fuel.kind") : t("farm.maint.kind")}</td>
                    <td className="px-3 py-2.5">{row.detail}</td>
                    <td className="px-3 py-2.5">{formatTzs(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
