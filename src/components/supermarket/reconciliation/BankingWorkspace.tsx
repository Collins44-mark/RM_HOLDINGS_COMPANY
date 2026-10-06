"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FinancePeriodFilter } from "@/components/supermarket/FinancePeriodFilter";
import { BankMovementsPage, BankingTabs } from "@/components/supermarket/reconciliation/BankMovements";
import { BankReconPanel } from "@/components/supermarket/reconciliation/BankRecon";
import { useReconPeriod } from "@/components/supermarket/reconciliation/shared";

const MOVEMENTS_HREF = "/supermarket/finance/banking";
const RECON_HREF = "/supermarket/finance/bank-reconciliation";

function tabFromPath(pathname: string): "movements" | "reconcile" {
  return pathname.includes("/bank-reconciliation") ? "reconcile" : "movements";
}

export function BankingWorkspace() {
  const pathname = usePathname();
  const [tab, setTab] = useState<"movements" | "reconcile">(() => tabFromPath(pathname));
  const { preset, setPreset, range, setRange, period } = useReconPeriod();

  useEffect(() => {
    const next = tabFromPath(pathname);
    // Align in-page tabs with sidebar/direct URL without remounting the workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(next);
  }, [pathname]);

  useEffect(() => {
    function onPopState() {
      setTab(tabFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const syncTab = useCallback((next: "movements" | "reconcile") => {
    setTab(next);
    const href = next === "reconcile" ? RECON_HREF : MOVEMENTS_HREF;
    if (window.location.pathname !== href) {
      window.history.pushState(window.history.state ?? null, "", href);
    }
  }, []);

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy">Banking</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Manage bank deposits and withdrawals and reconcile bank movements.
          </p>
        </div>
        <FinancePeriodFilter
          preset={preset}
          label={period.label}
          range={range}
          onPreset={setPreset}
          onRange={setRange}
        />
      </header>
      <BankingTabs active={tab} onChange={syncTab} />
      <div className={tab === "movements" ? "" : "hidden"}>
        <BankMovementsPage omitChrome periodStart={period.start} periodEnd={period.end} />
      </div>
      <div className={tab === "reconcile" ? "" : "hidden"}>
        <BankReconPanel omitChrome periodStart={period.start} periodEnd={period.end} />
      </div>
    </div>
  );
}
