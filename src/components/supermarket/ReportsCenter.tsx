"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Boxes, Check, Download, ShoppingBag, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { REPORT_KIND_META, type ReportKind } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import { primaryButton } from "@/components/supermarket/purchasing-ui";
import { reportGlass, useReportPeriod } from "@/components/supermarket/report-shell";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";

const CARDS: { kind: ReportKind; icon: typeof TrendingUp }[] = [
  { kind: "sales", icon: TrendingUp },
  { kind: "inventory", icon: Boxes },
  { kind: "purchases", icon: ShoppingBag },
  { kind: "profit-loss", icon: BarChart3 },
];

export function ReportsCenter() {
  const { preset, range, period, query, onPreset, onRange } = useReportPeriod("/supermarket/reports");
  const [selected, setSelected] = useState<ReportKind | null>(null);
  const [exportHint, setExportHint] = useState(false);

  function handleExport() {
    if (!selected) {
      setExportHint(true);
      return;
    }
    setExportHint(false);
    downloadReportPdf(selected, preset, range);
  }

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Reports</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">View and export detailed supermarket reports.</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <FinancePeriodFilter
            preset={preset}
            label={period.label}
            range={range}
            onPreset={onPreset}
            onRange={onRange}
            ariaLabel="Reports period"
          />
          <button
            type="button"
            onClick={handleExport}
            aria-disabled={!selected}
            className={cn(
              primaryButton,
              "w-full shrink-0 sm:w-auto",
              !selected && "cursor-not-allowed bg-[#0b2244]/45 opacity-55 shadow-none hover:bg-[#0b2244]/45",
            )}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Export
          </button>
        </div>
      </header>

      {exportHint && !selected ? (
        <p className="text-[13px] font-medium text-amber-700/90" role="status">
          Select a report to export.
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const meta = REPORT_KIND_META[card.kind];
          const Icon = card.icon;
          const isSelected = selected === card.kind;
          return (
            <article
              key={card.kind}
              className={cn(
                reportGlass,
                "flex min-w-0 flex-col px-4 py-4 transition duration-200",
                isSelected
                  ? "border-[#0b2244]/25 bg-white/78 ring-2 ring-[#0b2244]/20"
                  : "hover:border-white/80 hover:bg-white/70",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setSelected(card.kind);
                  setExportHint(false);
                }}
                aria-pressed={isSelected}
                className="flex w-full min-w-0 items-start gap-3 text-left"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/72 text-navy/70 shadow-[0_4px_10px_rgba(15,35,64,0.04)]">
                  <Icon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold tracking-[-0.02em] text-navy">{meta.title}</span>
                    {isSelected ? (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0b2244] text-white">
                        <Check className="h-3 w-3" strokeWidth={2.4} />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-5 text-slate-500">{meta.description}</span>
                </span>
              </button>
              <Link href={`${meta.href}?${query}`} prefetch className={cn(primaryButton, "mt-4 w-full")}>
                View Report
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
