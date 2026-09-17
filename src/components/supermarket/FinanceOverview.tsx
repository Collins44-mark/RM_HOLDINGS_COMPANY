"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Banknote,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileBarChart2,
  Info,
  Phone,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  getSupermarketFinanceSummary,
  totalCashOnHand,
  type FinanceSummary,
} from "@/lib/data/sample-supermarket-finance";
import {
  type SalesDateRange,
  type SalesPeriodPreset,
} from "@/lib/data/sample-supermarket-sales";
import { filterClass } from "@/components/supermarket/purchasing-ui";

const PERIOD_OPTIONS: { id: Exclude<SalesPeriodPreset, "range">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

const PRODUCT_PROFIT_HINT =
  "Product Profit is calculated from the difference between each product's selling price and buying price multiplied by the quantity sold.";

const glass =
  "rounded-[28px] border border-white/55 bg-white/58 shadow-[0_18px_50px_rgba(15,35,64,0.07),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl";

const actionButton =
  "inline-flex h-9 items-center justify-center gap-1 rounded-full bg-[#0b2244] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 hover:bg-[#102a52]";

type KpiTone = "revenue" | "profit" | "expenses" | "net";

const KPI_TONES: Record<KpiTone, { card: string; iconWrap: string; deltaUp: string; deltaDown: string }> = {
  revenue: {
    card: "border-emerald-200/35 bg-emerald-50/45",
    iconWrap: "border-emerald-200/50 bg-white/70 text-emerald-600",
    deltaUp: "text-emerald-600",
    deltaDown: "text-[#c45b66]",
  },
  profit: {
    card: "border-sky-200/35 bg-sky-50/45",
    iconWrap: "border-sky-200/50 bg-white/70 text-sky-600",
    deltaUp: "text-emerald-600",
    deltaDown: "text-[#c45b66]",
  },
  expenses: {
    card: "border-rose-200/35 bg-rose-50/45",
    iconWrap: "border-rose-200/50 bg-white/70 text-rose-500",
    deltaUp: "text-[#c45b66]",
    deltaDown: "text-emerald-600",
  },
  net: {
    card: "border-violet-200/35 bg-violet-50/45",
    iconWrap: "border-violet-200/50 bg-white/70 text-violet-600",
    deltaUp: "text-emerald-600",
    deltaDown: "text-[#c45b66]",
  },
};

export function FinanceOverview() {
  const [preset, setPreset] = useState<SalesPeriodPreset>("today");
  const [customRange, setCustomRange] = useState<SalesDateRange>({ from: "2026-09-01", to: "2026-09-16" });

  const summary = useMemo(
    () => getSupermarketFinanceSummary(preset, customRange),
    [preset, customRange],
  );

  return (
    <div className="min-w-0 space-y-5 pb-10 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[28px]">Finance</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">Your supermarket&apos;s financial overview</p>
        </div>
        <FinancePeriodControl
          preset={preset}
          label={summary.periodLabel}
          range={customRange}
          onPreset={setPreset}
          onRange={setCustomRange}
        />
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        <KpiCard
          tone="revenue"
          title="Revenue"
          description="Total sales (all payment methods)"
          amount={summary.revenue}
          delta={summary.deltas.revenue}
          icon={<TrendingUp className="h-[18px] w-[18px]" strokeWidth={1.9} />}
        />
        <KpiCard
          tone="profit"
          title="Product Profit"
          description="Profit from products sold"
          amount={summary.productProfit}
          delta={summary.deltas.productProfit}
          icon={<CircleDollarSign className="h-[18px] w-[18px]" strokeWidth={1.9} />}
          showProfitHint
        />
        <KpiCard
          tone="expenses"
          title="Expenses"
          description="Total operating expenses"
          amount={summary.expenses}
          delta={summary.deltas.expenses}
          icon={<Wallet className="h-[18px] w-[18px]" strokeWidth={1.9} />}
          invertDelta
        />
        <KpiCard
          tone="net"
          title="Net Profit"
          description="Profit after expenses"
          amount={summary.netProfit}
          delta={summary.deltas.netProfit}
          icon={<Clock3 className="h-[18px] w-[18px]" strokeWidth={1.9} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashBalanceCard summary={summary} />
        <SupplierOutstandingCard summary={summary} />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionCard
          title="Expenses"
          description="Manage supermarket operating expenses"
          href="/supermarket/expenses"
          cta="View Expenses →"
          icon={<Wallet className="h-4 w-4" strokeWidth={1.9} />}
          tone="border-rose-200/30 bg-rose-50/30"
          iconTone="border-rose-200/45 bg-white/70 text-rose-500"
        />
        <ActionCard
          title="Payments"
          description="Track money received and money paid"
          href="/supermarket/payments"
          cta="View Payments →"
          icon={<Banknote className="h-4 w-4" strokeWidth={1.9} />}
          tone="border-sky-200/30 bg-sky-50/30"
          iconTone="border-sky-200/45 bg-white/70 text-sky-600"
        />
        <ActionCard
          title="Reports"
          description="View detailed financial reports"
          href="/supermarket/reports"
          cta="Open Reports →"
          icon={<FileBarChart2 className="h-4 w-4" strokeWidth={1.9} />}
          tone="border-violet-200/30 bg-violet-50/30"
          iconTone="border-violet-200/45 bg-white/70 text-violet-600"
        />
      </section>
    </div>
  );
}

function KpiCard({
  tone,
  title,
  description,
  amount,
  delta,
  icon,
  invertDelta = false,
  showProfitHint = false,
}: {
  tone: KpiTone;
  title: string;
  description: string;
  amount: number;
  delta: number;
  icon: ReactNode;
  invertDelta?: boolean;
  showProfitHint?: boolean;
}) {
  const accent = KPI_TONES[tone];
  const positive = invertDelta ? delta < 0 : delta >= 0;
  const arrow = delta >= 0 ? "↑" : "↓";
  const [hintOpen, setHintOpen] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showProfitHint) return;
    function onPointerDown(event: PointerEvent) {
      if (!hintRef.current?.contains(event.target as Node)) setHintOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showProfitHint]);

  return (
    <article
      className={cn(
        glass,
        "relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5",
        accent.card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5">
            <p className="text-[14px] font-semibold tracking-[-0.02em] text-navy">{title}</p>
            {showProfitHint ? (
              <div ref={hintRef} className="relative">
                <button
                  type="button"
                  aria-label="About Product Profit"
                  aria-expanded={hintOpen}
                  onClick={() => setHintOpen((open) => !open)}
                  onMouseEnter={() => setHintOpen(true)}
                  onMouseLeave={() => setHintOpen(false)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-navy"
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                {hintOpen ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[min(18rem,calc(100vw-3rem))] rounded-[14px] border border-white/80 bg-white/95 px-3.5 py-3 text-[12.5px] leading-5 text-slate-600 shadow-[0_14px_36px_rgba(15,35,64,0.12)] backdrop-blur-xl">
                    {PRODUCT_PROFIT_HINT}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{description}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md",
            accent.iconWrap,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-5 text-[22px] font-semibold tracking-[-0.04em] text-navy sm:text-[24px]">
        {formatTzs(amount)}
      </p>
      <p className={cn("mt-2 text-[12px] font-medium", positive ? accent.deltaUp : accent.deltaDown)}>
        {arrow} {delta >= 0 ? "+" : ""}
        {delta}% vs yesterday
      </p>
    </article>
  );
}

function CashBalanceCard({ summary }: { summary: FinanceSummary }) {
  const rows = [
    {
      label: "Cash",
      amount: summary.cashBalance.cash,
      icon: <Banknote className="h-4 w-4" strokeWidth={1.9} />,
      tone: "border-emerald-200/45 bg-white/70 text-emerald-600",
    },
    {
      label: "Mobile Money",
      amount: summary.cashBalance.mobileMoney,
      icon: <Phone className="h-4 w-4" strokeWidth={1.9} />,
      tone: "border-sky-200/45 bg-white/70 text-sky-600",
    },
    {
      label: "Card",
      amount: summary.cashBalance.card,
      icon: <CreditCard className="h-4 w-4" strokeWidth={1.9} />,
      tone: "border-violet-200/45 bg-white/70 text-violet-600",
    },
    {
      label: "Bank",
      amount: summary.cashBalance.bank,
      icon: <Building2 className="h-4 w-4" strokeWidth={1.9} />,
      tone: "border-amber-200/45 bg-white/70 text-amber-600",
    },
  ] as const;

  return (
    <section className={cn(glass, "flex flex-col px-5 py-6 sm:px-6 sm:py-7")}>
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Cash Balance</h2>
        <p className="mt-1 text-[13px] text-slate-500">Money available in each payment method</p>
      </div>
      <div className="mt-5 flex flex-1 flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-white/50 py-3.5"
          >
            <div className="inline-flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md",
                  row.tone,
                )}
              >
                {row.icon}
              </span>
              <span className="text-[13.5px] text-slate-600">{row.label}</span>
            </div>
            <span className="text-[13.5px] font-semibold tabular-nums text-navy">{formatTzs(row.amount)}</span>
          </div>
        ))}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between gap-3 rounded-[18px] border border-sky-200/40 bg-sky-50/55 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
            <span className="text-[14px] font-semibold text-navy">Total Cash Available</span>
            <span className="text-[18px] font-semibold tracking-[-0.03em] tabular-nums text-navy">
              {formatTzs(totalCashOnHand(summary.cashBalance))}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SupplierOutstandingCard({ summary }: { summary: FinanceSummary }) {
  const items = [
    {
      label: "Total Purchases",
      amount: summary.supplierOutstanding.totalPurchases,
      icon: <ShoppingCart className="h-4 w-4" strokeWidth={1.9} />,
      card: "border-sky-200/40 bg-sky-50/50",
      iconWrap: "border-sky-200/45 bg-white/70 text-sky-600",
      amountClass: "text-navy",
    },
    {
      label: "Total Paid",
      amount: summary.supplierOutstanding.totalPaid,
      icon: <Check className="h-4 w-4" strokeWidth={2.2} />,
      card: "border-emerald-200/40 bg-emerald-50/50",
      iconWrap: "border-emerald-200/45 bg-white/70 text-emerald-600",
      amountClass: "text-navy",
    },
    {
      label: "Outstanding",
      amount: summary.supplierOutstanding.outstanding,
      icon: <Clock3 className="h-4 w-4" strokeWidth={1.9} />,
      card: "border-rose-200/45 bg-rose-50/55",
      iconWrap: "border-rose-200/50 bg-white/70 text-rose-500",
      amountClass: "text-[#c45b66]",
    },
  ] as const;

  return (
    <section className={cn(glass, "px-5 py-6 sm:px-6 sm:py-7")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Supplier Outstanding</h2>
          <p className="mt-1 text-[13px] text-slate-500">Amount still to be paid to suppliers</p>
        </div>
        <Link
          href="/supermarket/purchasing"
          className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-[#3d6db5] transition hover:text-navy"
        >
          View Details →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-[18px] border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md",
              item.card,
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)]",
                    item.iconWrap,
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-[13px] font-medium text-slate-600">{item.label}</span>
              </div>
              <p className={cn("text-[16px] font-semibold tracking-[-0.03em] tabular-nums", item.amountClass)}>
                {formatTzs(item.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionCard({
  title,
  description,
  href,
  cta,
  icon,
  tone,
  iconTone,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: ReactNode;
  tone: string;
  iconTone: string;
}) {
  return (
    <article className={cn(glass, "flex flex-col px-4 py-4 sm:px-5 sm:py-5", tone)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-[0_6px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md",
            iconTone,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold tracking-[-0.02em] text-navy">{title}</h3>
          <p className="mt-1 text-[12.5px] leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4">
        <Link href={href} className={actionButton}>
          {cta}
        </Link>
      </div>
    </article>
  );
}

function FinancePeriodControl({
  preset,
  label,
  range,
  onPreset,
  onRange,
}: {
  preset: SalesPeriodPreset;
  label: string;
  range: SalesDateRange;
  onPreset: (preset: SalesPeriodPreset) => void;
  onRange: (range: SalesDateRange) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 240 });
  const [draft, setDraft] = useState<SalesDateRange>(range);

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(240, rect.width);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setMenuCoords({
      top: rect.bottom + 6,
      left: Math.max(8, left),
      width,
    });
  }

  useEffect(() => {
    if (!menuOpen && !rangeOpen) return;
    placeMenu();
    function onReposition() {
      placeMenu();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [menuOpen, rangeOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setRangeOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openMenu() {
    placeMenu();
    setRangeOpen(false);
    setMenuOpen((open) => !open);
  }

  function selectPreset(next: Exclude<SalesPeriodPreset, "range">) {
    onPreset(next);
    setMenuOpen(false);
    setRangeOpen(false);
  }

  function openRange() {
    setDraft(range);
    setMenuOpen(false);
    placeMenu();
    setRangeOpen(true);
  }

  function applyRange() {
    if (!draft.from || !draft.to) return;
    const from = draft.from <= draft.to ? draft.from : draft.to;
    const to = draft.from <= draft.to ? draft.to : draft.from;
    onRange({ from, to });
    onPreset("range");
    setRangeOpen(false);
  }

  const panelOpen = menuOpen || rangeOpen;

  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[11.5rem]">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        onClick={openMenu}
        className={cn(filterClass, "inline-flex w-full items-center justify-between gap-2 pr-3 text-left sm:w-auto")}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.9} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition duration-200", panelOpen && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {mounted && panelOpen
        ? createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="fixed inset-0 z-[79] cursor-default bg-transparent"
                onClick={() => {
                  setMenuOpen(false);
                  setRangeOpen(false);
                }}
              />
              {menuOpen ? (
                <div
                  className="fixed z-[80] origin-top-left overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                  style={{ top: menuCoords.top, left: menuCoords.left, width: menuCoords.width }}
                  role="listbox"
                  aria-label="Finance period"
                >
                  {PERIOD_OPTIONS.map((option) => {
                    const selected = preset === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectPreset(option.id)}
                        className={cn(
                          "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition hover:bg-navy/[0.04]",
                          selected && "bg-navy/[0.05] font-medium",
                        )}
                      >
                        {option.label}
                        {selected ? <Check className="h-3.5 w-3.5 text-navy" strokeWidth={2.4} /> : <span className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  <div className="mx-3 my-1 h-px bg-[#d5dee8]/80" />
                  <button
                    type="button"
                    onClick={openRange}
                    className={cn(
                      "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition hover:bg-navy/[0.04]",
                      preset === "range" && "bg-navy/[0.05] font-medium",
                    )}
                  >
                    <span>Custom Range</span>
                    {preset === "range" ? <Check className="h-3.5 w-3.5 text-navy" strokeWidth={2.4} /> : null}
                  </button>
                </div>
              ) : null}
              {rangeOpen ? (
                <div
                  className="fixed z-[80] w-[min(22rem,calc(100vw-16px))] overflow-hidden rounded-[20px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_50px_rgba(16,24,40,0.16)] backdrop-blur-xl"
                  style={{ top: menuCoords.top, left: menuCoords.left }}
                >
                  <p className="text-[13px] font-semibold tracking-[-0.02em] text-navy">Custom Range</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">From</span>
                      <input
                        type="date"
                        value={draft.from}
                        onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                        className={cn(filterClass, "rounded-[14px] px-3")}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">To</span>
                      <input
                        type="date"
                        value={draft.to}
                        onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                        className={cn(filterClass, "rounded-[14px] px-3")}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRangeOpen(false)}
                      className="h-9 rounded-full px-3.5 text-[13px] font-medium text-slate-500 transition hover:bg-navy/[0.04] hover:text-navy"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyRange}
                      className="inline-flex h-9 items-center rounded-full bg-[#0b2244] px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
