import { DateRangeSelector } from "@/components/finance/DateRangeSelector";
import { ExportMenu } from "@/components/finance/ExportMenu";
import type { UnitFinanceRow } from "@/lib/data/finance";
import type { RevenuePeriod } from "@/lib/data/period";

export function FinanceHeader({
  period,
  label,
  rows,
  totals,
}: {
  period: RevenuePeriod;
  label: string;
  rows: UnitFinanceRow[];
  totals: { revenue: number; expenses: number; operatingPosition: number; margin: number };
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em] text-navy sm:text-[30px]">
        Finance (Consolidated)
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeSelector period={period} label={label} />
        <ExportMenu rows={rows} totals={totals} />
      </div>
    </div>
  );
}
