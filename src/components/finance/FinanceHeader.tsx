"use client";

import { DateRangeSelector } from "@/components/finance/DateRangeSelector";
import { ExportMenu } from "@/components/finance/ExportMenu";
import { useT } from "@/components/i18n/LocaleProvider";
import type { FinanceTab, UnitFinanceRow } from "@/lib/data/finance";
import type { ReportPeriod } from "@/lib/data/report-period";

export function FinanceHeader({
  period,
  label,
  tab,
  rows,
  totals,
}: {
  period: ReportPeriod;
  label: string;
  tab: FinanceTab;
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em] text-navy sm:text-[30px]">
        {t("finance.title")}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeSelector period={period} label={label} tab={tab} />
        <ExportMenu rows={rows} totals={totals} />
      </div>
    </div>
  );
}
