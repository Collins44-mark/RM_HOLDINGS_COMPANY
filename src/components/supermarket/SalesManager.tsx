"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange,
  Check,
  ChevronDown,
  Coins,
  Download,
  FileText,
  MoreHorizontal,
  Package,
  Printer,
  Search,
  Store,
  TrendingUp,
  UserRound,
  Wallet,
  X,
  ArrowLeft,
} from "lucide-react";
import { ComparisonIndicator } from "@/components/finance/ComparisonIndicator";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { downloadSalesReportPdf } from "@/lib/data/supermarket-sales-report";
import {
  SALES_CASHIERS,
  filterSales,
  formatSalesDate,
  resolveSalesPeriod,
  saleTotal,
  salesKpis,
  type SalesDateRange,
  type SalesPayment,
  type SalesPeriodPreset,
  type SalesStatus,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";
import { refreshSales, useSupermarketSales } from "@/lib/supermarket/client-stores";
import type { SupermarketSale as DbSale } from "@/lib/supermarket/types";

function mapDbSale(sale: DbSale): SupermarketSale {
  const soldAt = sale.date;
  const payment: SalesPayment =
    sale.payment === "Bank" || sale.payment === "Mixed" ? "Cash" : sale.payment;
  const status: SalesStatus =
    sale.status === "Refunded" || sale.status === "Partial Refund" ? "Refunded" : "Completed";
  return {
    id: sale.id,
    soldAt,
    dateLabel: formatSalesDate(soldAt),
    timeLabel: soldAt.includes("T") ? soldAt.slice(11, 16) : "—",
    customer: sale.customer,
    cashier: sale.cashier,
    store: "Main Store",
    payment,
    itemsCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
    amount: sale.total,
    status,
    lines: sale.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discount: sale.discount,
  };
}

const PAGE_SIZES = [10, 20, 50] as const;
const glass =
  "rounded-[24px] border border-white/65 bg-white/76 shadow-[0_10px_28px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl";
const filterClass =
  "h-10 w-full min-w-0 rounded-full border border-white/75 bg-white/88 px-3.5 text-[13px] text-navy shadow-[0_6px_18px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-xl transition duration-200 focus:border-white focus:bg-white";
const tableHead =
  "bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400";

type KpiTone = "blue" | "violet" | "green" | "amber";

const KPI_TONES: Record<KpiTone, { card: string; orb: string; tint: string; icon: string; bar: string }> = {
  blue: {
    card: "border-sky-200/35 bg-[#eef5ff]/78",
    orb: "border-sky-200/40 bg-white/46 shadow-[0_8px_16px_rgba(70,130,200,0.10)]",
    tint: "bg-sky-400/[0.12]",
    icon: "text-sky-600",
    bar: "bg-sky-400/65",
  },
  violet: {
    card: "border-violet-200/40 bg-[#f4f1ff]/82",
    orb: "border-violet-200/45 bg-white/46 shadow-[0_8px_16px_rgba(120,90,190,0.10)]",
    tint: "bg-violet-400/[0.12]",
    icon: "text-violet-600",
    bar: "bg-violet-400/65",
  },
  green: {
    card: "border-emerald-200/35 bg-[#eefaf2]/78",
    orb: "border-emerald-200/40 bg-white/46 shadow-[0_8px_16px_rgba(50,140,90,0.10)]",
    tint: "bg-emerald-400/[0.12]",
    icon: "text-emerald-600",
    bar: "bg-emerald-400/65",
  },
  amber: {
    card: "border-amber-200/40 bg-[#fff8eb]/82",
    orb: "border-amber-200/50 bg-white/46 shadow-[0_8px_16px_rgba(190,130,50,0.10)]",
    tint: "bg-amber-400/[0.13]",
    icon: "text-amber-600",
    bar: "bg-amber-400/70",
  },
};

const PERIOD_OPTIONS: { id: Exclude<SalesPeriodPreset, "range">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

function PeriodControl({
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
    <div className="relative min-w-0 lg:w-auto lg:min-w-[12.5rem]">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        onClick={openMenu}
        className={cn(filterClass, "inline-flex items-center justify-between gap-2 pr-3 text-left")}
      >
        <span className="truncate">{label}</span>
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
                aria-hidden={!panelOpen}
                className={cn(
                  "fixed inset-0 z-[79] cursor-default bg-transparent transition duration-200",
                  panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
                )}
                onClick={() => {
                  setMenuOpen(false);
                  setRangeOpen(false);
                }}
              />
              {menuOpen ? (
              <div
                className="fixed z-[80] origin-top-left overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl transition duration-200 ease-out"
                style={{ top: menuCoords.top, left: menuCoords.left, width: menuCoords.width }}
                role="listbox"
                aria-label="Sales period"
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
                        "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition duration-200 hover:bg-navy/[0.04]",
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
                    "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy transition duration-200 hover:bg-navy/[0.04]",
                    preset === "range" && "bg-navy/[0.05] font-medium",
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarRange className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.9} />
                    Date Range...
                  </span>
                    {preset === "range" ? <Check className="h-3.5 w-3.5 text-navy" strokeWidth={2.4} /> : null}
                  </button>
                </div>
              ) : null}
              {rangeOpen ? (
              <div
                className="fixed z-[80] w-[min(22rem,calc(100vw-16px))] origin-top-left overflow-hidden rounded-[20px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_50px_rgba(16,24,40,0.16)] backdrop-blur-xl transition duration-200 ease-out"
                style={{ top: menuCoords.top, left: menuCoords.left }}
              >
                <p className="text-[13px] font-semibold tracking-[-0.02em] text-navy">Date Range</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-slate-500">From</span>
                    <input
                      type="date"
                      value={draft.from}
                      onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                      className={cn(filterClass, "rounded-[14px] px-3")}
                    />
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {draft.from ? formatSalesDate(draft.from) : "Choose a start date"}
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-slate-500">To</span>
                    <input
                      type="date"
                      value={draft.to}
                      onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                      className={cn(filterClass, "rounded-[14px] px-3")}
                    />
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {draft.to ? formatSalesDate(draft.to) : "Choose an end date"}
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRangeOpen(false)}
                    className="h-9 rounded-full px-3.5 text-[13px] font-medium text-slate-500 transition duration-200 hover:bg-navy/[0.04] hover:text-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyRange}
                    className="h-9 rounded-full bg-[#0b2244] px-4 text-[13px] font-semibold text-white transition duration-200 hover:bg-[#102a52]"
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

export function SalesManager() {
  const [periodPreset, setPeriodPreset] = useState<SalesPeriodPreset>("week");
  const [customRange, setCustomRange] = useState<SalesDateRange>({ from: "2026-09-01", to: "2026-09-14" });
  const [cashier, setCashier] = useState("all");
  const [payment, setPayment] = useState<"all" | SalesPayment>("all");
  const [status, setStatus] = useState<"all" | SalesStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [fullDetails, setFullDetails] = useState(false);
  const [exporting, setExporting] = useState(false);

  const period = useMemo(() => {
    const asOf = new Date().toISOString().slice(0, 10);
    return resolveSalesPeriod(periodPreset, customRange, asOf);
  }, [periodPreset, customRange]);

  const salesState = useSupermarketSales({ from: period.start, to: period.end });

  useEffect(() => {
    void refreshSales({ from: period.start, to: period.end });
  }, [period.start, period.end]);

  const liveSales = useMemo(
    () => salesState.sales.map(mapDbSale),
    [salesState.sales],
  );

  const filtered = useMemo(
    () =>
      filterSales(liveSales, {
        start: period.start,
        end: period.end,
        cashier,
        payment,
        status,
        query,
      }),
    [liveSales, period.start, period.end, cashier, payment, status, query],
  );
  const kpis = useMemo(() => salesKpis(filtered), [filtered]);

  useEffect(() => {
    setPage(1);
  }, [period.start, period.end, cashier, payment, status, query, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, filtered.length);
  const selected = selectedId ? filtered.find((sale) => sale.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !filtered.some((sale) => sale.id === selectedId)) {
      setSelectedId(null);
      setDetailsOpen(false);
      setFullDetails(false);
    }
  }, [filtered, selectedId]);

  function openSale(id: string) {
    setSelectedId(id);
    setDetailsOpen(true);
    setMenuId(null);
  }

  function closeSale() {
    setDetailsOpen(false);
    setSelectedId(null);
    setFullDetails(false);
  }

  function exportReport() {
    if (exporting) return;
    setExporting(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          downloadSalesReportPdf({
            sales: filtered,
            periodLabel: periodPreset === "range" ? "Date Range" : period.label,
            periodDates:
              period.start === period.end
                ? formatSalesDate(period.start)
                : `${formatSalesDate(period.start)} - ${formatSalesDate(period.end)}`,
            cashierLabel: cashier === "all" ? "All Cashiers" : cashier,
            paymentLabel: payment === "all" ? "All Payment Methods" : payment,
            statusLabel: status === "all" ? "All Status" : status,
          });
        } finally {
          setExporting(false);
        }
      });
    });
  }

  function printSale(sale: SupermarketSale) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
    if (!popup) return;
    popup.document.write(receiptMarkup(sale));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Sales</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
          View and manage all supermarket sales transactions.
        </p>
      </div>

      <section className="rm-kpi-grid">
        <KpiCard
          label="Total Sales"
          value={formatTzs(kpis.totalSales)}
          delta={0}
          icon={Coins}
          tone="blue"
        />
        <KpiCard
          label="Total Transactions"
          value={kpis.totalTransactions.toLocaleString("en-US")}
          delta={0}
          icon={FileText}
          tone="violet"
        />
        <KpiCard
          label="Items Sold"
          value={kpis.itemsSold.toLocaleString("en-US")}
          delta={0}
          icon={Package}
          tone="green"
        />
        <KpiCard
          label="Average Sale"
          value={formatTzs(kpis.averageSale)}
          delta={0}
          icon={TrendingUp}
          tone="amber"
        />
      </section>

      <section className="rm-filter-bar">
        <PeriodControl
          preset={periodPreset}
          label={period.label}
          range={customRange}
          onPreset={setPeriodPreset}
          onRange={setCustomRange}
        />
        <select
          value={cashier}
          onChange={(event) => setCashier(event.target.value)}
          className={cn(filterClass, "lg:w-auto lg:basis-[10.5rem]")}
        >
          {SALES_CASHIERS.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "All Cashiers" : item}
            </option>
          ))}
        </select>
        <select
          value={payment}
          onChange={(event) => setPayment(event.target.value as "all" | SalesPayment)}
          className={cn(filterClass, "lg:w-auto lg:basis-[13.5rem]")}
        >
          <option value="all">All Payment Methods</option>
          <option value="Cash">Cash</option>
          <option value="Mobile Money">Mobile Money</option>
          <option value="Card">Card</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | SalesStatus)}
          className={cn(filterClass, "lg:w-auto lg:basis-[10rem]")}
        >
          <option value="all">All Status</option>
          <option value="Completed">Completed</option>
          <option value="Refunded">Refunded</option>
        </select>
        <label className="relative block min-w-0 flex-1 lg:basis-[min(100%,16rem)]">
          <span className="sr-only">Search sales</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search invoices, customers, products..."
            className={cn(filterClass, "pl-10")}
          />
        </label>
        <button
          type="button"
          onClick={exportReport}
          disabled={exporting}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)] transition duration-200 hover:bg-[#102a52] disabled:opacity-70"
        >
          <Download className="h-4 w-4" strokeWidth={2.1} />
          {exporting ? "Preparing PDF..." : "Export"}
        </button>
      </section>

      <section
        className={cn(
          "grid min-w-0 grid-cols-1 items-stretch gap-2.5 sm:gap-3",
          detailsOpen && selected ? "2xl:grid-cols-[minmax(0,1fr)_minmax(380px,420px)]" : "2xl:grid-cols-1",
        )}
      >
        <article className={cn(glass, "flex min-h-[min(560px,68vh)] min-w-0 flex-col overflow-hidden")}>
          <div className="px-4 pb-2 pt-4 sm:px-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">
              Sales Transactions ({filtered.length.toLocaleString("en-US")})
            </h2>
            <p className="mt-1 text-[12.5px] text-slate-400">Complete list of all sales made at the supermarket.</p>
          </div>

          {pageRows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">No sales found</p>
                <p className="mt-2 text-sm text-slate-500">No transactions match the current filters.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden min-w-0 flex-1 overflow-x-auto 2xl:block">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr className="border-b border-[#d5dee8]/70">
                      <th className="px-4 py-3 font-medium">Invoice #</th>
                      <th className="px-3 py-3 font-medium">Date & Time</th>
                      <th className="px-3 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 font-medium">Items</th>
                      <th className="px-3 py-3 font-medium">Payment Method</th>
                      <th className="px-3 py-3 font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((sale) => (
                      <tr
                        key={sale.id}
                        className={cn(
                          "border-t border-[#d5dee8]/55 transition duration-200",
                          selected?.id === sale.id && "bg-white/55",
                        )}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openSale(sale.id)}
                            className="font-semibold text-[#2f6fdb] transition duration-200 hover:text-[#1f5cc4]"
                          >
                            #{sale.id}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12.5px] leading-5 text-slate-500">
                          <span className="block">{sale.dateLabel}</span>
                          <span>{sale.timeLabel}</span>
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-3 text-slate-600">{sale.customer}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                          {sale.itemsCount} item{sale.itemsCount === 1 ? "" : "s"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">{sale.payment}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-[13.5px] font-semibold tracking-[-0.02em] text-navy">
                          {formatTzs(sale.amount)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill value={sale.status} />
                        </td>
                        <td className="px-4 py-3">
                          <RowActions
                            sale={sale}
                            open={menuId === sale.id}
                            onToggle={() => setMenuId((current) => (current === sale.id ? null : sale.id))}
                            onClose={() => setMenuId(null)}
                            onView={() => openSale(sale.id)}
                            onPrint={() => printSale(sale)}
                            onFull={() => {
                              openSale(sale.id);
                              setFullDetails(true);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="hidden min-w-0 flex-1 overflow-x-auto md:block 2xl:hidden">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr className="border-b border-[#d5dee8]/70">
                      <th className="px-4 py-3 font-medium">Invoice #</th>
                      <th className="px-3 py-3 font-medium">Date & Time</th>
                      <th className="px-3 py-3 font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((sale) => (
                      <tr key={sale.id} className="border-t border-[#d5dee8]/55">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openSale(sale.id)}
                            className="font-semibold text-[#2f6fdb]"
                          >
                            #{sale.id}
                          </button>
                          <p className="mt-0.5 text-[12px] text-slate-400">{sale.customer}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-slate-500">
                          {sale.dateLabel}
                          <span className="block">{sale.timeLabel}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold text-navy">{formatTzs(sale.amount)}</td>
                        <td className="px-3 py-3">
                          <StatusPill value={sale.status} />
                        </td>
                        <td className="px-4 py-3">
                          <RowActions
                            sale={sale}
                            open={menuId === sale.id}
                            onToggle={() => setMenuId((current) => (current === sale.id ? null : sale.id))}
                            onClose={() => setMenuId(null)}
                            onView={() => openSale(sale.id)}
                            onPrint={() => printSale(sale)}
                            onFull={() => {
                              openSale(sale.id);
                              setFullDetails(true);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex-1 space-y-2 px-3 pb-1 md:hidden">
                {pageRows.map((sale) => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => openSale(sale.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-[16px] border border-white/70 bg-white/60 px-3 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2f6fdb]">#{sale.id}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{sale.customer}</p>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {sale.dateLabel} · {sale.timeLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-navy">{formatTzs(sale.amount)}</p>
                      <div className="mt-1 flex justify-end">
                        <StatusPill value={sale.status} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <Pagination
                from={from}
                to={to}
                total={filtered.length}
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={(size) => setPageSize(size)}
              />
            </>
          )}
        </article>

        {detailsOpen && selected ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[55] bg-navy/20 backdrop-blur-sm 2xl:hidden"
              aria-label="Close sale details"
              onClick={closeSale}
            />
            <aside
              className={cn(
                glass,
                "flex max-h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden",
                "max-2xl:fixed max-2xl:inset-x-3 max-2xl:bottom-3 max-2xl:top-[4.75rem] max-2xl:z-[60] max-2xl:mx-auto max-2xl:w-auto max-2xl:max-w-[min(48rem,calc(100vw-1.5rem))]",
                "sm:max-2xl:inset-x-4 md:max-2xl:inset-x-6",
                "2xl:relative 2xl:min-h-[min(560px,68vh)] 2xl:max-w-none",
              )}
            >
              <SaleDetails
                sale={selected}
                onClose={closeSale}
                onPrint={() => printSale(selected)}
                onFull={() => setFullDetails(true)}
              />
            </aside>
          </>
        ) : null}
      </section>

      {fullDetails && selected ? (
        <FullDetailsOverlay
          sale={selected}
          onClose={() => setFullDetails(false)}
          onPrint={() => printSale(selected)}
        />
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  delta: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: KpiTone;
}) {
  const accent = KPI_TONES[tone];
  return (
    <article
      className={cn(
        "flex min-h-[96px] min-w-0 items-center gap-3 rounded-[22px] border px-3.5 py-3.5 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl sm:min-h-[112px] sm:gap-3.5 sm:px-4 sm:py-4",
        accent.card,
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-md sm:h-12 sm:w-12",
          accent.orb,
        )}
      >
        <span className={cn("pointer-events-none absolute inset-[1px] rounded-full", accent.tint)} aria-hidden />
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.16)_38%,rgba(255,255,255,0)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_1px_rgba(15,35,64,0.04)]"
          aria-hidden
        />
        <Icon className={cn("relative h-5 w-5", accent.icon)} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-slate-500">{label}</p>
        <p className="rm-kpi-value mt-1 text-[17px] font-semibold tracking-[-0.04em] text-navy sm:text-[19px] 2xl:text-[21px]">
          {value}
        </p>
        <ComparisonIndicator value={delta} label="vs previous period" unsigned plainArrow />
      </div>
      <div className="ml-1 hidden h-9 items-end gap-[3px] 2xl:flex" aria-hidden>
        {[38, 58, 46, 72, 92].map((height, index) => (
          <span
            key={index}
            className={cn("w-[3.5px] rounded-full", accent.bar, index < 4 && "opacity-55")}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </article>
  );
}

function StatusPill({ value }: { value: SalesStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-[3px] text-[12px] font-medium",
        value === "Completed"
          ? "bg-emerald-50/80 text-emerald-700"
          : "bg-rose-50/80 text-rose-600",
      )}
    >
      {value}
    </span>
  );
}

function SaleDetails({
  sale,
  onClose,
  onPrint,
  onFull,
}: {
  sale: SupermarketSale;
  onClose: () => void;
  onPrint: () => void;
  onFull?: () => void;
}) {
  const subtotal = sale.lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 transition hover:text-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back to Sales
          </button>
          <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">Sale Details</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition duration-200 hover:bg-white hover:text-navy"
          aria-label="Back to Sales"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[18px] font-semibold tracking-[-0.04em] text-navy">#{sale.id}</p>
            <StatusPill value={sale.status} />
          </div>
          <p className="text-[12px] text-slate-400">
            {sale.dateLabel} {sale.timeLabel}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <DetailRow icon={UserRound} label="Customer" value={sale.customer} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow icon={UserRound} label="Cashier" value={sale.cashier} />
            <DetailRow icon={Store} label="Store" value={sale.store} />
          </div>
          <DetailRow icon={Wallet} label="Payment Method" value={sale.payment} />
        </div>

        <div className="mt-5">
          <p className="text-[13px] font-semibold text-navy">Items ({sale.itemsCount})</p>
          <div className="mt-2 hidden grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 gap-y-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-slate-400 md:grid">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
          </div>
          <div className="mt-2 space-y-2.5 md:mt-1.5 md:space-y-0">
            {sale.lines.map((item, index) => (
              <div
                key={`${sale.id}-${item.name}-${index}`}
                className="flex flex-col gap-1 rounded-[12px] border border-white/70 bg-white/45 px-3 py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-baseline md:gap-x-4 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-2"
              >
                <p className="min-w-0 truncate text-[13px] font-medium text-navy">{item.name}</p>
                <p className="text-[12.5px] text-slate-400 md:hidden">
                  {item.quantity} × {formatTzs(item.unitPrice)}
                </p>
                <p className="hidden whitespace-nowrap text-right text-[13px] text-slate-500 md:block">
                  {item.quantity}
                </p>
                <p className="hidden whitespace-nowrap text-right text-[13px] text-slate-500 md:block">
                  {formatTzs(item.unitPrice)}
                </p>
                <p className="whitespace-nowrap text-[13px] font-semibold text-navy md:text-right md:font-medium">
                  {formatTzs(item.quantity * item.unitPrice)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[16px] border border-white/80 bg-white/70 px-3.5 py-3">
          <div className="flex items-center justify-between text-[13px] text-slate-500">
            <span>Subtotal</span>
            <span>{formatTzs(subtotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[13px] text-slate-500">
            <span>Discount</span>
            <span>- {formatTzs(sale.discount)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[14px] font-semibold text-navy">
            <span>Total</span>
            <span>{formatTzs(saleTotal(sale))}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#d5dee8]/70 px-4 py-3 sm:flex-row sm:flex-wrap sm:px-5">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 text-[13px] font-semibold text-navy shadow-[0_6px_14px_rgba(15,35,64,0.06)] transition duration-200 hover:bg-white sm:min-w-0 sm:flex-1"
        >
          <Printer className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Print Receipt
        </button>
        {onFull ? (
          <button
            type="button"
            onClick={onFull}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#0b2244] px-3 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)] transition duration-200 hover:bg-[#102a52] sm:min-w-0 sm:flex-1"
          >
            View Full Details
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef3f8] text-slate-500">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-slate-400">{label}</p>
        <p className="truncate text-[13.5px] font-medium text-navy">{value}</p>
      </div>
    </div>
  );
}

function FullDetailsOverlay({
  sale,
  onClose,
  onPrint,
}: {
  sale: SupermarketSale;
  onClose: () => void;
  onPrint: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-navy/20 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div
        className={cn(
          glass,
          "relative max-h-[min(92dvh,92vh)] w-full max-w-[min(48rem,calc(100vw-1.5rem))] overflow-y-auto p-4 sm:rounded-[28px] sm:p-5",
        )}
      >
        <SaleDetails sale={sale} onClose={onClose} onPrint={onPrint} />
      </div>
    </div>
  );
}

function Pagination({
  from,
  to,
  total,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: (typeof PAGE_SIZES)[number]) => void;
}) {
  const pages = visiblePages(page, totalPages);

  return (
    <div className="mt-auto flex flex-col gap-2.5 border-t border-[#d5dee8]/80 bg-white/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12.5px] text-slate-500">
        Showing {from} to {to} of {total.toLocaleString("en-US")} transactions
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-1">
          <PageButton label="‹" disabled={page <= 1} onClick={() => onPage(page - 1)} />
          {pages.map((item, index) =>
            item === "ellipsis" ? (
              <span key={`e-${index}`} className="px-1 text-[12px] text-slate-400">
                ...
              </span>
            ) : (
              <PageButton
                key={item}
                label={String(item)}
                active={item === page}
                onClick={() => onPage(item)}
              />
            ),
          )}
          <PageButton label="›" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
        </div>
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
          className="h-8 rounded-full border border-white/75 bg-white/85 px-2.5 text-[12px] text-navy shadow-[0_6px_14px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-md"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PageButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[12.5px] font-semibold transition duration-200",
        active
          ? "bg-[#0b2244] text-white shadow-[0_4px_10px_rgba(11,34,68,0.16)]"
          : "border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] hover:text-navy disabled:opacity-30",
      )}
    >
      {label}
    </button>
  );
}

function visiblePages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: Array<number | "ellipsis"> = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 5));
  const end = Math.min(totalPages, start + 4);
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < totalPages) {
    if (end < totalPages - 1) items.push("ellipsis");
    items.push(totalPages);
  }
  return items;
}

function RowActions({
  sale,
  open,
  onToggle,
  onClose,
  onView,
  onPrint,
  onFull,
}: {
  sale: SupermarketSale;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onView: () => void;
  onPrint: () => void;
  onFull: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener("resize", placeMenu);
    return () => window.removeEventListener("resize", placeMenu);
  }, [open]);

  const menu = open
    ? createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-[79] cursor-default bg-transparent"
            aria-label="Close actions"
            onPointerDown={(event) => {
              event.preventDefault();
              onClose();
            }}
          />
          <div
            className="fixed z-[80] w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/90 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
            style={{ top: coords.top, right: coords.right }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ActionItem label="View Details" onSelect={onView} />
            <ActionItem label="Print Receipt" onSelect={onPrint} />
            <ActionItem label="View Full Details" onSelect={onFull} />
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) placeMenu();
          onToggle();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 shadow-[0_6px_14px_rgba(15,35,64,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition duration-200 hover:bg-white hover:text-navy"
        aria-label={`Actions for ${sale.id}`}
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}

function ActionItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail === 0) onSelect();
      }}
      className="flex w-full px-3 py-2.5 text-left text-[13px] text-navy hover:bg-navy/[0.04]"
    >
      {label}
    </button>
  );
}

function receiptMarkup(sale: SupermarketSale) {
  const rows = sale.lines
    .map(
      (item) =>
        `<tr><td>${item.name}</td><td>${item.quantity} × ${item.unitPrice.toLocaleString("en-US")}</td><td>${formatTzs(item.quantity * item.unitPrice)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><title>${sale.id}</title>
    <style>body{font-family:ui-sans-serif,system-ui;padding:24px;color:#0b2244} table{width:100%;border-collapse:collapse} td{padding:6px 0;font-size:13px} h1{font-size:20px}</style>
    </head><body>
    <h1>Receipt #${sale.id}</h1>
    <p>${sale.dateLabel} ${sale.timeLabel} · ${sale.status}</p>
    <p>Customer: ${sale.customer}<br>Cashier: ${sale.cashier}<br>Payment: ${sale.payment}</p>
    <table>${rows}</table>
    <p><strong>Total ${formatTzs(saleTotal(sale))}</strong></p>
    </body></html>`;
}
