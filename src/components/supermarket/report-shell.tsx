"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  parseReportPeriodParams,
  reportPeriodQuery,
  resolveReportPeriod,
} from "@/lib/data/sample-supermarket-reports";
import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { primaryButton } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

export const reportGlass =
  "rounded-[22px] border border-white/60 bg-white/62 shadow-[0_12px_36px_rgba(15,35,64,0.055),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-2xl";

export type ControlledReportPeriod = {
  preset: SalesPeriodPreset;
  range: SalesDateRange;
};

/**
 * Period state for supermarket report detail pages.
 * When `controlled` is provided (owner Reports workspace), period comes from the parent
 * and local URL sync is disabled so the universal selector remains the source of truth.
 */
export function useReportPeriod(basePath: string, controlled?: ControlledReportPeriod) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = parseReportPeriodParams({
    period: searchParams.get("period"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  const [localPreset, setLocalPreset] = useState<SalesPeriodPreset>(initial.preset);
  const [localRange, setLocalRange] = useState<SalesDateRange>(initial.range);

  const preset = controlled?.preset ?? localPreset;
  const range = controlled?.range ?? localRange;
  const period = useMemo(() => resolveReportPeriod(preset, range), [preset, range]);
  const query = reportPeriodQuery(preset, range);

  function syncUrl(nextPreset: SalesPeriodPreset, nextRange: SalesDateRange) {
    if (controlled) return;
    router.replace(`${basePath}?${reportPeriodQuery(nextPreset, nextRange)}`, { scroll: false });
  }

  function onPreset(next: SalesPeriodPreset) {
    if (controlled) return;
    setLocalPreset(next);
    syncUrl(next, localRange);
  }

  function onRange(next: SalesDateRange) {
    if (controlled) return;
    setLocalRange(next);
    setLocalPreset("range");
    syncUrl("range", next);
  }

  return { preset, range, period, query, onPreset, onRange, controlled: Boolean(controlled) };
}

export function ReportPageHeader({
  title,
  subtitle,
  query,
  periodLabel,
  preset,
  range,
  onPreset,
  onRange,
  onExport,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  query: string;
  periodLabel: string;
  preset: SalesPeriodPreset;
  range: SalesDateRange;
  onPreset: (preset: SalesPeriodPreset) => void;
  onRange: (range: SalesDateRange) => void;
  onExport: () => void;
  showBack?: boolean;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {showBack ? <PageBackButton href={`/supermarket/reports?${query}`} prefetch /> : null}
        <h1
          className={cn(
            "text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]",
            showBack ? "mt-4" : "",
          )}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-[13.5px] text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <FinancePeriodFilter
          preset={preset}
          label={periodLabel}
          range={range}
          onPreset={onPreset}
          onRange={onRange}
          ariaLabel={`${title} period`}
        />
        <button type="button" onClick={onExport} className={cn(primaryButton, "w-full shrink-0 sm:w-auto")}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Export
        </button>
      </div>
    </header>
  );
}

export function SummarySection({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string }[];
}) {
  return (
    <section className={cn(reportGlass, "min-w-0 px-4 py-4 sm:px-5 sm:py-5")}>
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">{title}</h2>
      <div
        className={cn(
          "mt-4 grid gap-3",
          items.length <= 2
            ? "grid-cols-1 sm:grid-cols-2"
            : items.length <= 4
              ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {items.map((item) => (
          <div key={item.label} className="min-w-0 rounded-[16px] border border-white/70 bg-white/45 px-3.5 py-3">
            <p className="text-[12px] font-medium text-slate-500">{item.label}</p>
            <p className="mt-1.5 truncate text-[17px] font-semibold tracking-[-0.03em] text-navy sm:text-[18px]">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReportSection({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(reportGlass, "min-w-0 overflow-hidden", className)}>
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">{title}</h2>
        {subtitle ? <p className="mt-1 text-[12.5px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function DesktopTable({
  headers,
  children,
  minWidth = "640px",
}: {
  headers: string[];
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead className="bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                className={cn("py-2.5", index === 0 ? "pl-5 pr-3" : index === headers.length - 1 ? "pl-3 pr-5" : "px-3")}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const tone =
    value === "Completed" || value === "Paid" || value === "Received" || value === "In Stock"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : value === "Refunded" || value === "Out of Stock" || value === "Unpaid" || value === "Expired"
        ? "bg-[#fff2f3] text-[#c45b66]"
        : value === "Low Stock" || value === "Partial" || value === "Expiring Soon"
          ? "bg-[#fff8eb] text-[#b5812a]"
          : "bg-[#f3f6fa] text-slate-500";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>
      {value}
    </span>
  );
}
