"use client";

import { REPORT_PERIOD_OPTIONS, type ReportPeriod } from "@/lib/data/report-period";
import { filterClass } from "@/components/supermarket/purchasing-ui";
import { useT } from "@/components/i18n/LocaleProvider";
import type { MessageKey } from "@/lib/i18n";

export function RiceListPeriodFilter({
  period,
  from,
  to,
  onChange,
}: {
  period: ReportPeriod;
  from: string;
  to: string;
  onChange: (next: { period: ReportPeriod; from: string; to: string }) => void;
}) {
  const t = useT();
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
      <label className="block w-full sm:w-48">
        <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("rice.milling.filterDate")}</span>
        <select
          className={filterClass}
          value={period}
          onChange={(event) => onChange({ period: event.target.value as ReportPeriod, from, to })}
        >
          {REPORT_PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === "custom" ? t("rice.milling.customRange") : t(`period.${option.value}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      {period === "custom" ? (
        <>
          <label className="block w-full sm:w-40">
            <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("period.from")}</span>
            <input
              type="date"
              className={filterClass}
              value={from}
              onChange={(event) => onChange({ period: "custom", from: event.target.value, to })}
            />
          </label>
          <label className="block w-full sm:w-40">
            <span className="mb-1 block text-[12px] font-medium text-slate-500">{t("period.to")}</span>
            <input
              type="date"
              className={filterClass}
              value={to}
              onChange={(event) => onChange({ period: "custom", from, to: event.target.value })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
