"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getReconciliationOverviewAction } from "@/actions/supermarket/reconciliation-overview";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { cn } from "@/lib/cn";
import type { ReconciliationOverviewCard } from "@/lib/supermarket/reconciliation";
import {
  RECON_OVERVIEW_SHELLS,
  reconGlass,
  StatusBadge,
  useReconPeriod,
} from "./shared";

export function ReconciliationOverview() {
  const { preset, setPreset, range, setRange, period } = useReconPeriod();
  const [cards, setCards] = useState<ReconciliationOverviewCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const periodKey = `${period.start}:${period.end}`;
  const pending = loadedKey !== periodKey;

  useEffect(() => {
    let active = true;
    void getReconciliationOverviewAction({ from: period.start, to: period.end })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error);
          setLoadedKey(`${period.start}:${period.end}`);
          return;
        }
        setError(null);
        setCards(result.cards);
        setLoadedKey(`${period.start}:${period.end}`);
      })
      .catch(() => {
        if (!active) return;
        setError("Could not load reconciliation.");
        setLoadedKey(`${period.start}:${period.end}`);
      });
    return () => {
      active = false;
    };
  }, [period.start, period.end]);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
            Reconciliation
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Review and confirm sales, cash, stock and bank balances.
          </p>
        </div>
        <FinancePeriodFilter
          preset={preset}
          label={period.label}
          range={range}
          onPreset={setPreset}
          onRange={setRange}
          ariaLabel="Reconciliation period"
        />
      </header>

      {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RECON_OVERVIEW_SHELLS.map((shell) => {
          const card = cards?.find((item) => item.kind === shell.kind);
          if (cards && !card) return null;
          return (
            <Link
              key={shell.kind}
              href={`${shell.href}?from=${period.start}&to=${period.end}`}
              className={cn(
                reconGlass,
                "block min-h-[118px] px-5 py-5 transition hover:-translate-y-0.5",
                pending && cards ? "opacity-80" : "opacity-100",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">{shell.title}</h2>
                <StatusBadge label={card?.statusLabel ?? "Not Reconciled"} tone={card?.tone ?? "neutral"} />
              </div>
              <p className="mt-3 text-[13px] leading-5 text-slate-500">
                {card?.detail ?? "No reconciliation for this period"}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
