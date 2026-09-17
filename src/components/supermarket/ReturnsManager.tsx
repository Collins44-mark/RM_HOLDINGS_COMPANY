"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  ChevronDown,
  ClipboardList,
  Coins,
  MoreHorizontal,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  SUPERMARKET_SALES,
  formatSalesDate,
  resolveSalesPeriod,
  type SalesDateRange,
  type SalesPeriodPreset,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";
import {
  RETURN_CASHIERS,
  RETURN_CONDITIONS,
  RETURN_MOBILE_PROVIDERS,
  RETURN_REASONS,
  RETURN_REFUND_METHODS,
  RETURN_STATUSES,
  RETURNS_STARTING_NUMBER,
  SUPERMARKET_RETURNS,
  alreadyRefundedAmount,
  filterReturns,
  formatReturnNumber,
  invoiceReturnLabel,
  mockReturnsAsOfDate,
  movementsFromReturn,
  refundBreakdown,
  remainingSaleLines,
  returnKpis,
  returnLineAmount,
  returnReceiptMarkup,
  searchSalesInvoices,
  stockActionLabel,
  type ReturnCondition,
  type ReturnLine,
  type ReturnMobileProvider,
  type ReturnReason,
  type ReturnRefundMethod,
  type ReturnStatus,
  type ReturnStockMovement,
  type SupermarketReturn,
} from "@/lib/data/sample-supermarket-returns";

const glass =
  "rounded-[24px] border border-white/65 bg-white/76 shadow-[0_10px_28px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl";
const filterClass =
  "h-10 w-full min-w-0 rounded-full border border-white/75 bg-white/88 px-3.5 text-[13px] text-navy shadow-[0_6px_18px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-xl transition duration-200 focus:border-white focus:bg-white";
const tableHead =
  "bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400";
const control =
  "h-10 w-full rounded-[14px] border border-[#d8e1eb]/90 bg-white px-3.5 text-[13px] text-navy outline-none transition duration-200 placeholder:text-slate-400 focus:border-navy/20";

type KpiTone = "blue" | "violet" | "green" | "amber";
type ViewMode = "list" | "wizard" | "success";

const KPI_TONES: Record<KpiTone, { card: string; orb: string; tint: string; icon: string }> = {
  blue: {
    card: "border-sky-200/35 bg-[#eef5ff]/78",
    orb: "border-sky-200/40 bg-white/46 shadow-[0_8px_16px_rgba(70,130,200,0.10)]",
    tint: "bg-sky-400/[0.12]",
    icon: "text-sky-600",
  },
  violet: {
    card: "border-violet-200/40 bg-[#f4f1ff]/82",
    orb: "border-violet-200/45 bg-white/46 shadow-[0_8px_16px_rgba(120,90,190,0.10)]",
    tint: "bg-violet-400/[0.12]",
    icon: "text-violet-600",
  },
  green: {
    card: "border-emerald-200/35 bg-[#eefaf2]/78",
    orb: "border-emerald-200/40 bg-white/46 shadow-[0_8px_16px_rgba(50,140,90,0.10)]",
    tint: "bg-emerald-400/[0.12]",
    icon: "text-emerald-600",
  },
  amber: {
    card: "border-amber-200/40 bg-[#fff8eb]/82",
    orb: "border-amber-200/50 bg-white/46 shadow-[0_8px_16px_rgba(190,130,50,0.10)]",
    tint: "bg-amber-400/[0.13]",
    icon: "text-amber-600",
  },
};

