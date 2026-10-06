import { glassCard } from "@/components/supermarket/purchasing-ui";

/** Server-only shell. Do not import reconciliation/shared.tsx (`"use client"`) from here. */
const SHELLS = [
  { kind: "sales", title: "Sales Reconciliation" },
  { kind: "cash", title: "Cash Reconciliation" },
  { kind: "stock", title: "Stock Reconciliation" },
  { kind: "bank", title: "Bank Reconciliation" },
] as const;

export default function Loading() {
  return (
    <div className="min-w-0 max-w-full space-y-5 pb-10" aria-hidden>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">
            Reconciliation
          </h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">
            Review and confirm sales, cash, stock and bank balances.
          </p>
        </div>
        <div className="h-11 w-full max-w-sm animate-pulse rounded-[14px] bg-white/70" />
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SHELLS.map((shell) => (
          <div key={shell.kind} className={`${glassCard} min-h-[118px] px-5 py-5`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">{shell.title}</h2>
              <div className="h-6 w-[88px] animate-pulse rounded-full bg-slate-200/80" />
            </div>
            <div className="mt-3 h-4 w-[72%] animate-pulse rounded-md bg-slate-200/80" />
          </div>
        ))}
      </section>
    </div>
  );
}
