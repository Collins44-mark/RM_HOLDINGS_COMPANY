"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Boxes, Check, Download, ShoppingBag, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { REPORT_KIND_META, type ReportKind } from "@/lib/data/sample-supermarket-reports";
import { downloadReportPdf } from "@/lib/data/supermarket-reports-pdf";
import { primaryButton } from "@/components/supermarket/purchasing-ui";
import { reportGlass, useReportPeriod } from "@/components/supermarket/report-shell";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { getReconciliationReportStripAction } from "@/actions/supermarket/reconciliation";
import { getBankMovementReportStripAction } from "@/actions/supermarket/banking";
import { getPettyCashReportStripAction } from "@/actions/supermarket/petty-cash";
import { formatTzs } from "@/lib/format/currency";
import { moneyToCents } from "@/lib/supermarket/money";

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
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!selected) {
      setExportHint(true);
      return;
    }
    setExportHint(false);
    setExportError(null);
    setExporting(true);
    try {
      const result = await downloadReportPdf(selected, preset, range);
      if (!result.ok) setExportError(result.error);
    } finally {
      setExporting(false);
    }
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
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-disabled={!selected || exporting}
            className={cn(
              primaryButton,
              "w-full shrink-0 sm:w-auto",
              (!selected || exporting) &&
                "cursor-not-allowed bg-[#0b2244]/45 opacity-55 shadow-none hover:bg-[#0b2244]/45",
            )}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </header>

      {exportHint && !selected ? (
        <p className="text-[13px] font-medium text-amber-700/90" role="status">
          Select a report to export.
        </p>
      ) : null}
      {exportError ? (
        <p className="text-[13px] font-medium text-[#c45b66]" role="alert">
          {exportError}
        </p>
      ) : null}

      <ReconciliationReportStrip from={period.start} to={period.end} />
      <BankMovementReportStrip from={period.start} to={period.end} />
      <PettyCashReportStrip from={period.start} to={period.end} />

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

function ReconciliationReportStrip({ from, to }: { from: string; to: string }) {
  const [cards, setCards] = useState<Array<{ title: string; statusLabel: string; detail: string; href: string }>>([]);

  useEffect(() => {
    let active = true;
    void getReconciliationReportStripAction({ from, to }).then((result) => {
      if (!active || !result.ok) return;
      setCards(result.cards);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (!cards.length) return null;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Link key={card.href} href={card.href} className={cn(reportGlass, "block px-4 py-4")}>
          <p className="text-[13px] font-semibold text-navy">{card.title}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {card.statusLabel} · {card.detail}
          </p>
        </Link>
      ))}
    </section>
  );
}

function BankMovementReportStrip({ from, to }: { from: string; to: string }) {
  const [summary, setSummary] = useState<{ deposits: string; withdrawals: string; net: string; unmatched: number } | null>(null);

  useEffect(() => {
    let active = true;
    void getBankMovementReportStripAction({ from, to }).then((result) => {
      if (!active || !result.ok) return;
      setSummary({
        deposits: result.deposits,
        withdrawals: result.withdrawals,
        net: result.net,
        unmatched: result.unmatched,
      });
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (!summary) return null;

  const items = [
    { title: "Bank deposits", detail: summary.deposits },
    { title: "Bank withdrawals", detail: summary.withdrawals },
    { title: "Net bank movement", detail: summary.net },
    { title: "Unmatched bank lines", detail: String(summary.unmatched) },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Link key={item.title} href="/supermarket/finance/banking" className={cn(reportGlass, "block px-4 py-4")}>
          <p className="text-[13px] font-semibold text-navy">{item.title}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">{item.detail}</p>
        </Link>
      ))}
    </section>
  );
}

function PettyCashReportStrip({ from, to }: { from: string; to: string }) {
  const [summary, setSummary] = useState<{
    currentBalance: string;
    totalSpent: string;
    totalReplenished: string;
    variance: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void getPettyCashReportStripAction({ from, to }).then((result) => {
      if (!active || !result.ok) return;
      setSummary({
        currentBalance: result.currentBalance,
        totalSpent: result.totalSpent,
        totalReplenished: result.totalReplenished,
        variance: result.variance,
        count: result.count,
      });
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (!summary) return null;

  const items = [
    { title: "Petty cash balance", detail: formatTzs(moneyToCents(summary.currentBalance) / 100) },
    { title: "Petty cash expenses", detail: formatTzs(moneyToCents(summary.totalSpent) / 100) },
    { title: "Petty cash replenishments", detail: formatTzs(moneyToCents(summary.totalReplenished) / 100) },
    { title: "Petty cash variance", detail: `${formatTzs(moneyToCents(summary.variance) / 100)} · ${summary.count} txn` },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Link key={item.title} href="/supermarket/finance/petty-cash" className={cn(reportGlass, "block px-4 py-4")}>
          <p className="text-[13px] font-semibold text-navy">{item.title}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">{item.detail}</p>
        </Link>
      ))}
    </section>
  );
}