const PERIOD_OPTIONS: { id: Exclude<SalesPeriodPreset, "range">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

type DraftLine = {
  name: string;
  purchased: number;
  remaining: number;
  unitPrice: number;
  quantity: number;
  reason: ReturnReason;
  condition: ReturnCondition;
  notes: string;
};

function emptyDraft(sale: SupermarketSale, returns: SupermarketReturn[]): DraftLine[] {
  return remainingSaleLines(sale, returns).map((line) => ({
    name: line.name,
    purchased: line.quantity,
    remaining: line.remaining,
    unitPrice: line.unitPrice,
    quantity: 0,
    reason: "Customer Changed Mind",
    condition: "Resellable",
    notes: "",
  }));
}

export function ReturnsManager() {
  const [returns, setReturns] = useState(SUPERMARKET_RETURNS);
  const [movements, setMovements] = useState<ReturnStockMovement[]>(() =>
    SUPERMARKET_RETURNS.flatMap(movementsFromReturn),
  );
  const [nextNumber, setNextNumber] = useState(RETURNS_STARTING_NUMBER);
  const [view, setView] = useState<ViewMode>("list");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [periodPreset, setPeriodPreset] = useState<SalesPeriodPreset>("month");
  const [customRange, setCustomRange] = useState<SalesDateRange>({ from: "2026-09-01", to: "2026-09-14" });
  const [cashier, setCashier] = useState("all");
  const [method, setMethod] = useState<"all" | ReturnRefundMethod>("all");
  const [status, setStatus] = useState<"all" | ReturnStatus>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(SUPERMARKET_RETURNS[0]?.id ?? null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [selectedSale, setSelectedSale] = useState<SupermarketSale | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>("Cash");
  const [provider, setProvider] = useState<ReturnMobileProvider>("M-Pesa");
  const [wizardError, setWizardError] = useState("");
  const [completed, setCompleted] = useState<SupermarketReturn | null>(null);

  const period = useMemo(
    () => resolveSalesPeriod(periodPreset, customRange, mockReturnsAsOfDate(returns)),
    [periodPreset, customRange, returns],
  );
  const filtered = useMemo(
    () =>
      filterReturns(returns, {
        start: period.start,
        end: period.end,
        cashier,
        method,
        status,
        query,
      }),
    [returns, period.start, period.end, cashier, method, status, query],
  );
  const kpis = useMemo(() => returnKpis(filtered), [filtered]);
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const selectedSaleRecord = selected ? SUPERMARKET_SALES.find((sale) => sale.id === selected.invoiceId) ?? null : null;
  const invoiceMatches = useMemo(() => searchSalesInvoices(invoiceQuery), [invoiceQuery]);
  const selectedItems = draft.filter((line) => line.quantity > 0);
  const breakdown = selectedSale
    ? refundBreakdown(
        selectedSale,
        selectedItems.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          condition: line.condition,
          reason: line.reason,
          notes: line.notes,
        })),
        alreadyRefundedAmount(selectedSale.id, returns),
      )
    : null;
  const saleLabel = selectedSale ? invoiceReturnLabel(selectedSale, returns) : null;

  function printReturn(row: SupermarketReturn) {
    const sale = SUPERMARKET_SALES.find((item) => item.id === row.invoiceId) ?? null;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
    if (!popup) return;
    popup.document.write(returnReceiptMarkup(row, sale));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function openWizard() {
    setView("wizard");
    setWizardStep(1);
    setInvoiceQuery("");
    setSelectedSale(null);
    setDraft([]);
    setRefundMethod("Cash");
    setProvider("M-Pesa");
    setWizardError("");
    setCompleted(null);
  }

  function chooseSale(sale: SupermarketSale) {
    setSelectedSale(sale);
    setDraft(emptyDraft(sale, returns));
    setInvoiceQuery(sale.id);
    setWizardError("");
    setWizardStep(2);
  }

  function updateDraft(name: string, patch: Partial<DraftLine>) {
    setWizardError("");
    setDraft((current) =>
      current.map((line) => {
        if (line.name !== name) return line;
        const next = { ...line, ...patch };
        next.quantity = Math.min(line.remaining, Math.max(0, next.quantity));
        return next;
      }),
    );
  }

  function validateWizard() {
    if (!selectedSale) return "Search and select the original invoice.";
    if (selectedItems.length === 0) return "Select at least one item to return.";
    for (const line of selectedItems) {
      if (line.quantity > line.remaining) return `${line.name} exceeds the purchased quantity.`;
      if (!line.reason) return "Each returned item needs a reason.";
      if (!line.condition) return "Each returned item needs a condition.";
      if (line.reason === "Other" && !line.notes.trim()) return "Add notes for items marked Other.";
    }
    if (!refundMethod) return "Choose a refund method.";
    if (breakdown && breakdown.refundAmount <= 0) return "Refund amount must be greater than zero.";
    return "";
  }

  function processRefund() {
    const error = validateWizard();
    if (error) {
      setWizardError(error);
      return;
    }
    if (!selectedSale || !breakdown) return;
    const items: ReturnLine[] = selectedItems.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      condition: line.condition,
      reason: line.reason,
      notes: line.notes,
    }));
    const nextReturns = [...returns];
    const statusLabel = invoiceReturnLabel(selectedSale, [
      ...nextReturns,
      {
        id: "preview",
        invoiceId: selectedSale.id,
        returnedAt: new Date().toISOString(),
        dateLabel: "",
        timeLabel: "",
        customer: selectedSale.customer,
        cashier: selectedSale.cashier,
        method: refundMethod,
        status: "Refunded",
        items,
        itemsCount: selectedItems.reduce((sum, line) => sum + line.quantity, 0),
        amount: breakdown.refundAmount,
        originalTotal: selectedSale.amount,
        discountAdjustment: breakdown.discountAdjustment,
      },
    ]);
    const row: SupermarketReturn = {
      id: formatReturnNumber(nextNumber),
      invoiceId: selectedSale.id,
      returnedAt: new Date().toISOString(),
      dateLabel: formatSalesDate(new Date().toISOString()),
      timeLabel: new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date()),
      customer: selectedSale.customer,
      cashier: selectedSale.cashier,
      method: refundMethod,
      provider: refundMethod === "Mobile Money" ? provider : undefined,
      status: statusLabel === "Refunded" ? "Refunded" : "Partially Refunded",
      items,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
      amount: breakdown.refundAmount,
      originalTotal: selectedSale.amount,
      discountAdjustment: breakdown.discountAdjustment,
    };
    setReturns((current) => [row, ...current]);
    setMovements((current) => [...movementsFromReturn(row), ...current]);
    setNextNumber((value) => value + 1);
    setCompleted(row);
    setSelectedId(row.id);
    setView("success");
    setWizardError("");
  }

  if (view === "wizard") {
    return (
      <WizardView
        step={wizardStep}
        invoiceQuery={invoiceQuery}
        matches={invoiceMatches}
        sale={selectedSale}
        saleLabel={saleLabel}
        draft={draft}
        refundMethod={refundMethod}
        provider={provider}
        breakdown={breakdown}
        error={wizardError}
        onQuery={setInvoiceQuery}
        onChooseSale={chooseSale}
        onDraft={updateDraft}
        onMethod={setRefundMethod}
        onProvider={setProvider}
        onBack={() => {
          if (wizardStep === 3) setWizardStep(2);
          else if (wizardStep === 2) setWizardStep(1);
          else {
            setView("list");
            setWizardError("");
          }
        }}
        onCancel={() => {
          setView("list");
          setWizardError("");
        }}
        onContinue={() => {
          const error = validateWizard();
          if (error) {
            setWizardError(error);
            return;
          }
          setWizardError("");
          setWizardStep(3);
        }}
        onProcess={processRefund}
      />
    );
  }

  if (view === "success" && completed) {
    return (
      <SuccessView
        row={completed}
        onPrint={() => printReturn(completed)}
        onView={() => {
          setView("list");
          setSelectedId(completed.id);
          setDetailsOpen(true);
        }}
        onNew={openWizard}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Returns</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
            Manage returned products, refunds and return transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={openWizard}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_rgba(11,34,68,0.18)] transition duration-200 hover:bg-[#102a52]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          New Return
        </button>
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <KpiCard label="Total Returns" value={String(kpis.totalReturns)} icon={RotateCcw} tone="blue" />
        <KpiCard label="Refunded Amount" value={formatTzs(kpis.refundedAmount)} icon={Coins} tone="violet" />
        <KpiCard label="Items Returned" value={String(kpis.itemsReturned)} icon={Package} tone="green" />
        <KpiCard label="Pending Returns" value={String(kpis.pendingReturns)} icon={ClipboardList} tone="amber" />
      </section>

      <section className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <PeriodControl
          preset={periodPreset}
          label={period.label}
          range={customRange}
          onPreset={setPeriodPreset}
          onRange={setCustomRange}
        />
        <select value={cashier} onChange={(event) => setCashier(event.target.value)} className={cn(filterClass, "lg:w-auto lg:min-w-[10.5rem]")}>
          {RETURN_CASHIERS.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "All Cashiers" : item}
            </option>
          ))}
        </select>
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as "all" | ReturnRefundMethod)}
          className={cn(filterClass, "lg:w-auto lg:min-w-[13.5rem]")}
        >
          <option value="all">All Refund Methods</option>
          {RETURN_REFUND_METHODS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | ReturnStatus)}
          className={cn(filterClass, "lg:w-auto lg:min-w-[11.5rem]")}
        >
          <option value="all">All Return Status</option>
          {RETURN_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="relative block min-w-0 flex-1 lg:basis-[min(100%,16rem)]">
          <span className="sr-only">Search returns, invoices, customers</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search returns, invoices, customers..."
            className={cn(filterClass, "pl-10")}
          />
        </label>
      </section>

      <section
        className={cn(
          "grid min-w-0 grid-cols-1 items-stretch gap-2.5 sm:gap-3",
          detailsOpen && selected ? "xl:grid-cols-[minmax(0,1.72fr)_minmax(280px,0.28fr)]" : "xl:grid-cols-1",
        )}
      >
        <article className={cn(glass, "flex min-h-[min(560px,65vh)] min-w-0 flex-col overflow-hidden")}>
          <div className="px-4 pb-2 pt-4 sm:px-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy sm:text-[17px]">
              Return Transactions ({filtered.length.toLocaleString("en-US")})
            </h2>
            <p className="mt-1 text-[12.5px] text-slate-400">Returned products, refunds and related stock actions.</p>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.03em] text-navy">No returns yet</p>
                <p className="mt-2 text-sm text-slate-500">Returned transactions will appear here.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden min-w-0 flex-1 overflow-x-auto xl:block">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead className={tableHead}>
                    <tr className="border-b border-[#d5dee8]/70">
                      <th className="px-4 py-3 font-medium">Return #</th>
                      <th className="px-3 py-3 font-medium">Invoice #</th>
                      <th className="px-3 py-3 font-medium">Date & Time</th>
                      <th className="px-3 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 font-medium">Items</th>
                      <th className="px-3 py-3 font-medium">Refund Method</th>
                      <th className="px-3 py-3 font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-[#d5dee8]/55 transition duration-200",
                          selected?.id === row.id && "bg-white/55",
                        )}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(row.id);
                              setDetailsOpen(true);
                            }}
                            className="font-semibold text-[#2f6fdb] transition duration-200 hover:text-[#1f5cc4]"
                          >
                            #{row.id}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">#{row.invoiceId}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12.5px] leading-5 text-slate-500">
                          <span className="block">{row.dateLabel}</span>
                          <span>{row.timeLabel}</span>
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-3 text-slate-600">{row.customer}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                          {row.itemsCount} item{row.itemsCount === 1 ? "" : "s"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">{row.method}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-[13.5px] font-semibold tracking-[-0.02em] text-navy">
                          {formatTzs(row.amount)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill value={row.status} />
                        </td>
                        <td className="px-4 py-3">
                          <RowActions
                            id={row.id}
                            open={menuId === row.id}
                            onToggle={() => setMenuId((current) => (current === row.id ? null : row.id))}
                            onClose={() => setMenuId(null)}
                            onView={() => {
                              setSelectedId(row.id);
                              setDetailsOpen(true);
                            }}
                            onPrint={() => printReturn(row)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 px-3 pb-4 xl:hidden">
                {filtered.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setDetailsOpen(true);
                    }}
                    className={cn(
                      "w-full rounded-[18px] border border-[#e6edf4] bg-white p-3.5 text-left shadow-[0_8px_18px_rgba(15,35,64,0.035)]",
                      selected?.id === row.id && "ring-1 ring-navy/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13.5px] font-semibold text-navy">#{row.id}</p>
                        <p className="mt-0.5 text-[12px] text-slate-400">#{row.invoiceId} · {row.customer}</p>
                      </div>
                      <StatusPill value={row.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[12.5px] text-slate-500">
                      <span>
                        {row.dateLabel} · {row.timeLabel}
                      </span>
                      <span className="font-semibold text-navy">{formatTzs(row.amount)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </article>

        {detailsOpen && selected ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[55] bg-navy/20 backdrop-blur-sm xl:hidden"
              aria-label="Close return details"
              onClick={() => setDetailsOpen(false)}
            />
            <ReturnDetails
              row={selected}
              sale={selectedSaleRecord}
              movements={movements.filter((item) => item.returnId === selected.id)}
              onClose={() => setDetailsOpen(false)}
              onPrint={() => printReturn(selected)}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

function WizardView({
  step,
  invoiceQuery,
  matches,
  sale,
  saleLabel,
  draft,
  refundMethod,
  provider,
  breakdown,
  error,
  onQuery,
  onChooseSale,
  onDraft,
  onMethod,
  onProvider,
  onBack,
  onCancel,
  onContinue,
  onProcess,
}: {
  step: 1 | 2 | 3;
  invoiceQuery: string;
  matches: SupermarketSale[];
  sale: SupermarketSale | null;
  saleLabel: "Refunded" | "Partially Refunded" | null;
  draft: DraftLine[];
  refundMethod: ReturnRefundMethod;
  provider: ReturnMobileProvider;
  breakdown: ReturnType<typeof refundBreakdown> | null;
  error: string;
  onQuery: (value: string) => void;
  onChooseSale: (sale: SupermarketSale) => void;
  onDraft: (name: string, patch: Partial<DraftLine>) => void;
  onMethod: (value: ReturnRefundMethod) => void;
  onProvider: (value: ReturnMobileProvider) => void;
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => void;
  onProcess: () => void;
}) {
  const selectedItems = draft.filter((line) => line.quantity > 0);
  const remainingAny = draft.some((line) => line.remaining > 0);
  const resellable = selectedItems.filter((line) => line.condition === "Resellable").reduce((sum, line) => sum + line.quantity, 0);
  const damaged = selectedItems.filter((line) => line.condition !== "Resellable").reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 transition hover:text-navy">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </button>
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
            {step === 1 ? "Find Original Sale" : step === 2 ? "Select Items" : "Return Summary"}
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
            {step === 1
              ? "Search the original invoice to start a professional return."
              : step === 2
                ? "Choose quantities, reasons and product condition. Refund totals update instantly."
                : "Review the return before processing the refund."}
          </p>
        </div>
        <p className="text-[12px] font-medium text-slate-400">Step {step} of 3</p>
      </div>

      {step === 1 ? (
        <section className={cn(glass, "p-4 sm:p-5")}>
          <label className="relative block max-w-xl">
            <span className="sr-only">Search invoice number</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={invoiceQuery}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search invoice number..."
              className={cn(control, "h-11 rounded-[16px] pl-10")}
              autoComplete="off"
            />
          </label>
          <div className="mt-4 space-y-2">
            {invoiceQuery.trim() && matches.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-400">No invoices match that search.</p>
            ) : (
              matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChooseSale(item)}
                  className="flex w-full flex-col rounded-[16px] border border-[#e6edf4] bg-white px-4 py-3 text-left transition hover:bg-[#f7f9fc] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="block text-[14px] font-semibold text-navy">#{item.id}</span>
                    <span className="mt-0.5 block text-[12.5px] text-slate-400">
                      {item.dateLabel} {item.timeLabel} · {item.customer} · {item.cashier}
                    </span>
                  </span>
                  <span className="mt-2 text-[13.5px] font-semibold text-navy sm:mt-0">{formatTzs(item.amount)}</span>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      {step === 2 && sale ? (
        <div className="space-y-4">
          <section className={cn(glass, "p-4 sm:p-5")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Original invoice</p>
                <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-navy">#{sale.id}</p>
              </div>
              {saleLabel ? <StatusPill value={saleLabel} /> : null}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
              <Info label="Date & Time" value={`${sale.dateLabel} ${sale.timeLabel}`} />
              <Info label="Customer" value={sale.customer} />
              <Info label="Cashier" value={sale.cashier} />
              <Info label="Payment Method" value={sale.payment} />
              <Info label="Original Total" value={formatTzs(sale.amount)} />
              <Info label="Items" value={String(sale.itemsCount)} />
            </dl>
          </section>

          <section className={cn(glass, "overflow-hidden")}>
            <div className="px-4 py-4 sm:px-5">
              <h2 className="text-[16px] font-semibold text-navy">Returned items</h2>
              {!remainingAny ? (
                <p className="mt-1 text-[12.5px] text-slate-400">All items from this invoice have already been returned.</p>
              ) : null}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Purchased Qty</th>
                    <th className="px-3 py-3 font-medium">Unit Price</th>
                    <th className="px-3 py-3 font-medium">Return Qty</th>
                    <th className="px-3 py-3 font-medium">Return Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.map((line) => (
                    <tr key={line.name} className="border-t border-[#e6edf4]">
                      <td className="px-4 py-3 font-medium text-navy">{line.name}</td>
                      <td className="px-3 py-3 text-slate-500">
                        {line.purchased}
                        {line.remaining < line.purchased ? (
                          <span className="ml-1 text-[11px] text-slate-400">({line.remaining} left)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{formatTzs(line.unitPrice)}</td>
                      <td className="px-3 py-3">
                        <QtyControl
                          value={line.quantity}
                          max={line.remaining}
                          onChange={(quantity) => onDraft(line.name, { quantity })}
                          label={line.name}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-navy">{formatTzs(line.quantity * line.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 px-4 pb-4 md:hidden">
              {draft.map((line) => (
                <div key={line.name} className="rounded-[16px] border border-[#e6edf4] p-3">
                  <p className="font-medium text-navy">{line.name}</p>
                  <p className="mt-1 text-[12px] text-slate-400">
                    Purchased {line.purchased}
                    {line.remaining < line.purchased ? ` · ${line.remaining} left` : ""} · {formatTzs(line.unitPrice)}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <QtyControl value={line.quantity} max={line.remaining} onChange={(quantity) => onDraft(line.name, { quantity })} label={line.name} />
                    <span className="text-[13px] font-semibold text-navy">{formatTzs(line.quantity * line.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3 border-t border-[#e6edf4] px-4 py-4 sm:px-5">
              {draft
                .filter((line) => line.quantity > 0)
                .map((line) => (
                  <div key={`${line.name}-meta`} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reason · {line.name}</span>
                      <select
                        value={line.reason}
                        onChange={(event) => onDraft(line.name, { reason: event.target.value as ReturnReason })}
                        className={control}
                      >
                        {RETURN_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Condition · {line.name}</span>
                      <select
                        value={line.condition}
                        onChange={(event) => onDraft(line.name, { condition: event.target.value as ReturnCondition })}
                        className={control}
                      >
                        {RETURN_CONDITIONS.map((condition) => (
                          <option key={condition} value={condition}>
                            {condition}
                          </option>
                        ))}
                      </select>
                    </label>
                    {line.reason === "Other" ? (
                      <label className="block sm:col-span-2">
                        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Additional Notes</span>
                        <input
                          value={line.notes}
                          onChange={(event) => onDraft(line.name, { notes: event.target.value })}
                          className={control}
                          placeholder="Add a short note"
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
            </div>
          </section>

          <section className={cn(glass, "p-4 sm:p-5")}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div>
                <p className="text-[13px] font-semibold text-navy">Refund Method</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RETURN_REFUND_METHODS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onMethod(item)}
                      className={cn(
                        "h-10 rounded-[12px] border text-[12.5px] font-medium transition",
                        refundMethod === item ? "border-[#0b2244] bg-[#0b2244] text-white" : "border-[#d8e1eb] bg-white text-navy hover:bg-[#f7f9fc]",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {refundMethod === "Mobile Money" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {RETURN_MOBILE_PROVIDERS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => onProvider(item)}
                        className={cn(
                          "h-9 rounded-[12px] border text-[12px] font-medium",
                          provider === item ? "border-[#0b2244] bg-[#0b2244] text-white" : "border-[#d8e1eb] bg-white text-navy",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {breakdown ? (
                <dl className="space-y-2 rounded-[16px] bg-[#f6f8fb] p-3.5 text-[13px]">
                  <div className="flex justify-between text-slate-500">
                    <dt>Original Sale Total</dt>
                    <dd className="text-navy">{formatTzs(breakdown.originalTotal)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <dt>Return Subtotal</dt>
                    <dd className="text-navy">{formatTzs(breakdown.returnSubtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <dt>Discount Adjustment</dt>
                    <dd className="text-navy">{formatTzs(breakdown.discountAdjustment)}</dd>
                  </div>
                  <div className="flex justify-between pt-1 text-[15px] font-semibold text-navy">
                    <dt>Refund Amount</dt>
                    <dd>{formatTzs(breakdown.refundAmount)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
            {error ? <p className="mt-3 text-[12.5px] text-[#c24646]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="h-10 rounded-full px-4 text-[13px] font-medium text-slate-500 hover:text-navy">
                Cancel
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex h-10 items-center rounded-[14px] bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {step === 3 && sale && breakdown ? (
        <section className={cn(glass, "p-4 sm:p-6")}>
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Return Summary</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Original Invoice" value={`#${sale.id}`} />
            <Info label="Items" value={String(selectedItems.reduce((sum, line) => sum + line.quantity, 0))} />
            <Info label="Refund Amount" value={formatTzs(breakdown.refundAmount)} />
            <Info label="Refund Method" value={refundMethod === "Mobile Money" ? `${refundMethod} · ${provider}` : refundMethod} />
          </dl>
          <div className="mt-4 rounded-[16px] bg-[#f6f8fb] p-3.5 text-[13px] text-slate-600">
            <p className="font-medium text-navy">Stock</p>
            <p className="mt-1">{resellable} item{resellable === 1 ? "" : "s"} returned to sellable stock</p>
            <p>{damaged} item{damaged === 1 ? "" : "s"} marked damaged or expired</p>
          </div>
          {error ? <p className="mt-3 text-[12.5px] text-[#c24646]">{error}</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} className="h-11 rounded-[14px] px-4 text-[13.5px] font-medium text-slate-500 hover:text-navy">
              Cancel
            </button>
            <button
              type="button"
              onClick={onProcess}
              className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#0b2244] px-5 text-[14px] font-semibold text-white"
            >
              Process Refund
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SuccessView({
  row,
  onPrint,
  onView,
  onNew,
}: {
  row: SupermarketReturn;
  onPrint: () => void;
  onView: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex min-h-[28rem] items-center justify-center">
      <div className={cn(glass, "w-full max-w-md px-6 py-10 text-center")}>
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f6ee] text-[#1f8a4c]">
          <Check className="h-7 w-7" strokeWidth={2.4} />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.04em] text-navy">Refund Completed</h1>
        <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Return</p>
        <p className="mt-1 text-[20px] font-semibold text-navy">#{row.id}</p>
        <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Original Invoice</p>
        <p className="mt-1 text-[16px] font-semibold text-navy">#{row.invoiceId}</p>
        <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Refund</p>
        <p className="mt-1 text-[22px] font-semibold text-navy">{formatTzs(row.amount)}</p>
        <div className="mt-8 flex flex-col gap-2">
          <button type="button" onClick={onPrint} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#d8e1eb] bg-white text-[13.5px] font-medium text-navy">
            <Printer className="h-4 w-4" />
            Print Return Receipt
          </button>
          <button type="button" onClick={onView} className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#0b2244] text-[13.5px] font-semibold text-white">
            View Return
          </button>
          <button type="button" onClick={onNew} className="inline-flex h-11 items-center justify-center rounded-[14px] text-[13.5px] font-medium text-slate-500 hover:text-navy">
            New Return
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnDetails({
  row,
  sale,
  movements,
  onClose,
  onPrint,
}: {
  row: SupermarketReturn;
  sale: SupermarketSale | null;
  movements: ReturnStockMovement[];
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <aside className={cn(glass, "flex min-h-[min(560px,65vh)] min-w-0 flex-col overflow-y-auto p-4 sm:p-5 max-xl:fixed max-xl:inset-x-3 max-xl:bottom-3 max-xl:top-20 max-xl:z-[60] xl:relative")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Return details</p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-navy">#{row.id}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-[12.5px] font-medium text-slate-400 hover:text-navy">
          Close
        </button>
      </div>
      <div className="mt-3">
        <StatusPill value={row.status} />
      </div>
      <dl className="mt-4 space-y-3 text-[13px]">
        <Info label="Original Invoice" value={`#${row.invoiceId}`} />
        <Info label="Date & Time" value={`${row.dateLabel} ${row.timeLabel}`} />
        <Info label="Customer" value={row.customer} />
        <Info label="Cashier" value={row.cashier} />
        <Info label="Refund Method" value={row.provider ? `${row.method} · ${row.provider}` : row.method} />
        <Info label="Return Status" value={row.status} />
      </dl>
      <div className="mt-5">
        <p className="text-[13px] font-semibold text-navy">Returned Items</p>
        <ul className="mt-2 space-y-2.5">
          {row.items.map((item) => (
            <li key={`${item.name}-${item.condition}`} className="rounded-[14px] bg-[#f6f8fb] px-3 py-2.5">
              <p className="text-[13px] font-medium text-navy">{item.name}</p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {item.quantity} × {formatTzs(item.unitPrice)}
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">Refund: {formatTzs(returnLineAmount(item))}</p>
              <p className="mt-0.5 text-[12px] text-slate-400">Condition: {item.condition} · {item.reason}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-[15px] font-semibold text-navy">Total Refund {formatTzs(row.amount)}</p>
      <div className="mt-4">
        <p className="text-[13px] font-semibold text-navy">Stock Action</p>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-slate-500">
          {row.items.map((item) => (
            <li key={`${item.name}-stock`}>{stockActionLabel(item)}</li>
          ))}
        </ul>
        {movements.filter((item) => item.sellable).length > 0 ? (
          <ul className="mt-2 space-y-1 text-[11.5px] text-slate-400">
            {movements
              .filter((item) => item.sellable)
              .map((item) => (
                <li key={item.id}>
                  {item.reference} · {item.product} +{item.quantity} · {item.reason}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
      {sale ? (
        <p className="mt-3 text-[12px] text-slate-400">Original sale remains on record · {formatTzs(sale.amount)}</p>
      ) : null}
      <button
        type="button"
        onClick={onPrint}
        className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-[14px] border border-[#d8e1eb] bg-white text-[13px] font-medium text-navy"
      >
        <Printer className="h-4 w-4" />
        Print Return Receipt
      </button>
    </aside>
  );
}

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
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 240 });
  const [draft, setDraft] = useState(range);
  const panelOpen = menuOpen || rangeOpen;

  useEffect(() => {
    setMounted(true);
  }, []);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(240, rect.width);
    setCoords({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
    });
  }

  useEffect(() => {
    if (!panelOpen) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [panelOpen]);

  return (
    <div className="relative min-w-0 lg:w-auto lg:min-w-[12.5rem]">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        onClick={() => {
          place();
          setRangeOpen(false);
          setMenuOpen((open) => !open);
        }}
        className={cn(filterClass, "inline-flex items-center justify-between gap-2 pr-3 text-left")}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", panelOpen && "rotate-180")} />
      </button>
      {mounted && panelOpen
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[79]"
                aria-label="Close period menu"
                onClick={() => {
                  setMenuOpen(false);
                  setRangeOpen(false);
                }}
              />
              {menuOpen ? (
                <div
                  className="fixed z-[80] overflow-hidden rounded-[16px] border border-white/80 bg-white/92 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                  style={{ top: coords.top, left: coords.left, width: coords.width }}
                  role="listbox"
                  aria-label="Return period"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onPreset(option.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-navy hover:bg-navy/[0.04]",
                        preset === option.id && "bg-navy/[0.05] font-medium",
                      )}
                    >
                      {option.label}
                      {preset === option.id ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                  <div className="mx-3 my-1 h-px bg-[#d5dee8]/80" />
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(range);
                      setMenuOpen(false);
                      setRangeOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-navy hover:bg-navy/[0.04]"
                  >
                    <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
                    Date Range...
                  </button>
                </div>
              ) : null}
              {rangeOpen ? (
                <div
                  className="fixed z-[80] w-[min(22rem,calc(100vw-16px))] rounded-[20px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_50px_rgba(16,24,40,0.16)] backdrop-blur-xl"
                  style={{ top: coords.top, left: coords.left }}
                >
                  <p className="text-[13px] font-semibold text-navy">Date Range</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-[12px] font-medium text-slate-500">
                      From
                      <input
                        type="date"
                        value={draft.from}
                        onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                        className={cn(filterClass, "mt-1.5 rounded-[14px]")}
                      />
                    </label>
                    <label className="block text-[12px] font-medium text-slate-500">
                      To
                      <input
                        type="date"
                        value={draft.to}
                        onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                        className={cn(filterClass, "mt-1.5 rounded-[14px]")}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setRangeOpen(false)} className="h-9 px-3 text-[13px] text-slate-500">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!draft.from || !draft.to) return;
                        const from = draft.from <= draft.to ? draft.from : draft.to;
                        const to = draft.from <= draft.to ? draft.to : draft.from;
                        onRange({ from, to });
                        onPreset("range");
                        setRangeOpen(false);
                      }}
                      className="h-9 rounded-full bg-[#0b2244] px-3.5 text-[13px] font-medium text-white"
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

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: KpiTone;
}) {
  const accent = KPI_TONES[tone];
  return (
    <article className={cn("flex min-w-0 items-center gap-3 rounded-[22px] border px-3 py-3.5 shadow-[0_8px_24px_rgba(15,35,64,0.04)] backdrop-blur-xl sm:px-4", accent.card)}>
      <span className={cn("relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-md", accent.orb)}>
        <span className={cn("pointer-events-none absolute inset-[1px] rounded-full", accent.tint)} />
        <Icon className={cn("relative h-5 w-5", accent.icon)} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[18px] font-semibold tracking-[-0.04em] text-navy sm:text-[20px]">{value}</p>
      </div>
    </article>
  );
}

function StatusPill({ value }: { value: ReturnStatus | "Refunded" | "Partially Refunded" }) {
  const tone =
    value === "Refunded"
      ? "bg-emerald-50/80 text-emerald-700"
      : value === "Pending"
        ? "bg-amber-50/80 text-amber-700"
        : value === "Approved"
          ? "bg-sky-50/80 text-sky-700"
          : value === "Rejected"
            ? "bg-rose-50/80 text-rose-600"
            : "bg-violet-50/80 text-violet-700";
  return <span className={cn("inline-flex rounded-full px-2.5 py-[3px] text-[12px] font-medium", tone)}>{value}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</dt>
      <dd className="mt-1 text-navy">{value}</dd>
    </div>
  );
}

function QtyControl({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="flex h-8 w-[5.8rem] items-center justify-between rounded-full border border-[#d8e1eb] bg-white px-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-navy disabled:opacity-30"
      >
        −
      </button>
      <span className="w-5 text-center text-[12.5px] font-semibold">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-navy disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function RowActions({
  id,
  open,
  onToggle,
  onClose,
  onView,
  onPrint,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onView: () => void;
  onPrint: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${id}`}
        aria-expanded={open}
        onClick={onToggle}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-white/85 text-slate-400 hover:text-navy"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open
        ? createPortal(
            <>
              <button type="button" className="fixed inset-0 z-[79]" aria-label="Close actions" onClick={onClose} />
              <div
                className="fixed z-[80] w-44 overflow-hidden rounded-[16px] border border-white/80 bg-white/90 py-1 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                style={{ top: coords.top, right: coords.right }}
              >
                <button type="button" className="block w-full px-3.5 py-2 text-left text-[13px] text-navy hover:bg-navy/[0.04]" onClick={() => { onView(); onClose(); }}>
                  View Details
                </button>
                <button type="button" className="block w-full px-3.5 py-2 text-left text-[13px] text-navy hover:bg-navy/[0.04]" onClick={() => { onPrint(); onClose(); }}>
                  Print Receipt
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
